import { context } from "@actions/github"
import {
  Context,
  Data,
  Effect,
  Layer,
  Order,
  ReadonlyArray,
  Sink,
  Stream,
  pipe,
} from "effect"
import { Github } from "./Github"
import { RunnerEnv, RunnerEnvLive } from "./Runner"

export class NoPullRequest extends Data.TaggedError("NoPullRequest") {}

const make = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const github = yield* _(Github)
  const find = (options: { readonly base: string; readonly head: string }) =>
    github.streamWith(
      (_, page) =>
        _.search.issuesAndPullRequests({
          page,
          q: `repo:${env.repo.full_name}+base:${options.base}+head:${options.head}+state:open+is:pr`,
        }),
      _ => _.items,
    )
  const findFirst = (options: {
    readonly base: string
    readonly head: string
  }) => find(options).pipe(Stream.run(Sink.head()), Effect.flatten)

  const create = github.wrap(_ => _.pulls.create)
  const update_ = github.wrap(_ => _.pulls.update)
  const update = (
    options: Omit<Parameters<typeof update_>[0], "owner" | "repo">,
  ) =>
    update_({
      ...options,
      owner: env.repo.owner.login,
      repo: env.repo.name,
    } as any)

  const upsert = (options: {
    readonly base: string
    readonly head: string
    readonly title: string
    readonly body: string
  }) =>
    Effect.matchEffect(findFirst(options), {
      onFailure: () =>
        create({
          owner: env.repo.owner.login,
          repo: env.repo.name,
          title: options.title,
          body: options.body,
          head: options.head,
          base: options.base,
        }),
      onSuccess: pull =>
        update({
          pull_number: pull.number,
          title: options.title,
          body: options.body,
          head: options.head,
          base: options.base,
        }),
    })

  const getPull = github.wrap(_ => _.pulls.get)
  const current = yield* _(
    env.issue,
    Effect.flatMap(issue =>
      getPull({
        owner: env.repo.owner.login,
        repo: env.repo.name,
        pull_number: issue.number,
      }),
    ),
    Effect.mapError(() => new NoPullRequest()),
    Effect.cached,
  )

  const files = (options: {
    readonly owner: string
    readonly repo: string
    readonly pull_number: number
  }) =>
    github.stream((_, page) =>
      _.pulls.listFiles({
        ...options,
        page,
      }),
    )

  const currentFiles = current.pipe(
    Effect.map(issue =>
      files({
        owner: env.repo.owner.login,
        repo: env.repo.name,
        pull_number: issue.number,
      }),
    ),
    Stream.unwrap,
  )

  const setCurrentBase = (base: string) =>
    current.pipe(
      Effect.andThen(pull =>
        update({
          pull_number: pull.number,
          base,
        }),
      ),
    )

  const addLabels = github.wrap(_ => _.issues.addLabels)
  const addCurrentLabels = (labels: Array<string>) =>
    Effect.andThen(current, pull =>
      addLabels({
        owner: env.repo.owner.login,
        repo: env.repo.name,
        issue_number: pull.number,
        labels,
      }),
    )

  const comment = github.wrap(_ => _.issues.createComment)
  const currentComment = (body: string) =>
    Effect.flatMap(current, pull =>
      comment({
        owner: env.repo.owner.login,
        repo: env.repo.name,
        issue_number: pull.number,
        body,
      }),
    )

  const listForCommit = github.wrap(
    _ => _.repos.listPullRequestsAssociatedWithCommit,
  )
  const getCommit = github.wrap(_ => _.repos.getCommit)
  const fromCommitMessage = (sha: string) =>
    getCommit({
      owner: env.repo.owner.login,
      repo: env.repo.name,
      ref: sha,
    }).pipe(
      Effect.flatMap(commit =>
        Effect.partition(
          commit.commit.message.matchAll(/#(\d+)/g),
          ([, number]) =>
            getPull({
              owner: env.repo.owner.login,
              repo: env.repo.name,
              pull_number: Number(number),
            }),
          { concurrency: 3 },
        ),
      ),
      Effect.map(([, pulls]) => pulls),
    )
  const forCommit = (sha: string) =>
    Effect.all(
      [
        listForCommit({
          owner: env.repo.owner.login,
          repo: env.repo.name,
          commit_sha: sha,
        }),
        fromCommitMessage(sha),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.map(_ => _.flat()))

  return {
    find,
    findFirst,
    upsert,
    update,
    current,
    files,
    currentFiles,
    setCurrentBase,
    addCurrentLabels,
    currentComment,
    forCommit,
  } as const
})

export interface PullRequests {
  readonly _: unique symbol
}
export const PullRequests = Context.Tag<
  PullRequests,
  Effect.Effect.Success<typeof make>
>("app/PullRequests")
export const PullRequestsLive = Layer.effect(PullRequests, make).pipe(
  Layer.provide(RunnerEnvLive),
)

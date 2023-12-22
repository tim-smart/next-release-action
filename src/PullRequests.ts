import { Context, Effect, Layer, Sink, Stream } from "effect"
import { Github } from "./Github"
import { RunnerEnv, RunnerEnvLive } from "./Runner"
import { context } from "@actions/github"

const make = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const github = yield* _(Github)
  const find = (options: {
    readonly repo: string
    readonly base: string
    readonly head: string
  }) =>
    github.streamItems((_, page) =>
      _.search.issuesAndPullRequests({
        page,
        q: `repo:${options.repo}+base:${options.base}+head:${options.head}+state:open+is:pull-request`,
      }),
    )
  const findFirst = (options: {
    readonly repo: string
    readonly base: string
    readonly head: string
  }) => find(options).pipe(Stream.run(Sink.head()), Effect.flatten)

  const create = github.wrap(_ => _.pulls.create)
  const update = github.wrap(_ => _.pulls.update)

  const upsert = (options: {
    readonly owner: string
    readonly repo: string
    readonly base: string
    readonly head: string
    readonly title: string
    readonly body: string
  }) =>
    Effect.matchEffect(findFirst(options), {
      onFailure: () =>
        create({
          owner: options.owner,
          repo: options.repo,
          title: options.title,
          body: options.body,
          head: options.head,
          base: options.base,
        }),
      onSuccess: pull =>
        update({
          owner: options.owner,
          repo: options.repo,
          pull_number: pull.number,
          title: options.title,
          body: options.body,
          head: options.head,
          base: options.base,
        }),
    })

  const current = Effect.fromNullable(context.payload.pull_request)

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

  const currentFiles = env.issue.pipe(
    Effect.map(issue =>
      files({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
      }),
    ),
    Stream.unwrap,
  )

  const setCurrentBase = (base: string) =>
    current.pipe(
      Effect.andThen(pull =>
        update({
          owner: pull.owner,
          repo: pull.repo,
          pull_number: pull.number,
          base,
        }),
      ),
    )

  const comment = github.wrap(_ => _.issues.createComment)
  const currentComment = (body: string) =>
    Effect.flatMap(current, pull =>
      comment({
        owner: pull.owner,
        repo: pull.repo,
        issue_number: pull.number,
        body,
      }),
    )

  return {
    find,
    findFirst,
    upsert,
    current,
    files,
    currentFiles,
    setCurrentBase,
    currentComment,
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

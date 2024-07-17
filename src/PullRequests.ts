import { Context, Data, Effect, Layer, Option, Sink, Stream } from "effect"
import { Github } from "./Github"
import { RunnerEnv } from "./Runner"

export class NoPullRequest extends Data.TaggedError("NoPullRequest") {}

const make = Effect.gen(function* () {
  const env = yield* RunnerEnv
  const github = yield* Github
  const get = github.wrap(_ => _.pulls.get)
  const find = (options: { readonly base: string; readonly head?: string }) =>
    github
      .streamWith(
        (_, page) =>
          _.search.issuesAndPullRequests({
            page,
            q: [
              `repo:${env.repo.full_name}`,
              `base:${options.base}`,
              ...(options.head ? [`head:${options.head}`] : []),
              `state:open`,
              `is:pr`,
            ].join("+"),
          }),
        _ => _.items,
      )
      .pipe(
        Stream.mapEffect(issue =>
          get({
            owner: env.repo.owner.login,
            repo: env.repo.name,
            pull_number: issue.number,
          }),
        ),
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
  const current = yield* env.issue.pipe(
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

  const getCommit = github.wrap(_ => _.repos.getCommit)
  const forCommit = (sha: string) =>
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

export class PullRequests extends Context.Tag("app/PullRequests")<
  PullRequests,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(PullRequests, make).pipe(
    Layer.provide(RunnerEnv.Live),
  )
}

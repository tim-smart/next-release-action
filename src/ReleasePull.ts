import { Effect, Order, ReadonlyArray, Stream, pipe } from "effect"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"
import { Github } from "./Github"

export const run = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const prefix = yield* _(Config.prefix)
  const eligibleBranches = [`${prefix}-major`, `${prefix}-minor`]

  if (!eligibleBranches.includes(env.ref)) {
    return
  }

  const head = env.ref
  const base = head.endsWith("-major")
    ? `${prefix}-minor`
    : yield* _(Config.baseBranch)
  const changeType = head.endsWith("-major") ? "major" : "minor"
  const pulls = yield* _(PullRequests)
  const body = yield* _(pullBody(base, head))
  yield* _(
    pulls.upsert({
      head,
      base,
      title: `Release queue: ${changeType}`,
      body,
    }),
  )
})

const pullBody = (base: string, head: string) =>
  Effect.gen(function* (_) {
    const related = yield* _(
      diffPulls(base, head),
      Stream.runCollect,
      Effect.map(pulls =>
        pipe(
          pulls,
          ReadonlyArray.dedupeWith((a, b) => a.number === b.number),
          ReadonlyArray.sort(Order.struct({ number: Order.number })),
        ),
      ),
    )

    const listItems = related.map(pull => `- #${pull.number}`).join("\n")

    return `Contains the following pull requests:\n\n${listItems}`
  })

const diffPulls = (base: string, head: string) =>
  Effect.gen(function* (_) {
    const pulls = yield* _(PullRequests)
    const currentNumber = yield* _(
      pulls.current,
      Effect.map(_ => _.number),
      Effect.orElseSucceed(() => 0),
    )
    return diffCommits(base, head).pipe(
      Stream.mapEffect(commit => pulls.forCommit(commit.sha)),
      Stream.flattenIterables,
      Stream.filter(_ => _.number !== currentNumber),
    )
  }).pipe(Stream.unwrap)

const diffCommits = (base: string, head: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(RunnerEnv)
    const github = yield* _(Github)
    return github.streamWith(
      (_, page) =>
        _.repos.compareCommits({
          owner: env.repo.owner.login,
          repo: env.repo.name,
          base: base,
          head,
          page,
        }),
      _ => _.commits,
    )
  }).pipe(Stream.unwrap)

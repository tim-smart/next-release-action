import { Effect, Order, Array, Stream, pipe } from "effect"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"
import { Github } from "./Github"
import { Git } from "./Git"

export const run = Effect.gen(function* () {
  const env = yield* RunnerEnv
  const prefix = yield* Config.prefix
  const eligibleBranches = [`${prefix}-major`, `${prefix}-minor`]

  if (!eligibleBranches.includes(env.ref)) {
    return
  }

  const head = env.ref
  const base = head.endsWith("-major")
    ? `${prefix}-minor`
    : yield* Config.baseBranch

  const git = yield* Git.pipe(Effect.flatMap(_ => _.open(".")))
  const headSha = yield* git.run(_ =>
    _.fetch("origin").revparse(`origin/${head}`),
  )
  const baseSha = yield* git.run(_ => _.revparse(`origin/${base}`))
  if (headSha === baseSha) return

  const changeType = head.endsWith("-major") ? "major" : "minor"
  const pulls = yield* PullRequests
  const body = yield* pullBody(base, head)
  yield* pulls.upsert({
    head,
    base,
    title: `Release queue: ${changeType}`,
    body,
  })
})

const pullBody = (base: string, head: string) =>
  Effect.gen(function* () {
    const related = yield* diffPulls(base, head).pipe(
      Stream.runCollect,
      Effect.map(pulls =>
        pipe(
          pulls,
          Array.dedupeWith((a, b) => a.number === b.number),
          Array.sort(Order.struct({ number: Order.number })),
        ),
      ),
    )

    const listItems = related.map(pull => `- #${pull.number}`).join("\n")

    return `Contains the following pull requests:\n\n${listItems}`
  })

const diffPulls = (base: string, head: string) =>
  Effect.gen(function* () {
    const pulls = yield* PullRequests
    const currentNumber = yield* pulls.current.pipe(
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
  Effect.gen(function* () {
    const env = yield* RunnerEnv
    const github = yield* Github
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

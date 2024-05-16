import { Effect, Stream } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"

export const run = Effect.gen(function* () {
  const git = yield* Git.pipe(Effect.flatMap(_ => _.open(".")))
  const prefix = yield* Config.prefix
  const base = yield* Config.baseBranch

  yield* Effect.log(`rebasing ${prefix}-major on ${prefix}-minor`)
  yield* git
    .run(_ =>
      _.fetch("origin")
        .checkout(`${prefix}-minor`)
        .checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push(["--force"]),
    )
    .pipe(Effect.catchAllCause(Effect.log))

  yield* Effect.log(`rebasing ${prefix}-minor on ${base}`)
  yield* git
    .run(_ =>
      _.checkout(base)
        .checkout(`${prefix}-minor`)
        .rebase([base])
        .push(["--force"]),
    )
    .pipe(Effect.catchAllCause(Effect.log))

  yield* Effect.log(`rebasing ${prefix}-major on ${prefix}-minor`)
  yield* git
    .run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push(["--force"]),
    )
    .pipe(Effect.catchAllCause(Effect.log))

  const pulls = yield* PullRequests
  const env = yield* RunnerEnv

  yield* pulls.find({ base: `${prefix}-minor` }).pipe(
    Stream.filter(pull => pull.head.repo!.full_name === env.repo.full_name),
    Stream.runForEach(pull =>
      Effect.gen(function* (_) {
        yield* Effect.log(`rebasing ${pull.head.ref} on ${prefix}-minor`)
        yield* git.run(_ =>
          _.checkout(pull.head.ref)
            .rebase([`${prefix}-minor`])
            .push(["--force"]),
        )
      }).pipe(Effect.catchAllCause(Effect.log)),
    ),
  )

  yield* pulls.find({ base: `${prefix}-major` }).pipe(
    Stream.filter(pull => pull.head.repo!.full_name === env.repo.full_name),
    Stream.runForEach(pull =>
      Effect.gen(function* (_) {
        yield* Effect.log(`rebasing ${pull.head.ref} on ${prefix}-major`)
        yield* git.run(_ =>
          _.checkout(pull.head.ref)
            .rebase([`${prefix}-major`])
            .push(["--force"]),
        )
      }).pipe(Effect.catchAllCause(Effect.log)),
    ),
  )
})

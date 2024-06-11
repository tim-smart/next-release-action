import { Effect, Stream } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"
import { Command } from "@effect/platform"

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

  yield* pulls.find({ base: `${prefix}-minor` }).pipe(
    Stream.runForEach(pull =>
      Effect.gen(function* (_) {
        yield* Effect.log(`rebasing #${pull.number} on ${prefix}-minor`)
        yield* Command.make(
          "gh",
          "pr",
          "checkout",
          pull.number.toString(),
        ).pipe(Command.exitCode)
        yield* git.run(_ => _.rebase([`${prefix}-minor`]).push(["--force"]))
      }).pipe(Effect.catchAllCause(Effect.log)),
    ),
  )

  yield* pulls.find({ base: `${prefix}-major` }).pipe(
    Stream.runForEach(pull =>
      Effect.gen(function* (_) {
        yield* Effect.log(`rebasing #${pull.number} on ${prefix}-major`)
        yield* Command.make(
          "gh",
          "pr",
          "checkout",
          pull.number.toString(),
        ).pipe(Command.exitCode)
        yield* git.run(_ => _.rebase([`${prefix}-major`]).push(["--force"]))
      }).pipe(Effect.catchAllCause(Effect.log)),
    ),
  )
})

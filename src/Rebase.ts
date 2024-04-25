import { Effect } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"

export const run = Effect.gen(function* () {
  const git = yield* Git.pipe(Effect.flatMap(_ => _.open(".")))
  const prefix = yield* Config.prefix
  const base = yield* Config.baseBranch

  yield git.run(_ => _.fetch("origin").checkout(base))

  yield git
    .run(_ => _.checkout(`${prefix}-minor`).rebase([base]).push(["--force"]))
    .pipe(Effect.catchAllCause(Effect.log))

  yield git
    .run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push(["--force"]),
    )
    .pipe(Effect.catchAllCause(Effect.log))
})

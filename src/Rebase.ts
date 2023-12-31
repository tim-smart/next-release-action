import { Effect } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"

export const run = Effect.gen(function* (_) {
  const git = yield* _(
    Git,
    Effect.flatMap(_ => _.open(".")),
  )
  const prefix = yield* _(Config.prefix)
  const base = yield* _(Config.baseBranch)

  yield* _(git.run(_ => _.fetch("origin").checkout(base)))

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-minor`).rebase([base]).push(["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push(["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )
})

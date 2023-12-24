import { Effect } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"

export const run = Effect.gen(function* (_) {
  const git = yield* _(
    Git,
    Effect.flatMap(_ => _.open(".")),
  )
  const prefix = yield* _(Config.prefix)

  yield* _(git.run(_ => _.fetch("origin")))
  const head = yield* _(git.run(_ => _.revparse(["HEAD"])))

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-minor`)
        .rebase([head])
        .push("origin", `${prefix}-minor`, ["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push("origin", `${prefix}-major`, ["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )
})

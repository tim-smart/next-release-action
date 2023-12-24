import { Effect } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"

export const run = Effect.gen(function* (_) {
  const git = yield* _(
    Git,
    Effect.flatMap(_ => _.open(".")),
  )
  const base = yield* _(Config.baseBranch)
  const prefix = yield* _(Config.prefix)

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-minor`)
        .rebase([base])
        .push("origin", `${prefix}-minor`, ["--force"]),
    ),
  )

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push("origin", `${prefix}-major`, ["--force"]),
    ),
  )
})
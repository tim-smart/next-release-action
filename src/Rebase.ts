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
  const head = yield* _(git.run(_ => _.revparse(["HEAD"])))
  console.log("HEAD", head)

  yield* _(
    git.run(_ => _.checkout(`${prefix}-minor`)),
    Effect.catchAllCause(Effect.log),
  )
  console.log("HEAD", yield* _(git.run(_ => _.revparse(["HEAD"]))))

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push("origin", `${prefix}-major`, ["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )
})

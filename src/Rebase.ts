import { Effect, Option } from "effect"
import { Git } from "./Git"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"

export const run = Effect.gen(function* (_) {
  const git = yield* _(
    Git,
    Effect.flatMap(_ => _.open(".")),
  )
  const pulls = yield* _(PullRequests)
  const prefix = yield* _(Config.prefix)
  const base = yield* _(Config.baseBranch)

  const minorPull = yield* _(
    pulls.findFirst({
      base,
      head: `${prefix}-minor`,
    }),
    Effect.optionFromOptional,
  )
  if (Option.isSome(minorPull)) {
    return
  }

  yield* _(git.run(_ => _.fetch("origin").checkout(base)))

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-minor`).rebase([base]).push(["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )

  const majorPull = yield* _(
    pulls.findFirst({
      base,
      head: `${prefix}-major`,
    }),
    Effect.optionFromOptional,
  )
  if (Option.isSome(majorPull)) {
    return
  }

  yield* _(
    git.run(_ =>
      _.checkout(`${prefix}-major`)
        .rebase([`${prefix}-minor`])
        .push(["--force"]),
    ),
    Effect.catchAllCause(Effect.log),
  )
})

import { Console, Effect } from "effect"
import * as Config from "./Config"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"

export const run = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const prefix = yield* _(Config.prefix)
  const eligibleBranches = [
    `refs/heads/${prefix}-major`,
    `refs/heads/${prefix}-minor`,
  ]

  if (!eligibleBranches.includes(env.ref)) {
    return yield* _(Console.log("Not a release branch"))
  }

  const head = env.ref.replace("refs/heads/", "")
  const base = head.endsWith("-major")
    ? `${prefix}-minor`
    : yield* _(Config.baseBranch)
  const changeType = head.endsWith("-major") ? "major" : "minor"
  const pulls = yield* _(PullRequests)
  const pull = yield* _(
    pulls.upsert({
      head,
      base,
      title: `Release queue: ${changeType}`,
      body: "",
    }),
  )
  const body = yield* _(pullBody(pull.number))
  yield* _(
    pulls.update({
      pull_number: pull.number,
      body,
    }),
  )
})

const pullBody = (number: number) =>
  Effect.gen(function* (_) {
    const pulls = yield* _(PullRequests)
    const related = yield* _(pulls.related(number))

    const listItems = related.map(pull => `- #${pull.number}`).join("\n")

    return `Contains the following pull requests:\n\n${listItems}`
  })

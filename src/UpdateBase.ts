import { Console, Effect, Option } from "effect"
import { Changesets } from "./Changesets"
import * as Config from "./Config"
import { NoPullRequest, PullRequests } from "./PullRequests"
import { Github } from "./Github"

export const run = Effect.gen(function* (_) {
  const pulls = yield* _(PullRequests)
  const pull = yield* _(pulls.current)
  const prefix = yield* _(Config.prefix)

  if (pull.head.ref.startsWith(`${prefix}-`)) {
    return yield* _(new NoPullRequest())
  }

  const changesets = yield* _(Changesets)
  const packages = yield* _(Config.packages)
  const changeTypeOption = yield* _(
    changesets.currentMaxType(packages),
    Effect.map(Option.filter((_): _ is "major" | "minor" => _ !== "patch")),
  )
  if (Option.isNone(changeTypeOption)) {
    return yield* _(Console.log("Not a minor or major change"))
  }

  const changeType = changeTypeOption.value
  const targetBase = `${prefix}-${changeType}`
  const currentBase = pull.base.ref as string

  if (currentBase === targetBase) {
    return yield* _(Console.log("No update needed"))
  }

  yield* _(pulls.setCurrentBase(targetBase))
  yield* _(Console.log(`Updated base to ${targetBase}`))
}).pipe(
  Effect.catchIf(
    error => error._tag === "GithubError" && error.reason.status === 403,
    () => createMaintainerComment,
  ),
)

const createMaintainerComment = Effect.gen(function* (_) {
  const github = yield* _(Github)
  const pulls = yield* _(PullRequests)
  const pull = yield* _(pulls.current)
  const createComment = github.wrap(_ => _.issues.createComment)
  yield* _(
    createComment({
      owner: pull.base.repo.owner.login,
      repo: pull.base.repo.name,
      issue_number: pull.number,
      body: "A maintainer needs to comment with `/approve` to update the base branch.",
    }),
  )
})

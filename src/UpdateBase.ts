import { Console, Effect, Option } from "effect"
import { Changesets } from "./Changesets"
import * as Config from "./Config"
import { NoPullRequest, PullRequests } from "./PullRequests"
import { Github } from "./Github"
import { RunnerEnv } from "./Runner"

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

  if (changeType === "major") {
    yield* _(ensureBranchFor("minor"))
  }
  yield* _(ensureBranchFor(changeType))

  yield* _(pulls.setCurrentBase(targetBase))
  yield* _(pulls.addCurrentLabels([targetBase]))
  yield* _(Console.log(`Updated base to ${targetBase}`))
})

const getBranch = (branch: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(RunnerEnv)
    const github = yield* _(Github)
    const getBranch = github.wrap(_ => _.repos.getBranch)
    return yield* _(
      getBranch({
        owner: env.repo.owner.login,
        repo: env.repo.name,
        branch,
      }),
    )
  })

const getDefaultBranch = Effect.flatMap(Config.baseBranch, getBranch)

const ensureBranchFor = (changeType: "major" | "minor") =>
  Effect.gen(function* (_) {
    const env = yield* _(RunnerEnv)
    const github = yield* _(Github)
    const prefix = yield* _(Config.prefix)

    const baseBranch =
      changeType === "minor"
        ? yield* _(getDefaultBranch)
        : yield* _(getBranch(`${prefix}-minor`))
    const sha = baseBranch.commit.sha
    const ref = `${prefix}-${changeType}`

    const createBranch = github.wrap(_ => _.git.createRef)
    const create = createBranch({
      owner: env.repo.owner.login,
      repo: env.repo.name,
      ref: `refs/heads/${ref}`,
      sha,
    })

    yield* _(
      getBranch(ref),
      Effect.catchIf(
        e => e.reason.status === 404,
        _ => create,
      ),
    )
  })

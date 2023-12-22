import { Effect } from "effect"
import { RunnerEnv } from "./Runner"
import * as Config from "./Config"
import { Github } from "./Github"

export const run = Effect.gen(function* (_) {
  yield* _(ensureBranch("minor"))
  yield* _(ensureBranch("major"))
})

const ensureBranch = (changeType: "major" | "minor") =>
  Effect.gen(function* (_) {
    const env = yield* _(RunnerEnv)
    const github = yield* _(Github)
    const prefix = yield* _(Config.prefix)

    const baseBranch = yield* _(getDefaultBranch)
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

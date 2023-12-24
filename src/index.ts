import { runMain } from "@effect/platform-node/Runtime"
import { Config, ConfigProvider, Console, Effect, Layer, Option } from "effect"
import { ChangesetsLive } from "./Changesets"
import * as Github from "./Github"
import { PullRequestsLive } from "./PullRequests"
import { RunnerEnv, RunnerEnvLive } from "./Runner"
import * as UpdateBase from "./UpdateBase"
import { inputSecret, nonEmptyString } from "./utils/config"
import * as ReleasePull from "./ReleasePull"
import * as ActionConfig from "./Config"
import * as Git from "./Git"
import * as Rebase from "./Rebase"

const GithubLive = Github.layer({
  token: inputSecret("github_token"),
})

const GitLive = Git.layer({
  userName: nonEmptyString("github_actor"),
  userEmail: nonEmptyString("github_actor").pipe(
    Config.map(_ => `${_}@users.noreply.github.com`),
  ),
  simpleGit: Config.succeed({}),
})

const ConfigLive = ConfigProvider.fromEnv().pipe(
  ConfigProvider.constantCase,
  Layer.setConfigProvider,
)

const main = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const baseBranch = yield* _(ActionConfig.baseBranch)
  const prefix = yield* _(ActionConfig.prefix)
  const eligibleBranches = [
    `refs/heads/${prefix}-major`,
    `refs/heads/${prefix}-minor`,
  ]

  if (eligibleBranches.includes(env.ref)) {
    yield* _(ReleasePull.run)
  } else if (Option.isSome(env.pull)) {
    yield* _(
      UpdateBase.run,
      Effect.catchTags({
        NoPullRequest: () => Console.log("No pull request found"),
      }),
    )
  } else if (env.ref === `refs/heads/${baseBranch}`) {
    yield* _(Rebase.run)
  }
}).pipe(
  Effect.tapErrorTag("GithubError", error => Console.error(error.reason)),
  Effect.provide(
    Layer.mergeAll(
      ChangesetsLive,
      PullRequestsLive,
      RunnerEnvLive,
      GitLive,
    ).pipe(Layer.provideMerge(GithubLive), Layer.provide(ConfigLive)),
  ),
)

runMain(main)

import { runMain } from "@effect/platform-node/Runtime"
import { ConfigProvider, Console, Effect, Layer } from "effect"
import { ChangesetsLive } from "./Changesets"
import * as Github from "./Github"
import { PullRequestsLive } from "./PullRequests"
import { RunnerEnvLive } from "./Runner"
import * as UpdateBase from "./UpdateBase"
import { inputSecret } from "./utils/config"
import * as ReleasePull from "./ReleasePull"

// // Setup the Git client layer
// const GitLive = Git.layer({
//   userName: nonEmptyString("github_actor"),
//   userEmail: nonEmptyString("github_actor").pipe(
//     Config.map(_ => `${_}@users.noreply.github.com`),
//   ),
//   simpleGit: Config.succeed({}),
// })

// Setup the Github API
const GithubLive = Github.layer({
  token: inputSecret("github_token"),
})

const ConfigLive = ConfigProvider.fromEnv().pipe(
  ConfigProvider.constantCase,
  Layer.setConfigProvider,
)

const main = UpdateBase.run.pipe(
  Effect.catchTag("NoPullRequest", () => ReleasePull.run),
  Effect.tapErrorTag("GithubError", error => Console.error(error.reason)),
  Effect.provide(
    Layer.mergeAll(ChangesetsLive, PullRequestsLive, RunnerEnvLive).pipe(
      Layer.provideMerge(GithubLive),
      Layer.provide(ConfigLive),
    ),
  ),
)

runMain(main)

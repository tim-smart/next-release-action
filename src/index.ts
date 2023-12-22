import { runMain } from "@effect/platform-node/Runtime"
import { ConfigProvider, Console, Effect, Layer, Option } from "effect"
import { ChangesetsLive } from "./Changesets"
import * as Github from "./Github"
import { PullRequestsLive } from "./PullRequests"
import { RunnerEnv, RunnerEnvLive } from "./Runner"
import * as UpdateBase from "./UpdateBase"
import { inputSecret } from "./utils/config"
import * as ReleasePull from "./ReleasePull"
import * as Config from "./Config"
import * as EnsureBranches from "./EnsureBranches"
import * as Command from "@effect/platform-node/Command"
import * as NodeContext from "@effect/platform-node/NodeContext"

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

const main = Effect.gen(function* (_) {
  const env = yield* _(RunnerEnv)
  const baseBranch = yield* _(Config.baseBranch)
  const prefix = yield* _(Config.prefix)
  const eligibleBranches = [
    `refs/heads/${prefix}-major`,
    `refs/heads/${prefix}-minor`,
  ]

  if (Option.isSome(env.comment)) {
    if (env.comment.value.body === "/approve") {
      yield* _(
        Command.make(
          "gh",
          "pr",
          "checkout",
          Option.getOrThrow(env.issue).number.toString(),
        ),
        Command.exitCode,
      )
      yield* _(UpdateBase.run)
    }
  } else if (env.ref === `refs/heads/${baseBranch}`) {
    yield* _(EnsureBranches.run)
  } else if (eligibleBranches.includes(env.ref)) {
    yield* _(ReleasePull.run)
  } else {
    yield* _(
      UpdateBase.run,
      Effect.catchTags({
        NoPullRequest: () => Console.log("No pull request found"),
      }),
    )
  }
}).pipe(
  Effect.tapErrorTag("GithubError", error => Console.error(error.reason)),
  Effect.provide(
    Layer.mergeAll(
      ChangesetsLive,
      NodeContext.layer,
      PullRequestsLive,
      RunnerEnvLive,
    ).pipe(Layer.provideMerge(GithubLive), Layer.provide(ConfigLive)),
  ),
)

runMain(main)

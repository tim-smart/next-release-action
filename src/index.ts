import { runMain } from "@effect/platform-node/NodeRuntime"
import * as NodeContext from "@effect/platform-node/NodeContext"
import { Config, ConfigProvider, Console, Effect, Layer, Option } from "effect"
import { ChangesetsLive } from "./Changesets"
import { Github } from "./Github"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"
import * as UpdateBase from "./UpdateBase"
import { inputSecret, nonEmptyString } from "./utils/config"
import * as ReleasePull from "./ReleasePull"
import * as ActionConfig from "./Config"
import { Git } from "./Git"
import * as Rebase from "./Rebase"
import { Comments } from "./Comments"
import { Permissions } from "./Permissions"

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

const main = Effect.gen(function* () {
  const env = yield* RunnerEnv
  const baseBranch = yield* ActionConfig.baseBranch
  const prefix = yield* ActionConfig.prefix
  const eligibleBranches = [`${prefix}-major`, `${prefix}-minor`]
  const isOrigin =
    Option.isNone(env.pull) ||
    env.pull.value.head.repo.owner.login ===
      env.pull.value.base.repo.owner.login

  yield* Effect.log("Running").pipe(
    Effect.annotateLogs({
      baseBranch,
      ref: env.ref,
      isPR: Option.isSome(env.pull),
      isComment: Option.isSome(env.comment),
      eligibleBranches,
    }),
  )

  if (
    env.comment._tag === "Some" &&
    env.comment.value.body.startsWith("/rebase")
  ) {
    yield* Rebase.runComment
  } else if (eligibleBranches.includes(env.ref) && isOrigin) {
    yield* Rebase.run
    yield* ReleasePull.run
  } else if (Option.isSome(env.pull)) {
    yield* UpdateBase.run.pipe(
      Effect.catchTags({
        NoPullRequest: () => Console.log("No pull request found"),
      }),
    )
  } else if (env.ref === baseBranch) {
    yield* Rebase.run
  }
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      ChangesetsLive,
      Comments.Live,
      Permissions.Live,
      PullRequests.Live,
      RunnerEnv.Live,
      GitLive,
      NodeContext.layer,
    ).pipe(Layer.provideMerge(GithubLive), Layer.provide(ConfigLive)),
  ),
)

runMain(main)

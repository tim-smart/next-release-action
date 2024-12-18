import { runMain } from "@effect/platform-node/NodeRuntime"
import * as NodeContext from "@effect/platform-node/NodeContext"
import { Config, ConfigProvider, Console, Effect, Layer, Option } from "effect"
import { Changesets } from "./Changesets"
import { Github } from "./Github"
import { PullRequests } from "./PullRequests"
import { RunnerEnv } from "./Runner"
import * as UpdateBase from "./UpdateBase"
import * as ReleasePull from "./ReleasePull"
import * as ActionConfig from "./Config"
import { Git } from "./Git"
import * as Rebase from "./Rebase"
import { Comments } from "./Comments"
import { Permissions } from "./Permissions"
import { input } from "./utils/config"

const githubActor = Config.nonEmptyString("github_actor")

const githubActorEmail = githubActor.pipe(
  Config.map(_ => `${_}@users.noreply.github.com`),
)

const GitLive = Git.layer({
  userName: input("git_user").pipe(Config.orElse(() => githubActor)),
  userEmail: input("git_email").pipe(Config.orElse(() => githubActorEmail)),
  simpleGit: Config.succeed({}),
})

const ConfigLive = ConfigProvider.fromEnv().pipe(
  ConfigProvider.constantCase,
  Layer.setConfigProvider,
)

const main = Effect.gen(function* () {
  const gh = yield* Github
  const env = yield* RunnerEnv
  const baseBranch = yield* ActionConfig.baseBranch
  const prefix = yield* ActionConfig.prefix
  const eligibleBranches = [`${prefix}-major`, `${prefix}-minor`]
  const currentUser = (yield* gh.request(_ => _.users.getAuthenticated())).data
    .login

  yield* Effect.log("Running").pipe(
    Effect.annotateLogs({
      baseBranch,
      ref: env.ref,
      actor: env.actor,
      currentUser,
      isPR: Option.isSome(env.pull),
      isComment: Option.isSome(env.comment),
      eligibleBranches,
      isOrigin: env.isOrigin,
    }),
  )

  if (
    env.comment._tag === "Some" &&
    env.comment.value.body.startsWith("/rebase")
  ) {
    yield* Rebase.runComment
  } else if (eligibleBranches.includes(env.ref) && env.isOrigin) {
    if (env.actor !== currentUser) {
      yield* Rebase.run
    }
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
      Changesets.Default,
      Comments.Default,
      Permissions.Default,
      PullRequests.Default,
      RunnerEnv.Default,
      Github.Default,
      GitLive,
      NodeContext.layer,
    ).pipe(Layer.provide(ConfigLive)),
  ),
)

runMain(main)

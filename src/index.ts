import { runMain } from "@effect/platform-node/Runtime"
import { ConfigProvider, Console, Effect, Layer, Stream } from "effect"
import { Changesets, ChangesetsLive } from "./Changesets"
import * as Github from "./Github"
import { inputSecret } from "./utils/config"

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

const main = Effect.gen(function* (_) {
  const changesets = yield* _(Changesets)

  yield* _(changesets.current, Stream.runForEach(Console.log))
}).pipe(
  Effect.provide(
    ChangesetsLive.pipe(
      Layer.provide(GithubLive),
      Layer.provide(
        Layer.setConfigProvider(
          ConfigProvider.fromEnv().pipe(ConfigProvider.constantCase),
        ),
      ),
    ),
  ),
)

runMain(main)

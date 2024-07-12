import { Context, Effect, Layer } from "effect"
import { Github } from "./Github"
import { RunnerEnv } from "./Runner"

const make = Effect.gen(function* () {
  const env = yield* RunnerEnv
  const github = yield* Github

  const check = github.wrap(_ => _.repos.checkCollaborator)
  const actorCheck = check({
    owner: env.repo.owner.login,
    repo: env.repo.name,
    username: env.actor,
  }).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
  )

  const whenCollaborator = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.whenEffect(effect, actorCheck)

  return { whenCollaborator } as const
})

export class Permissions extends Context.Tag("app/Permissions")<
  Permissions,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(Permissions, make).pipe(
    Layer.provide(RunnerEnv.Live),
  )
}

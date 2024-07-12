import { Context, Data, Effect, Layer } from "effect"
import { Github } from "./Github"
import { RunnerEnv } from "./Runner"

export class NoPullRequest extends Data.TaggedError("NoPullRequest") {}

const make = Effect.gen(function* () {
  const env = yield* RunnerEnv
  const github = yield* Github

  const react = github.wrap(_ => _.reactions.createForIssueComment)
  const reactCurrent = (
    content:
      | "+1"
      | "-1"
      | "laugh"
      | "confused"
      | "heart"
      | "hooray"
      | "rocket"
      | "eyes",
  ) =>
    env.comment.pipe(
      Effect.andThen(comment =>
        react({
          owner: env.repo.owner.login,
          repo: env.repo.name,
          comment_id: comment.id,
          content,
        }),
      ),
    )

  return { react, reactCurrent } as const
})

export class Comments extends Context.Tag("app/Comments")<
  Comments,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(Comments, make).pipe(Layer.provide(RunnerEnv.Live))
}

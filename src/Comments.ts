import { Effect } from "effect"
import { Github } from "./Github"
import { RunnerEnv } from "./Runner"

export class Comments extends Effect.Service<Comments>()("app/Comments", {
  effect: Effect.gen(function* () {
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
  }),
  dependencies: [RunnerEnv.Default, Github.Default],
}) {}

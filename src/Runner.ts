import * as OS from "node:os"
import * as Path from "node:path"
import { context } from "@actions/github"
import { Config, Context, Effect, Layer, Option } from "effect"
import { FileSystem } from "@effect/platform-node"

export const make = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem.FileSystem)
  const tmpDir = yield* _(
    Config.string("RUNNER_TEMP"),
    Config.withDefault(OS.tmpdir()),
  )

  const mkTmpDir = (path: string) => {
    const dir = Path.join(tmpDir, path)
    return fs
      .remove(dir, { recursive: true })
      .pipe(
        Effect.ignore,
        Effect.zipRight(fs.makeDirectory(dir)),
        Effect.as(dir),
      )
  }

  const issue = Option.fromNullable(context.issue.number).pipe(
    Option.as(context.issue),
  )
  const repo = context.repo.repo
  const owner = context.repo.owner
  const fullRepo = `${owner}/${repo}`

  return { tmpDir, mkTmpDir, issue, repo, owner, fullRepo } as const
})

export interface RunnerEnv extends Effect.Effect.Success<typeof make> {}
export const RunnerEnv = Context.Tag<RunnerEnv>()
export const RunnerEnvLive = Layer.effect(RunnerEnv, make).pipe(
  Layer.provide(FileSystem.layer),
)

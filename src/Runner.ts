import * as OS from "node:os"
import * as Path from "node:path"
import { context } from "@actions/github"
import { Config, Context, Effect, Layer, Option } from "effect"
import { FileSystem } from "@effect/platform/FileSystem"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { nonEmptyString } from "./utils/config"

export const make = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem)
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
  const repo = context.payload.repository!
  const comment = Option.fromNullable(context.payload.comment)
  const pull = Option.fromNullable(context.payload.pull_request)

  const ref = yield* _(
    nonEmptyString("GITHUB_HEAD_REF").pipe(
      Config.orElse(() => nonEmptyString("GITHUB_REF_NAME")),
    ),
  )

  return {
    tmpDir,
    mkTmpDir,
    issue,
    repo,
    comment,
    pull,
    ref,
  } as const
})

export class RunnerEnv extends Context.Tag("app/RunnerEnv")<
  RunnerEnv,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.effect(RunnerEnv, make).pipe(
    Layer.provide(NodeFileSystem.layer),
  )
}

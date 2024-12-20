import * as OS from "node:os"
import * as Path from "node:path"
import { context } from "@actions/github"
import { Config, Effect, Option } from "effect"
import { FileSystem } from "@effect/platform/FileSystem"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"

export class RunnerEnv extends Effect.Service<RunnerEnv>()("app/RunnerEnv", {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem
    const tmpDir = yield* Config.string("RUNNER_TEMP").pipe(
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
    const actor = context.actor

    const ref = yield* Config.nonEmptyString("GITHUB_HEAD_REF").pipe(
      Config.orElse(() => Config.nonEmptyString("GITHUB_REF_NAME")),
    )

    const isOrigin =
      Option.isNone(pull) ||
      pull.value.head.repo.owner.login === pull.value.base.repo.owner.login

    return {
      tmpDir,
      mkTmpDir,
      issue,
      repo,
      comment,
      actor,
      pull,
      ref,
      isOrigin,
    } as const
  }),
  dependencies: [NodeFileSystem.layer],
}) {}

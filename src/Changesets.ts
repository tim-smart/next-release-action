import { Console, Context, Effect, Layer, Stream } from "effect"
import { PullRequests, PullRequestsLive } from "./PullRequests"
import * as FileSystem from "@effect/platform-node/FileSystem"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { RunnerEnvLive } from "./Runner"

const make = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem.FileSystem)
  const pulls = yield* _(PullRequests)

  const current = pulls.currentFiles.pipe(
    Stream.tap(Console.log),
    Stream.filter(
      _ =>
        _.status === "added" &&
        _.filename.startsWith(".changesets/") &&
        _.filename.endsWith(".md"),
    ),
    Stream.mapEffect(_ => fs.readFileString(_.filename)),
    Stream.map(_ => unified().use(remarkParse).parse(_)),
  )

  return { current } as const
})

export interface Changesets {
  readonly _: unique symbol
}
export const Changesets = Context.Tag<
  Changesets,
  Effect.Effect.Success<typeof make>
>("app/Changesets")
export const ChangesetsLive = Layer.effect(Changesets, make).pipe(
  Layer.provide(PullRequestsLive),
  Layer.provide(FileSystem.layer),
  Layer.provide(RunnerEnvLive),
)

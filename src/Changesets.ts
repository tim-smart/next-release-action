import * as FileSystem from "@effect/platform-node/FileSystem"
import {
  Context,
  Effect,
  Layer,
  Option,
  ReadonlyArray,
  Stream,
  identity,
} from "effect"
import type * as AST from "mdast"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { PullRequests, PullRequestsLive } from "./PullRequests"
import { RunnerEnvLive } from "./Runner"

const make = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem.FileSystem)
  const pulls = yield* _(PullRequests)

  const current = (packages: ReadonlyArray<string>) =>
    pulls.currentFiles.pipe(
      Stream.filter(
        _ =>
          _.status === "added" &&
          _.filename.startsWith(".changeset/") &&
          _.filename.endsWith(".md"),
      ),
      Stream.mapEffect(_ => fs.readFileString(_.filename)),
      Stream.flatMap(_ => Stream.fromIterable(parse(_))),
      packages.length > 0
        ? Stream.filter(([pkg]) => packages.includes(pkg))
        : identity,
    )

  const currentTypes = (packages: ReadonlyArray<string>) =>
    current(packages).pipe(
      Stream.filter(_ => _[1] === "minor" || _[1] === "major"),
      Stream.map(([, type]) => type),
      Stream.runCollect,
      Effect.map(ReadonlyArray.dedupe),
    )

  const currentMaxType = (packages: ReadonlyArray<string>) =>
    currentTypes(packages).pipe(
      Effect.map((types): Option.Option<ChangeType> => {
        if (types.includes("major")) {
          return Option.some("major")
        } else if (types.includes("minor")) {
          return Option.some("minor")
        } else if (types.includes("patch")) {
          return Option.some("patch")
        }
        return Option.none()
      }),
    )

  return { current, currentTypes, currentMaxType } as const
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

//

const ChangeRegex = /"(.+?)":\s*(patch|minor|major)/g

type Change = [pkg: string, type: ChangeType]
type ChangeType = "patch" | "minor" | "major"

const parse = (content: string): ReadonlyArray<Change> => {
  const root = unified().use(remarkParse).parse(content)
  return ReadonlyArray.findFirst(
    root.children,
    (_): _ is AST.Heading => _.type === "heading",
  ).pipe(
    Option.flatMap(_ =>
      ReadonlyArray.findFirst(
        _.children,
        (_): _ is AST.Text => _.type === "text",
      ),
    ),
    Option.map(_ =>
      [..._.value.matchAll(ChangeRegex)].map(
        ([, pkg, type]) => [pkg, type] as Change,
      ),
    ),
    Option.getOrElse(() => []),
  )
}

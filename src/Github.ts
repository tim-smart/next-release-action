import { getOctokit } from "@actions/github"
import { Command } from "@effect/platform"
import type { OctokitResponse, RequestError } from "@octokit/types"
import { Chunk, Effect, Option, Stream, Schedule, Redacted } from "effect"
import { inputSecret } from "./utils/config"

export class GithubError {
  readonly _tag = "GithubError"
  constructor(readonly reason: RequestError) {}
}

export class Github extends Effect.Service<Github>()("app/Github", {
  effect: Effect.gen(function* () {
    const token = yield* inputSecret("github_token")
    const api = getOctokit(Redacted.value(token))

    const rest = api.rest
    type Endpoints = typeof rest

    const request = <A>(f: (_: Endpoints) => Promise<A>) =>
      Effect.tryPromise({
        try: () => f(rest),
        catch: reason => new GithubError(reason as any),
      }).pipe(
        Effect.retry({
          while: err =>
            err.reason.status === 403 ||
            err.reason.status === 429 ||
            err.reason.status >= 500,
          schedule: Schedule.exponential(1000).pipe(
            Schedule.union(Schedule.spaced(60000)),
            Schedule.intersect(Schedule.recurs(10)),
          ),
        }),
      )

    const wrap =
      <A, Args extends any[]>(
        f: (_: Endpoints) => (...args: Args) => Promise<OctokitResponse<A>>,
      ) =>
      (...args: Args) =>
        Effect.map(
          request(rest => f(rest)(...args)),
          _ => _.data,
        )

    const streamWith = <A, B>(
      f: (_: Endpoints, page: number) => Promise<OctokitResponse<A>>,
      g: (_: A) => ReadonlyArray<B>,
    ) =>
      Stream.paginateChunkEffect(0, page =>
        request(rest => f(rest, page)).pipe(
          Effect.map(_ => [
            Chunk.unsafeFromArray(g(_.data)),
            maybeNextPage(page, _.headers.link),
          ]),
        ),
      )

    const stream = <A>(
      f: (_: Endpoints, page: number) => Promise<OctokitResponse<A[]>>,
    ) => streamWith(f, _ => _)

    const cli = (...args: ReadonlyArray<string>) =>
      Command.make("gh", ...args).pipe(
        Command.runInShell(true),
        Command.env({
          GH_TOKEN: Redacted.value(token),
        }),
      )

    return { api, token, request, wrap, stream, streamWith, cli } as const
  }),
}) {}

const maybeNextPage = (page: number, linkHeader?: string) =>
  Option.fromNullable(linkHeader).pipe(
    Option.filter(_ => _.includes(`rel=\"next\"`)),
    Option.as(page + 1),
  )

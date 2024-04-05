import { getOctokit } from "@actions/github"
import type { OctokitResponse, RequestError } from "@octokit/types"
import {
  Chunk,
  Config,
  Secret,
  Context,
  Effect,
  Layer,
  Option,
  Stream,
  Schedule,
} from "effect"

export interface GithubOptions {
  readonly token: Secret.Secret
}

export class GithubError {
  readonly _tag = "GithubError"
  constructor(readonly reason: RequestError) {}
}

const make = ({ token }: GithubOptions) => {
  const api = getOctokit(Secret.value(token))

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

  return { api, token, request, wrap, stream, streamWith } as const
}

export class Github extends Context.Tag("app/Github")<
  Github,
  ReturnType<typeof make>
>() {
  static layer = (_: Config.Config.Wrap<GithubOptions>) =>
    Config.unwrap(_).pipe(Effect.map(make), Layer.effect(Github))
}

const maybeNextPage = (page: number, linkHeader?: string) =>
  Option.fromNullable(linkHeader).pipe(
    Option.filter(_ => _.includes(`rel=\"next\"`)),
    Option.as(page + 1),
  )

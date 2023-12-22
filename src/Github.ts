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
    })

  const wrap =
    <A, Args extends any[]>(
      f: (_: Endpoints) => (...args: Args) => Promise<OctokitResponse<A>>,
    ) =>
    (...args: Args) =>
      Effect.map(
        Effect.tryPromise({
          try: () => f(rest)(...args),
          catch: reason => new GithubError(reason as any),
        }),
        _ => _.data,
      )

  const stream = <A>(
    f: (_: Endpoints, page: number) => Promise<OctokitResponse<A[]>>,
  ) =>
    Stream.paginateChunkEffect(0, page =>
      Effect.tryPromise({
        try: () => f(rest, page),
        catch: reason => new GithubError(reason as any),
      }).pipe(
        Effect.map(_ => [
          Chunk.unsafeFromArray(_.data),
          maybeNextPage(page, _.headers.link),
        ]),
      ),
    )

  const streamItems = <A>(
    f: (
      _: Endpoints,
      page: number,
    ) => Promise<OctokitResponse<{ readonly items: A[] }>>,
  ) =>
    Stream.paginateChunkEffect(0, page =>
      Effect.tryPromise({
        try: () => f(rest, page),
        catch: reason => new GithubError(reason as any),
      }).pipe(
        Effect.map(_ => [
          Chunk.unsafeFromArray(_.data.items),
          maybeNextPage(page, _.headers.link),
        ]),
      ),
    )

  return { api, token, request, wrap, stream, streamItems } as const
}

export interface Github extends ReturnType<typeof make> {}
export const Github = Context.Tag<Github>()
export const layer = (_: Config.Config.Wrap<GithubOptions>) =>
  Config.unwrap(_).pipe(Effect.map(make), Layer.effect(Github))

const maybeNextPage = (page: number, linkHeader?: string) =>
  Option.fromNullable(linkHeader).pipe(
    Option.filter(_ => _.includes(`rel=\"next\"`)),
    Option.as(page + 1),
  )

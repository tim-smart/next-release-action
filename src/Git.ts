import { Config, Context, Data, Effect, Layer } from "effect"
import * as SG from "simple-git"

export class GitError extends Data.TaggedError("GitError")<{
  readonly error: SG.GitError
}> {
  get message() {
    return this.error.message
  }
}

export interface GitConfig extends Partial<SG.SimpleGitOptions> {
  simpleGit?: Partial<SG.SimpleGitOptions>
  userName: string
  userEmail: string
}

export interface GitRepoService {
  readonly path: string
  readonly git: SG.SimpleGit
  readonly run: <A>(
    f: (git: SG.SimpleGit) => Promise<A>,
  ) => Effect.Effect<A, GitError>
}
export class GitRepo extends Context.Tag("app/GitRepo")<
  GitRepo,
  GitRepoService
>() {}

const make = ({ simpleGit: opts = {}, userName, userEmail }: GitConfig) => {
  const clone = (url: string, dir: string) =>
    Effect.gen(function* (_) {
      yield* _(
        Effect.tryPromise({
          try: () => SG.simpleGit(opts).clone(url, dir),
          catch: error => new GitError({ error: error as any }),
        }),
      )

      return yield* _(open(dir))
    })

  const open = (dir: string) =>
    Effect.gen(function* (_) {
      const git = SG.simpleGit(dir, opts)

      const run = <A>(f: (git: SG.SimpleGit) => Promise<A>) =>
        Effect.tryPromise({
          try: () => f(git),
          catch: error => new GitError({ error: error as any }),
        })

      yield* _(
        run(_ =>
          _.addConfig("user.name", userName).addConfig("user.email", userEmail),
        ),
      )

      return GitRepo.of({ git, run, path: dir })
    })

  return { clone, open } as const
}

export class Git extends Context.Tag("app/Git")<
  Git,
  ReturnType<typeof make>
>() {
  static layer = (_: Config.Config.Wrap<GitConfig>) =>
    Config.unwrap(_).pipe(Effect.map(make), Layer.effect(Git))
}

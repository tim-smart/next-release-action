import { Config, Effect } from "effect"
import { input } from "./utils/config"
import { RunnerEnv } from "./Runner"

export const baseBranch = input("base_branch").pipe(
  Effect.orElse(() =>
    Effect.map(RunnerEnv, _ => _.repo.default_branch as string),
  ),
)

export const prefix = Config.withDefault(input("branch_prefix"), "next")

export const packages: Config.Config<ReadonlyArray<string>> = Config.array(
  input("packages"),
).pipe(Config.withDefault([]))

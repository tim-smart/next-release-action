import { Config } from "effect"

export const input = (name: string) =>
  Config.nested(Config.nonEmptyString(name), "input")

export const inputSecret = (name: string) =>
  Config.nested(Config.redacted(Config.nonEmptyString(name)), "input")

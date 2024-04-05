import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  external: ["@parcel/watcher"],
  treeshake: "smallest",
})

import { defineConfig } from "vitest/config";

// Vitest config for the pure-logic unit suite.
//
// Scope: only the vitest-authored specs under src/lib/__tests__/. The older
// sibling *.test.ts files next to their modules (btxConfig.test.ts,
// utils.test.ts, burnTracker.test.ts, bridgeAsset.test.ts) use the Node
// built-in `node:test` runner (`node --test src/lib/*.test.ts`) and are left
// untouched — narrowing `include` keeps the two runners from colliding.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/__tests__/**/*.test.ts"],
  },
});

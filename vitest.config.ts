import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Load `.env.local` before vitest spawns workers so process.env is populated
// in both the main process and (via inheritance) each worker.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    // RLS tests share one DB; running them in parallel creates flaky fixtures.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Vitest runs in plain Node without Next's React Server Components
      // condition, so the `import "server-only"` marker would throw on any
      // module loaded by a unit test. Alias to an empty stub so pure-server
      // utilities (templates, transport) stay testable.
      "server-only": path.resolve(__dirname, "tests/_stubs/server-only.ts"),
    },
  },
});

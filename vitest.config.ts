import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@authenik8/contracts": path.resolve(
        import.meta.dirname,
        "templates/fullstack/packages/contracts/src/index.ts",
      ),
      "@authenik8/policies": path.resolve(
        import.meta.dirname,
        "templates/fullstack/packages/policies/src/index.ts",
      ),
      "@authenik8/api-client": path.resolve(
        import.meta.dirname,
        "templates/fullstack/packages/api-client/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "./tests/**/*.test.ts",
      "./src/tests/**/*.test.ts",
      "./templates/fullstack/apps/api/tests/**/*.test.ts",
      "./templates/fullstack/apps/web/src/**/*.test.ts",
    ],
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    // 30s was sized for unit tests. The integration suites generate whole
    // projects, install stubs, and boot servers; under coverage
    // instrumentation (roughly 2x slowdown) an integrated fixture can
    // exceed 30s on a loaded Windows host even though the same test
    // passes un-instrumented and in isolation. Only the per-test budget
    // widens; no assertion is relaxed.
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary","html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/bin/**",
        "src/**/*.d.ts",
        "tests/**",
        "src/tests/**",
        "templates/**",
      ],
    },
  },
});

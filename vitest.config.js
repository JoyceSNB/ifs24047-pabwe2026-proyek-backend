import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.js"],
      exclude: ["src/server.js"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});

import { fileURLToPath } from "node:url";

// NOTE: we intentionally do NOT import from "vitest/config" — in this vitest
// build that entrypoint re-exports from "vite", which is not installed. Its
// `defineConfig` is just an identity function, so a plain object works the same.
const config = {
  test: {
    environment: "node" as const,
    include: ["src/**/*.{test,spec}.ts", "src/**/__tests__/**/*.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
};

export default config;

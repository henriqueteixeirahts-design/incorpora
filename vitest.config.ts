import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Mesmo motivo do vitest.integration.config.ts — "server-only" só
      // funciona dentro do bundler do Next.js; testes de unidade que
      // importam algo de src/server/*.ts (ex.: scope.ts) precisam do stub.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
  },
});

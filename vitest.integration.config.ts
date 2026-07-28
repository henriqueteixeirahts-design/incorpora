import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes de integração tocam o Postgres real (Docker local ou o serviço do
// CI) — separados dos testes de unidade pra não exigir banco disponível
// sempre que alguém rodar `npm test`.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" só funciona dentro do bundler do Next.js (alias de
      // webpack injetado no build); fora dele lança erro sempre. Os
      // arquivos de src/server/*.ts importados aqui precisam desse stub.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});

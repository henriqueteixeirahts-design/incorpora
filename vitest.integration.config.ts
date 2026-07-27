import { defineConfig } from "vitest/config";

// Testes de integração tocam o Postgres real (Docker local ou o serviço do
// CI) — separados dos testes de unidade pra não exigir banco disponível
// sempre que alguém rodar `npm test`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});

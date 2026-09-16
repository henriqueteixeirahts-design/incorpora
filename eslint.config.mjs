import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Scripts de bootstrap de CI (ex.: RLS Pilar 2, scripts/ci-*.js) — CommonJS
    // simples, fora do bundle da aplicação; `require()` é o idiomático aqui.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Material de referência do handoff de design (docs/visual/design_handoff_incorpora/README.md:
    // "os arquivos HTML/JS aqui são referências de design, não código de produção") — não é código
    // deste projeto, só documentação vendorizada; nunca deveria ter sido varrido pelo lint.
    "docs/visual/design_handoff_incorpora/referencia/**",
    // Worktrees isolados de agentes (ferramenta de orquestração multi-agente) — cópias temporárias
    // do repositório inteiro, incluindo o material vendorizado acima; nunca é código deste projeto.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;

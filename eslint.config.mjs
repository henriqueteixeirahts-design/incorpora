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
  {
    // RLS Pilar 2, Etapa 4 (2026-11-10) — o pooler em modo transação vaza
    // estado de sessão entre clientes (provado por
    // scripts/prove-pooler-tenant-context.ts). Contexto de organização só
    // com set_config(..., true), e só na extensão do Prisma. A mesma trava
    // existe como teste (src/lib/no-session-set-guard.test.ts), que também
    // confere o `true` no ponto legítimo.
    files: ["src/**/*.{ts,tsx,js,mjs}"],
    ignores: ["src/lib/prisma.ts", "src/lib/no-session-set-guard.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/set_config\\s*\\(|\\bSET\\s+(SESSION\\s+|LOCAL\\s+)?\"?app\\./i]",
          message:
            "Contexto de organização só via set_config(..., true) em src/lib/prisma.ts — SET de sessão vaza entre clientes no pooler em modo transação.",
        },
        {
          selector: "TemplateElement[value.raw=/set_config\\s*\\(|\\bSET\\s+(SESSION\\s+|LOCAL\\s+)?\"?app\\./i]",
          message:
            "Contexto de organização só via set_config(..., true) em src/lib/prisma.ts — SET de sessão vaza entre clientes no pooler em modo transação.",
        },
      ],
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

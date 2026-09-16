// RLS Pilar 2 — dá login pra app_user no Postgres efêmero do CI.
//
// A role já nasce com todos os grants (tabelas, sequences, statement_
// timeout) via `prisma migrate deploy` — a migration da Etapa 2.5 já cria
// a role, concede tudo, e a da Etapa 3 já seta o statement_timeout; migrate
// deploy replaya esse histórico inteiro do zero a cada run do CI, então
// nenhum script precisa repetir esses passos (tentar recriar a role antes
// do deploy é exatamente o que quebrava o CI: "role app_user already
// exists" quando a migration da Etapa 2.5 tentava criá-la de novo).
//
// A única coisa que falta depois do deploy: a migration cria a role como
// NOLOGIN de propósito (a senha real nunca fica versionada — ver o
// comentário da própria migration) — precisa de login pra app_user pra o
// CI conseguir se conectar como ela.
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(`ALTER ROLE app_user LOGIN PASSWORD 'app_user_ci_pw';`);
    console.log("app_user com login habilitado.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

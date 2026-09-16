// RLS Pilar 2 — bootstrap de app_user no Postgres efêmero do CI, mesmo
// motivo da Etapa 2.5 (local/produção): o serviço do CI sobe com
// POSTGRES_USER=incorpora, que a imagem oficial cria como superusuário —
// superusuário ignora RLS incondicionalmente, então rodar os testes de
// integração com essa role mascararia qualquer bug de policy futura
// (Etapa 4+) com um falso-verde.
//
// Roda ANTES de `prisma migrate deploy` — só cria a role, sem grant em
// tabela nenhuma ainda (nenhuma existe). Precisa existir antes do deploy
// porque a migration da função `list_active_org_ids()` concede EXECUTE
// pra `app_user` durante o próprio `migrate deploy`.
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user LOGIN PASSWORD 'app_user_ci_pw' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);
    console.log("app_user criada (ou já existia).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

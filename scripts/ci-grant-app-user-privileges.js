// RLS Pilar 2 — grants de app_user no Postgres efêmero do CI, depois que
// `prisma migrate deploy` já criou todas as tabelas. Mesmo bloco usado
// localmente e em produção (Etapa 2.5) — `ALL TABLES`/`ALL SEQUENCES` em
// vez de listar cada uma, `ALTER DEFAULT PRIVILEGES` cobre qualquer tabela
// de uma migration futura sem precisar lembrar de re-conceder.
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(`
      GRANT USAGE ON SCHEMA public TO app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
      ALTER DEFAULT PRIVILEGES FOR ROLE incorpora IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
      ALTER DEFAULT PRIVILEGES FOR ROLE incorpora IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
      ALTER ROLE app_user SET statement_timeout = '30s';
    `);
    console.log("Grants de app_user aplicados.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
// Troca da senha do app_user de produção (2026-11-17) — ver
// docs/ROTEIRO_TROCA_SENHA_APP_USER.md.
//
//   node scripts/app-user-password.mjs gerar
//     Gera uma senha nova (64 caracteres hexadecimais — sem codificação na URL)
//     e o comando SQL com a senha JÁ CIFRADA em SCRAM-SHA-256: o texto puro
//     nunca vai para o SQL Editor, o histórico dele ou o log do Postgres.
//     Mostra a senha uma vez, para você guardar no gerenciador. Não grava nada
//     em disco, não manda nada pela rede.
//
//   node scripts/app-user-password.mjs cifrar
//     Para o ROLLBACK: pede a senha já guardada no gerenciador (colada no
//     terminal, não fica no histórico do shell) e imprime de novo o ALTER ROLE
//     com ela cifrada — para o banco voltar a concordar com a URL.
//
//   node scripts/app-user-password.mjs conferir
//     Lê DATABASE_URL do ambiente e abre UMA conexão: confirma que a senha nova
//     foi aceita. Recusa porta diferente de 6543 (pooler em modo transação) e
//     usuário diferente de app_user. Não imprime a senha.
//
// Formato do verificador (RFC 5802/7677, o mesmo que o Postgres guarda):
//   SCRAM-SHA-256$<iterações>:<sal base64>$<StoredKey base64>:<ServerKey base64>
// Atenção: se o texto não for um verificador válido, o Postgres NÃO dá erro —
// trata o texto como senha em claro. Por isso a confirmação é sempre conectar
// com a senha (modo `conferir`), nunca só "o ALTER ROLE rodou".
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 4096; // padrão do Postgres (scram_iterations)

export function scramVerifier(password, salt = randomBytes(16), iterations = ITERATIONS) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

async function conferir() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }
  const url = new URL(raw);
  const port = url.port || "5432";
  const user = decodeURIComponent(url.username);
  const expectedPort = process.env.APP_USER_CHECK_PORT ?? "6543";
  console.log(`Alvo: ${url.hostname}:${port}, usuário ${user} (senha não impressa)`);
  if (port !== expectedPort) {
    console.error(`Recusado: porta ${port}; esperado ${expectedPort} (pooler em modo transação).`);
    process.exit(1);
  }
  if (user !== "app_user" && !user.startsWith("app_user.")) {
    console.error(`Recusado: usuário ${user}; esperado app_user.`);
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_user AS usuario, now() AS agora");
    console.log(`OK — conectou como ${rows[0].usuario} em ${rows[0].agora.toISOString()}. A senha nova foi aceita.`);
  } catch (error) {
    console.error(`FALHOU — ${error.message}`);
    console.error("Se for 'password authentication failed': o banco e a URL não têm a mesma senha (espere 1–2 min e tente de novo uma vez; depois, ver Rollback no roteiro).");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

function gerar() {
  const password = randomBytes(32).toString("hex");
  const verifier = scramVerifier(password);
  console.log("1) SENHA NOVA — guarde AGORA no gerenciador (aparece só esta vez):\n");
  console.log(`   ${password}\n`);
  console.log("2) SQL para o SQL Editor do Supabase (a senha vai cifrada; o texto puro não aparece):\n");
  console.log(`   ALTER ROLE app_user WITH PASSWORD '${verifier}';\n`);
  console.log("Feche este terminal depois de copiar (a senha fica só no histórico de rolagem da janela).");
}

async function cifrar() {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = (await rl.question("Cole a senha guardada no gerenciador e tecle Enter: ")).trim();
  rl.close();
  if (!/^[0-9a-f]{64}$/.test(password)) {
    console.error("Recusado: esperado 64 caracteres hexadecimais (o formato gerado por `gerar`).");
    process.exit(1);
  }
  console.log(`\nSQL para o SQL Editor do Supabase:\n\n   ALTER ROLE app_user WITH PASSWORD '${scramVerifier(password)}';\n`);
}

const command = process.argv[2];
if (command === "gerar") gerar();
else if (command === "cifrar") await cifrar();
else if (command === "conferir") await conferir();
else if (import.meta.url === `file://${process.argv[1]}`) {
  console.error("Uso: node scripts/app-user-password.mjs gerar | cifrar | conferir");
  process.exit(1);
}

# Roteiro — troca da senha do `app_user` de produção, prova do pooler e merge do PR #1

> Sessão única aprovada em 2026-11-17: **troca + redeploy (D1) → confirmação → prova do pooler → merge (D2)**, com o D1 como alvo de rollback do merge.
> Motivo da troca: `DATABASE_URL` e `DIRECT_URL` estão como *sensitive* na Vercel (o valor não pode mais ser lido), e a senha do `app_user` não está registrada em lugar nenhum — o STATUS da Etapa 2.5 não diz quem a gerou nem onde ficou. A busca no repositório e em todo o histórico (163 commits) não a encontrou (sem achado de segurança).
> **Só a `DATABASE_URL` usa o `app_user`. A `DIRECT_URL` é da role `postgres` (migrations no build) e NÃO é tocada.**

## Antes da janela (preparação, sem efeito em produção)

| # | O quê | Confere |
|---|---|---|
| P1 | No gerenciador de senhas, criar o item **"Incorpora — produção — Postgres app_user"** (campos na seção "Registro" abaixo). Vazio por enquanto | item criado |
| P2 | No PC: Node 22 e o repositório no branch do PR #1 — `git fetch origin && git checkout sprint-nov-etapa4-prep && git pull && npm ci && npx prisma generate` | `node scripts/app-user-password.mjs` responde "Uso: ..." |
| P3 | Supabase → projeto **incorpora-cl** → botão **Connect** (topo) → aba **Transaction pooler** (porta **6543**) → copiar a URI. Ela vem como `postgresql://postgres.mueudgyivnqhhbwkykkq:[YOUR-PASSWORD]@aws-…-sa-east-1.pooler.supabase.com:6543/postgres` | URI copiada, porta 6543 |
| P4 | Vercel → projeto `incorpora` → **Deployments** → abrir o deploy de produção atual e anotar **quanto durou o build**. É a duração esperada da indisponibilidade | duração anotada |
| P5 | Escolher o horário **fora de 02:45–04:45 UTC** (23:45–01:45 em Brasília): crons da Vercel às 03:00 (recálculo, diário) e 04:00 (índices, segunda) | horário marcado |
| P6 | Me avisar antes de começar: tiro a linha de base no banco (só leitura) — conexões do `app_user`, último recálculo, alertas pendentes | eu confirmo |

**Sobre e-mails de alerta durante a janela: o esperado é NENHUM.** A corrente do alerta avisa sobre falha de **job** (linha FAILURE em `job_runs`), não sobre o app fora do ar. Na janela, a Edge Function e o cron-job.org usam a role `postgres` e continuam batendo normalmente; nenhum job da Vercel roda (horário fora dos crons); e o alerta de login barulhento ainda não está em produção (vem no PR #1). **Se chegar e-mail na janela, é porque um cron caiu dentro dela — anote e me avise.** Isso também deixa explícita uma lacuna: hoje nada avisa quando o app inteiro fica fora do ar (ver STATUS — monitor de disponibilidade como item futuro).

## A janela

### Parte 1 — troca da senha e D1

1. **Gerar a senha e o SQL** — no PC, na pasta do repositório:
   ```
   node scripts/app-user-password.mjs gerar
   ```
   Saem duas coisas: a **senha** (64 caracteres hexadecimais) e a linha **`ALTER ROLE app_user WITH PASSWORD 'SCRAM-SHA-256$4096:…';`** (a senha já cifrada; o texto puro nunca vai para o Supabase).
   - Cole a **senha** no campo *Senha* do item do gerenciador e **salve**.
   - Cole a linha **ALTER ROLE** no campo *Notas* do mesmo item e salve (contém só o hash; é o que permite refazer o passo 4 no rollback).
   - Feche o terminal.
2. **Montar a URL nova** a partir da URI do P3: trocar `postgres.mueudgyivnqhhbwkykkq` por **`app_user.mueudgyivnqhhbwkykkq`** e `[YOUR-PASSWORD]` pela senha. **Não acrescentar parâmetros.** Salvar a URL completa no campo *URL* do item do gerenciador.
3. **Vercel → `incorpora` → Settings → Environment Variables → `DATABASE_URL`** → menu **⋯** → **Edit** → colar a URL nova → conferir que só **Production** está marcado → **Save**.
   - Confere: a variável mostra "Updated just now". **Nada muda ainda** — o deploy no ar continua com o valor antigo até um novo deploy.
   - **Não tocar em `DIRECT_URL`.**
4. **Supabase → incorpora-cl → SQL Editor → New query** → colar a linha **ALTER ROLE** do passo 1 → **Run**.
   - Confere: "Success. No rows returned".
   - ⏱ **COMEÇA A INDISPONIBILIDADE — anote a hora (UTC).** Conexões novas do deploy atual passam a ser recusadas.
5. **Imediatamente: Vercel → Deployments** → o deploy de produção atual (commit `6a60219`, marcado *Current*) → **⋯ → Redeploy** → **Redeploy** (deixar a opção de cache como vier).
   - **Este é o D1.** Anote a hora e o identificador do deploy — é o **alvo de rollback do merge** (`docs/CHECKLIST_POS_DEPLOY_LOGIN.md`, passo 0.3).
6. **Enquanto o D1 builda — conferir a senha nova** (no PC; a URL não aparece na tela nem no histórico):
   - PowerShell: `$env:DATABASE_URL = Read-Host "DATABASE_URL"` → colar a URL do gerenciador → `node scripts/app-user-password.mjs conferir`
   - macOS/Linux: `read -rs DATABASE_URL && export DATABASE_URL` → `node scripts/app-user-password.mjs conferir`
   - Esperado: **`OK — conectou como app_user … A senha nova foi aceita.`** É **assim** que se confirma que o hash foi aceito: o `ALTER ROLE` não dá erro nem com um hash malformado (o Postgres o guarda como senha em claro, sem avisar — testado), então "o comando rodou" não prova nada; conectar com a senha prova.
   - `FALHOU — password authentication failed`: espere 1–2 minutos (o pooler pode estar com a credencial antiga em cache) e rode **uma vez** mais. Persistiu → **Rollback R1**.
   - `FALHOU` com `Tenant or user not found`, host ou porta: a URL está errada → **Rollback R2**.
7. **D1 fica *Ready*** → ⏱ **TERMINA A INDISPONIBILIDADE — anote a hora.** Confere no D1: commit `6a60219`, *Environment: Production*, *Current*.
8. **Teste do app** — janela anônima → `https://incorpora-six.vercel.app/login` → entrar → cair no painel → abrir **Vendas** e **Carteira** (dados aparecem).
9. **Logs** — Vercel → Logs (Production), buscar `password authentication failed` e `Tenant or user not found`: **zero** depois da hora do passo 7.
10. **Me avise** — eu confiro no banco (só leitura): conexões do `app_user` abertas depois da hora do passo 7; falhas de autenticação do `app_user` só dentro da janela (log do Postgres); nenhum alerta novo pendente.
11. *(Opcional, higiene)* SQL Editor → histórico → apagar a query do passo 4. Contém só o hash; com uma senha de 256 bits aleatórios, ele não é quebrável por força bruta — o risco é baixo, mas não há motivo para mantê-lo.

**Parte 1 concluída = D1 no ar, login OK, logs limpos.** Só então siga.

### Parte 2 — prova do pooler (mesma URL)

12. No mesmo terminal do passo 6 (com `DATABASE_URL` ainda definida): `npx tsx scripts/prove-pooler-tenant-context.ts` → me cole a saída inteira. **APROVADO** (saída 0) → siga. **INCONCLUSIVO** (2) → rode de novo com `POOLER_PROOF_ITERATIONS=150`. **FALHOU** (1) → **pare aqui** e me chame: o merge não acontece hoje.
13. Feche o terminal (PowerShell: `Remove-Item Env:DATABASE_URL` antes).

### Parte 3 — merge (D2)

14. Seguir `docs/CHECKLIST_POS_DEPLOY_LOGIN.md` do passo 0 em diante. O alvo de rollback (passo 0.3) é o **D1** do passo 5 — **nunca** um deploy mais antigo: todos os anteriores ao D1 têm a senha antiga embutida e não conectam mais.
15. Depois do merge e do checklist: GitHub → Actions → **Alerta de jobs** → **Enable workflow**.

### Dia seguinte

16. **Depois das 03:00 UTC: conferir que os crons continuam com SUCCESS** — tela de Jobs: `recalculate-installments` de hoje com SUCCESS (e, numa segunda, `sync-index-values` depois das 04:00). Eu também confiro no banco. É a primeira execução de job da Vercel com a senha nova: se falhar, é aqui que aparece — e, se falhar, **vira e-mail de alerta** (a corrente cobre falha de job).

## Rollback

**Não existe "voltar para a senha antiga"**: ninguém a conhece, e o **Instant Rollback para deploys anteriores ao D1 não resolve** — todos têm a senha antiga embutida. Rollback aqui é sempre **fazer o banco e a `DATABASE_URL` concordarem de novo**:

- **R1 — senha recusada** (`password authentication failed for user "app_user"` no `conferir` ou nos logs): o banco não tem a senha que está na URL. Supabase → SQL Editor → rodar de novo a linha **ALTER ROLE** guardada nas *Notas* do item (passo 1). Se ela se perdeu: `node scripts/app-user-password.mjs cifrar` → colar a senha do gerenciador → usar a linha impressa. Vale na hora, sem redeploy. Depois, `conferir` de novo.
- **R2 — URL errada** (`Tenant or user not found`, erro de host ou porta): corrigir a `DATABASE_URL` na Vercel (passo 3) com a URL do gerenciador → **Redeploy** de novo (passo 5; o novo redeploy passa a ser o D1).
- **R3 — qualquer outra coisa, ou dúvida sobre qual valor está onde**: refazer os passos 1 a 7 do zero com um par novo (senha + hash). Cada volta custa um build de indisponibilidade.

## Registro da senha nova (guarda) — o que vai para onde

**No gerenciador** — item **"Incorpora — produção — Postgres app_user"**:
- *Senha*: a de 64 caracteres (passo 1).
- *URL*: a `DATABASE_URL` completa (passo 2).
- *Notas*: a linha ALTER ROLE com o hash (passo 1); data e hora da troca (UTC); "gerada por <você> com `scripts/app-user-password.mjs gerar`"; "configurada em: Vercel → `DATABASE_URL` (Production, sensitive)".

**No STATUS** (`docs/STATUS_IMPLANTACAO.md`, tabela "Registro de credenciais") — **nunca o valor**: data/hora da troca, quem gerou e como, **onde está guardada** (nome do gerenciador + nome do item), onde está configurada, e que a senha anterior (custódia desconhecida desde a Etapa 2.5) foi invalidada pela troca. Eu preencho depois que você me disser o nome do gerenciador e confirmar o passo 7.

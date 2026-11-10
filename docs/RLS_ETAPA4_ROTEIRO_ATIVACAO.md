# RLS Etapa 4 — roteiro de ativação em produção

> Escrito em 2026-11-10 com o aprendizado da Etapa 4 inteira provada no CI (job `test-rls`): os 17 grupos aplicados na imagem real do Supabase, suíte completa com RLS ligado, fronteira das 84 tabelas, reversão de cada grupo, prova do pooler e oráculo — tudo verde. Nada deste roteiro foi executado em produção.
>
> Regra: **um grupo por deploy**. Nenhum passo começa sem o anterior conferido. Qualquer item de "pare" → reverter o grupo (seção 4) e me chamar.

## 0. Antes do Grupo 1 (uma vez só)

| # | O quê | Como confirmar |
|---|---|---|
| 0.1 | Corrente do alerta funcionando ponta a ponta (6 pendentes entregues) | e-mail recebido; eu confiro `alertSentAt` no banco |
| 0.2 | PR #1 mergeado e no ar (login por `resolve_user_organization()`) | login testado em janela anônima (plano de reversão do login no STATUS) |
| 0.3 | Prova do pooler contra a produção: **APROVADO** | saída do `scripts/prove-pooler-tenant-context.ts` com a `DATABASE_URL` da Vercel |
| 0.4 | No ar, vindos deste branch: correção da extensão do Prisma (`prisma` global dentro de `$transaction` sem contexto — **sem ela, a comissão quebra em silêncio no Grupo 1**), login barulhento (`count_user_access_grants`), trava contra SET de sessão | CI verde no master com os jobs `test` e `test-rls` |
| 0.5 | Semana de observação: `RLS_OBSERVE=1` na Vercel (Production) por 7 dias | Vercel → Logs, buscar `rls-observe-no-org`: **zero** ocorrências em tabela dos grupos. Cada ocorrência é uma consulta que, com RLS, voltaria vazia — me mande o `callSite` |
| 0.6 | Backup recente | Supabase → Database → Backups: backup do dia existe |

## 1. Passo a passo de CADA grupo

1. **Promover** (eu faço, ou você roda): `node scripts/rls-promote-group.mjs <N>` → cria `prisma/migrations/<data>_rls_etapa4_grupo_NN/`. O script recusa pular a ordem e promover duas vezes.
2. **Commit e push no master** (só esse arquivo). O CI roda `test` e `test-rls`; espere os dois verdes.
3. **Deploy**: Vercel → Deployments → o deploy do commit fica "Ready" (o build aplica a migration antes do `next build`; se a migration falhar, o build falha e nada muda).
4. **Conferência imediata (5 min)** — Supabase → SQL Editor, cole e rode (só leitura):
   ```sql
   SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
          (SELECT string_agg(p.polname, ',') FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity
    ORDER BY 1;
   ```
   Esperado: as tabelas de todos os grupos ativados até agora, `rls = force = true`, `policies = tenant_isolation`.
5. **Teste na tela** (janela anônima, sua conta): abrir as telas do grupo (coluna "Telas" abaixo), conferir que os registros aparecem e **criar ou editar um registro** de teste.
6. **Observar** pelo tempo da coluna "Esperar":
   - Vercel → Logs: buscar `row-level security` e `42501` → **zero**.
   - Supabase → Logs → Postgres: buscar `row-level security` → **zero**.
   - Vercel → Logs: buscar `login-org-resolution-failed` → **zero**.
   - Depois do cron das 03:00 UTC: `recalculate-installments` com SUCCESS (tela de Jobs) e auditoria do dia com V1-V7 OK (tela de Auditoria).
7. Tudo limpo → próximo grupo.

**Pare e reverta (seção 4)** se: qualquer `42501`/`row-level security` no log; tela do grupo vazia ou erro ao salvar; job FAILURE; auditoria com check novo em ALERT; `login-org-resolution-failed`; qualquer número diferente do que era antes.

## 2. Ordem final dos grupos

A ordem do inventário se manteve: nada no Bloco 2 obrigou a mudar. Os dois achados do CI (contexto perdido em `prisma` global dentro de `$transaction`, e promessa preguiçosa no `withOrgContext`) foram corrigidos no código, antes do Grupo 1 (item 0.4).

| Grupo | Tabelas | Telas para o passo 5 | Jobs que tocam | Esperar |
|---|---|---|---|---|
| 1 — Configurações e regras | 12 | Configurações: régua de cobrança, regras de comissão, distrato, renegociação, reserva, avaliação de proposta, modelos de rateio, relatórios agendados. **Criar uma venda de teste com comissão** (o achado do CI era aqui) | — | 24 h |
| 2 — Modelos de documento e documentos | 3 | Configurações → Documentos; anexar um documento | — | 24 h |
| 3 — Cadastros de terceiros | 7 | Fornecedores, centros de custo, contas bancárias, imobiliárias (com faixas de split), corretores, parcerias | — | 24 h |
| 4 — Clientes | 2 | Clientes: lista, detalhe, contatos; criar um cliente | — | 24 h |
| 5 — SPEs | 4 | SPEs: dados, contas, terrenos, sócios | — | 24 h |
| 6 — Investidores das SPEs | 6 | SPE → investidores: previsões, chamadas, aportes, retornos, extrato do mútuo | — | 24 h |
| 7 — Índices | 2 | Configurações → Índices | `sync-index-values` (segunda 04:00 UTC), recálculo e auditoria V1/V5 | **até depois da próxima segunda 04:00 UTC** (ativar no domingo) |
| 8 — Auditoria e trilha | 4 | Auditoria (lista e detalhe), histórico de um registro, notificações | auditoria diária | 24 h |
| 9 — Empreendimentos e estrutura física | 10 | Empreendimentos, espelho de vendas, unidades, obra (fases e medições) | recálculo | 24 h |
| 10 — Comercial | 6 | Tabelas de venda, reservas (e fila), propostas e aprovação | — | 24 h |
| 11 — Vendas e contratos | 5 | Vendas, contratos, aditivos, cessões, distratos | recálculo | 24 h |
| 12 — Comissões | 3 | Comissões (quadro, ranking, exportação) | — | 24 h |
| 13 — Contas a pagar | 3 | Contas a pagar: itens, rateio, aprovação | — | 24 h |
| 14 — Permutas | 8 | Permutantes, contratos de permuta, repasses, extrato | — | 24 h |
| 15 — Cobrança e renegociação | 3 | Painel de cobrança, histórico de contato, renegociações | — | 24 h |
| 16 — Carteira de recebíveis | 5 | Carteira, extrato do cliente, recebíveis avulsos, fluxo de caixa, painel executivo | recálculo diário, auditoria V2/V3/V6 | **48 h**, incluindo uma auditoria **completa** (dias 1-2 do mês, ou disparada à mão) com V3/V6 OK |
| 17 — Vínculo de acesso | 1 | **Login** em janela anônima, logo depois do deploy; Usuários e papéis | login | 24 h |

Total: ~19 dias corridos (domingo do Grupo 7 e as 48 h do 16 incluídos). Depois do 17, as 6 exceções do inventário (`organizations`, `users`, `permissions`, `roles`, `role_permissions`, `job_runs`), uma a uma, com plano próprio.

## 3. Desempenho esperado (benchmark do CI, 3 organizações × 20 mil parcelas)

Custo das policies medido com volume (`scripts/rls-benchmark.ts`): Tier 2 ~1,0×; buscas pontuais de Tier 3 +0,3 ms; somas de Tier 3 por carteira até ~5× (110 ms para 20 mil memórias de cálculo). Produção hoje: 130 parcelas no total — sem impacto perceptível. **Nenhum índice novo proposto**: os testados não ajudaram, e um deles (pagamentos por parcela) piorou a consulta com RLS. Reavaliar com `pg_stat_statements` de produção depois do Grupo 16.

## 4. Reversão de um grupo

**Emergência (menos de 1 minuto, sem deploy):**
1. Supabase → SQL Editor → New query.
2. Cole o conteúdo de `prisma/rls-etapa4/NN_grupo_*.down.sql` do grupo (idempotente: pode rodar duas vezes).
3. Run. Rode a consulta do passo 4 da seção 1: as tabelas do grupo somem da lista.

**Registrar no mesmo dia** (senão o histórico de migrations diz "ativo" e um replay do zero diverge da produção):
4. `node scripts/rls-promote-group.mjs <N> --down` → cria `prisma/migrations/<data>_rls_etapa4_grupo_NN_reversao/` (o mesmo SQL do passo 2).
5. Commit, push no master, deploy "Ready". Como o SQL é idempotente, aplicar sobre o banco já revertido não muda nada.

Reverter grupos em ordem inversa (17 → 1) se precisar voltar mais de um. A reversão do Grupo 1 **não** remove a função `app_current_org_id()` (só `00_funcao_contexto.down.sql`, depois de reverter os 17).

Reativar um grupo revertido: `node scripts/rls-promote-group.mjs <N>` de novo (o script aceita depois de uma reversão).

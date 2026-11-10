# Checklist pós-deploy do login (merge do PR #1)

> Para o dia do merge do PR #1. O deploy muda o login (`resolve_user_organization()`, `count_user_access_grants()`), corrige a causa raiz da comissão (funções recebem o `tx`) e liga a trava `prisma-global-client-in-transaction` em modo produção. Nenhuma policy de RLS é ativada.
> Quem detecta login quebrado é você abrindo o sistema: reserve ~30 minutos de atenção inteira, sem outra tarefa no meio.
> **Pré-condição**: a corrente do alerta já funcionando (o deploy liga a auditoria diária encadeada no cron; com a V7 em ALERT, ela gera uma falha por dia).

## 0. Antes do merge (5 min)

| # | O quê | Quem |
|---|---|---|
| 0.1 | CI do PR #1 verde nos dois jobs (`test` e `test-rls`) no último commit | você confere no PR |
| 0.2 | **Foto da comissão ANTES** — consulta C (seção 3), resultado guardado | eu rodo (só leitura) |
| 0.3 | Anotar o deploy de produção atual na Vercel (Deployments → o primeiro com "Production"/"Current") — commit `6a60219`. É o alvo do rollback | você |
| 0.4 | Janela anônima aberta, conta de teste à mão | você |

## 1. Na Vercel, antes de testar (assim que der push/merge)

1. Vercel → projeto `incorpora` → **Deployments**.
2. O deploy novo aparece no topo, **Environment: Production**. Clicar nele e conferir:
   - **Commit**: o hash do merge (o mesmo que o GitHub mostra no PR mergeado) — não o `6a60219`.
   - **Status: Ready** (verde). Enquanto estiver *Building*, espere.
3. Se o status for **Error**: o build falhou — muito provavelmente na migration (o build roda `prisma migrate deploy` antes do `next build`). **Nada foi ao ar**: a produção continua no deploy anterior. Não faça rollback; me mande o log do build.
4. Se for **Ready**: o deploy está servindo produção. Siga.

## 2. Teste do login em janela anônima (2 min)

1. Janela anônima → `https://incorpora-six.vercel.app/login`.
2. Entrar com e-mail e senha.
3. Resultado e o que significa:

| O que aparece | Significa | Ação |
|---|---|---|
| Cai no painel (`/dashboard`) com o nome da sua organização e dados | Login de pé | Siga para o passo 4 |
| **Volta para a tela de login** sem mensagem, com a senha certa | A resolução da organização devolveu nulo — exatamente o modo de falha silenciosa | **Rollback imediato** (seção 6), depois me chame |
| Página de erro / "Application error" / 500 | A função falhou (ex.: permissão) | **Rollback imediato** |
| Mensagem de senha inválida | Problema de autenticação do Supabase Auth, não deste deploy | Confira a senha numa segunda tentativa; se persistir, rollback e me chame |

4. Com o login de pé, abrir **Vendas** e **Carteira** (ou Recebíveis): os registros aparecem como antes.
5. Sair e entrar de novo uma vez (segundo login confirma que não foi cache de sessão).

## 3. Consultas de leitura no Supabase (eu rodo na hora, só leitura)

**A — migrations aplicadas** (esperado: as 3 linhas com `finished_at` preenchido e `rolled_back_at` nulo; total 59):
```sql
SELECT migration_name, finished_at, rolled_back_at
  FROM _prisma_migrations
 WHERE migration_name IN ('20261108120000_rls_etapa4_resolve_user_organization',
                          '20261110090000_rls_etapa4_count_user_access_grants',
                          '20261110160000_operational_alert_dedup');
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
```

**B — as duas funções com as travas** (esperado nas 2 linhas: `secdef = true`, `config = {search_path=""}` (o psql mostra `{"search_path=\"\""}`), `args = p_user_id uuid`, `retset = false`, `public_exec = false`, `app_user = true`, `anon = authenticated = service_role = false`; `returns` = `uuid` / `integer`):
```sql
SELECT p.proname, p.prosecdef AS secdef, p.proconfig AS config,
       pg_get_function_identity_arguments(p.oid) AS args, format_type(p.prorettype, NULL) AS returns, p.proretset AS retset,
       EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
       has_function_privilege('app_user', p.oid, 'EXECUTE') AS app_user,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('resolve_user_organization', 'count_user_access_grants');
```

**C — comissão: foto antes e depois** (rodada no passo 0.2 e de novo agora; esperado: **as 4 linhas idênticas** às de antes — o deploy não pode ter alterado nenhum split existente):
```sql
SELECT 'commission_splits' AS tabela, count(*) AS linhas, coalesce(sum(value), 0) AS soma,
       md5(coalesce(string_agg(concat_ws('|', id, "saleId", "beneficiaryType", "brokerId", "agencyId", percent, value,
                                         "accruedAmount", "settledAmount", status, "payableId"), ',' ORDER BY id), '')) AS assinatura
  FROM commission_splits
UNION ALL
SELECT 'external_commission_splits', count(*), coalesce(sum(value), 0),
       md5(coalesce(string_agg(concat_ws('|', id, "saleId", "beneficiaryType", "brokerId", "agencyId", percent, value,
                                         "paidAmount", status), ',' ORDER BY id), ''))
  FROM external_commission_splits
UNION ALL
SELECT 'commission_split_payables', count(*), coalesce(sum(amount), 0),
       md5(coalesce(string_agg(concat_ws('|', id, "splitId", "payableId", amount), ',' ORDER BY id), ''))
  FROM commission_split_payables
UNION ALL
SELECT 'sales', count(*), coalesce(sum("salePrice"), 0),
       md5(coalesce(string_agg(concat_ws('|', id, "saleNumber", "salePrice"), ',' ORDER BY id), ''))
  FROM sales;
```
Limite honesto: a foto prova que o deploy **não alterou** nenhum split existente. Que uma venda **nova** gera os splits certos com o código novo está provado no CI (8 testes de resolução de comissão, nos dois jobs, e a trava que acusa o padrão antigo) — não em produção, porque não criamos venda de teste em produção.

**D — a função devolve a organização do vínculo mais antigo para TODO usuário com vínculo** (esperado: `divergentes = 0` e `contagem_zero = 0`; `usuarios` = quantos têm vínculo). Empate de `createdAt`: aceita qualquer uma das organizações empatadas no mais antigo.
```sql
WITH primeiro AS (
  SELECT "userId", min("createdAt") AS criado FROM access_grants GROUP BY "userId"
)
SELECT count(*) AS usuarios,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM access_grants g
          WHERE g."userId" = p."userId" AND g."createdAt" = p.criado
            AND g."organizationId" = resolve_user_organization(p."userId"))) AS divergentes,
       count(*) FILTER (WHERE count_user_access_grants(p."userId") = 0) AS contagem_zero
  FROM primeiro p;
```
Qualquer `divergentes > 0` ou `contagem_zero > 0` → **rollback**.

**Controle negativo destas consultas** (2026-11-10, banco local com as 58 migrations de então — regra do CLAUDE.md): as quatro rodam sem erro; **D** com `resolve_user_organization()` sabotada para devolver o vínculo mais NOVO → `divergentes` 0 → 1; com `count_user_access_grants()` sabotada para devolver 0 → `contagem_zero` 0 → 1; **C** com 1 centavo a mais num split → soma 1.00 → 1.01 e a assinatura muda. Restaurado, tudo volta a zero.

## 4. Logs nos primeiros 15 minutos

Vercel → projeto → **Logs** (ambiente Production), um termo de cada vez:

| Buscar | Esperado | Se aparecer |
|---|---|---|
| `login-org-resolution-failed` | zero | **Rollback** — alguém com vínculo não conseguiu entrar |
| `42501` e `permission denied` | zero | **Rollback** se citar `resolve_user_organization` ou `count_user_access_grants`; outro objeto → me mande a linha |
| `prisma-global-client-in-transaction` | zero | **Não é rollback**: em produção a trava registra, grava o alerta e a consulta segue com o contexto certo (sem RLS, o comportamento é o de antes). É um caminho que a varredura estática não pegou → me mande a linha inteira (traz a pilha) ou o e-mail; corrijo para a próxima |
| filtro **Level: Error** | nada novo em relação a antes | me mande o que for novo |

Supabase → **Logs** → **Postgres**: buscar `permission denied` e `resolve_user_organization` → zero.

**Gravado no banco, não só no log** (decisão de 2026-11-10): o log de execução da Vercel no plano Hobby fica disponível por menos de 1 hora, então `prisma-global-client-in-transaction` e `login-org-resolution-failed` também viram uma linha em `job_runs` (`jobName = 'alerta:<evento>'`) e **chegam por e-mail pela corrente do alerta**, sem ninguém olhar o log. Uma linha por ponto de chamada (ou por usuário, no login) por dia; no máximo 20 por evento por dia, mais uma de "teto atingido". Para ver a qualquer momento:

**E — alertas operacionais gravados** (esperado depois do deploy: nenhuma linha):
```sql
SELECT "jobName", summary ->> 'callSite' AS ponto, "startedAt", "alertSentAt", error
  FROM job_runs WHERE "jobName" LIKE 'alerta:%'
 ORDER BY "startedAt" DESC LIMIT 50;
```

## 5. Gatilhos de rollback (qualquer um)

- Login da sua conta volta para a tela de entrada, dá erro ou 500 (passo 2).
- `login-org-resolution-failed` no log.
- `permission denied` / `42501` citando `resolve_user_organization` ou `count_user_access_grants`.
- Consulta D com `divergentes > 0` ou `contagem_zero > 0`; consulta B com alguma trava diferente do esperado.
- Telas de Vendas/Carteira vazias ou com erro.

**Não** são gatilho: `prisma-global-client-in-transaction` (registrar e corrigir na sequência); build com **Error** (nada foi ao ar).

## 6. Instant Rollback, passo a passo (menos de 1 minuto)

1. Vercel → projeto `incorpora` → **Deployments**.
2. Achar o deploy de produção **anterior** — commit `6a60219` (anotado no passo 0.3).
3. Menu **⋯** desse deploy → **Instant Rollback** → confirmar. Não rebuilda: troca em segundos.
4. Repetir o passo 2 do teste (login em janela anônima) para confirmar que voltou.
5. **As migrations ficam no banco, e isso é inofensivo**: elas só criam as duas funções (com EXECUTE só para `app_user`); o código antigo não as chama e lê `access_grants` direto (não há RLS ativo). **Não apagar** as funções nem as migrations (CLAUDE.md); a correção entra como commit novo.
6. **Depois do rollback**, a Vercel deixa de promover automaticamente os próximos pushes no master. Quando a correção estiver pronta, promova o deploy novo à mão (ou **Undo Rollback**).
7. Me mande o que viu (passo e mensagem); eu leio os logs que ainda estiverem na janela.

## 7. Quanto tempo olhar antes de considerar estável

| Quando | O quê | Estável se |
|---|---|---|
| 0–15 min | Seções 1 a 4 completas | tudo como esperado |
| +1 h | Login de novo em janela anônima; buscas da seção 4 de novo (a janela de logs ainda cobre o deploy) | zero ocorrências |
| Dia seguinte, depois das 03:00 UTC | Tela de Jobs: `recalculate-installments` com SUCCESS; auditoria diária gerada (a V7 pode estar em ALERT se a corrente do alerta ainda não tiver despachado — isso é esperado e não é deste deploy) | jobs com SUCCESS |
| 7 dias | `prisma-global-client-in-transaction` e `login-org-resolution-failed` — **chegam por e-mail** (corrente do alerta); conferência a qualquer hora pela consulta E | zero |

**Estável** = os três primeiros itens limpos (~24 h). A vigilância da trava segue por 7 dias, mas, sem RLS ativo, uma ocorrência dela não muda comportamento — é aviso de caminho a corrigir, não motivo de rollback.

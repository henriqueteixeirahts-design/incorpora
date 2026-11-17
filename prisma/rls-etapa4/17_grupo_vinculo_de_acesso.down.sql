-- RLS Etapa 4 — REVERSÃO do Grupo 17: Vínculo de acesso
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."access_grants";
ALTER TABLE public."access_grants" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."access_grants" DISABLE ROW LEVEL SECURITY;

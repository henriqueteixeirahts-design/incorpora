-- RLS Etapa 4 — REVERSÃO do Grupo 5: SPEs
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."special_purpose_entities";
ALTER TABLE public."special_purpose_entities" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."special_purpose_entities" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_bank_accounts";
ALTER TABLE public."spe_bank_accounts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_bank_accounts" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_lands";
ALTER TABLE public."spe_lands" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_lands" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_partners";
ALTER TABLE public."spe_partners" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_partners" DISABLE ROW LEVEL SECURITY;

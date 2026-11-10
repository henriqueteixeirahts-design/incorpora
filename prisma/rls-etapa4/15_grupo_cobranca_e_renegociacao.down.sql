-- RLS Etapa 4 — REVERSÃO do Grupo 15: Cobrança e renegociação
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."collection_contact_logs";
ALTER TABLE public."collection_contact_logs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."collection_contact_logs" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_agreements";
ALTER TABLE public."renegotiation_agreements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_agreements" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_approvals";
ALTER TABLE public."renegotiation_approvals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_approvals" DISABLE ROW LEVEL SECURITY;

-- RLS Etapa 4 — Grupo 15: Cobrança e renegociação (3 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 15_grupo_cobranca_e_renegociacao.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- collection_contact_logs — Tier 1 — organizationId
ALTER TABLE public."collection_contact_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_contact_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."collection_contact_logs";
CREATE POLICY tenant_isolation ON public."collection_contact_logs" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- renegotiation_agreements — Tier 1 — organizationId
ALTER TABLE public."renegotiation_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_agreements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_agreements";
CREATE POLICY tenant_isolation ON public."renegotiation_agreements" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- renegotiation_approvals — Tier 2 — agreementId → renegotiation_agreements
ALTER TABLE public."renegotiation_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_approvals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_approvals";
CREATE POLICY tenant_isolation ON public."renegotiation_approvals" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."renegotiation_agreements" h1 WHERE h1.id = "renegotiation_approvals"."agreementId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."renegotiation_agreements" h1 WHERE h1.id = "renegotiation_approvals"."agreementId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

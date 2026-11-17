-- RLS Etapa 4 — Grupo 2: Modelos de documento e documentos (3 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 02_grupo_modelos_de_documento_e_documentos.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- document_templates — Tier 1 — organizationId
ALTER TABLE public."document_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."document_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."document_templates";
CREATE POLICY tenant_isolation ON public."document_templates" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- document_template_developments — Tier 2 — documentTemplateId → document_templates
ALTER TABLE public."document_template_developments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."document_template_developments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."document_template_developments";
CREATE POLICY tenant_isolation ON public."document_template_developments" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."document_templates" h1 WHERE h1.id = "document_template_developments"."documentTemplateId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."document_templates" h1 WHERE h1.id = "document_template_developments"."documentTemplateId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- documents — Tier 1 — organizationId
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."documents";
CREATE POLICY tenant_isolation ON public."documents" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

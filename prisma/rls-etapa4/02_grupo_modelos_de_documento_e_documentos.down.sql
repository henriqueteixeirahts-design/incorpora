-- RLS Etapa 4 — REVERSÃO do Grupo 2: Modelos de documento e documentos
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."document_templates";
ALTER TABLE public."document_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."document_templates" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."document_template_developments";
ALTER TABLE public."document_template_developments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."document_template_developments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."documents";
ALTER TABLE public."documents" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."documents" DISABLE ROW LEVEL SECURITY;

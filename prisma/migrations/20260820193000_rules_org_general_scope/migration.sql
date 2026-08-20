-- docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3 — as 6 regras parametrizáveis
-- (reserva, avaliação de proposta, liberação de comissão, distrato, régua de
-- cobrança, renegociação) passam a suportar uma linha "geral" por organização
-- (developmentId nulo) além da linha por empreendimento que já existia.
-- Aditiva: developmentId vira opcional, organizationId novo é preenchido a
-- partir do Development de cada linha existente (nenhuma linha muda de
-- significado, só ganha o organizationId que já era alcançável via join).

-- reservation_rules
ALTER TABLE "reservation_rules" ADD COLUMN "organizationId" UUID;
UPDATE "reservation_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "reservation_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "reservation_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "reservation_rules" ADD CONSTRAINT "reservation_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- proposal_evaluation_rules
ALTER TABLE "proposal_evaluation_rules" ADD COLUMN "organizationId" UUID;
UPDATE "proposal_evaluation_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "proposal_evaluation_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "proposal_evaluation_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "proposal_evaluation_rules" ADD CONSTRAINT "proposal_evaluation_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- commission_release_rules
ALTER TABLE "commission_release_rules" ADD COLUMN "organizationId" UUID;
UPDATE "commission_release_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "commission_release_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "commission_release_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "commission_release_rules" ADD CONSTRAINT "commission_release_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- distrato_rules
ALTER TABLE "distrato_rules" ADD COLUMN "organizationId" UUID;
UPDATE "distrato_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "distrato_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "distrato_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "distrato_rules" ADD CONSTRAINT "distrato_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- collection_rules
ALTER TABLE "collection_rules" ADD COLUMN "organizationId" UUID;
UPDATE "collection_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "collection_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "collection_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- renegotiation_rules
ALTER TABLE "renegotiation_rules" ADD COLUMN "organizationId" UUID;
UPDATE "renegotiation_rules" r SET "organizationId" = d."organizationId"
  FROM "developments" d WHERE d."id" = r."developmentId";
ALTER TABLE "renegotiation_rules" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "renegotiation_rules" ALTER COLUMN "developmentId" DROP NOT NULL;
ALTER TABLE "renegotiation_rules" ADD CONSTRAINT "renegotiation_rules_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

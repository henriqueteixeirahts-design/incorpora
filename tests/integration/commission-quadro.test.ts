import {aroundEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import { createContract } from "@/server/contracts";
import { createDocumentTemplate } from "@/server/document-templates";
import { previewDocumentGeneration } from "@/server/document-generation";
import { upsertCommissionRule } from "@/server/commission-rules";
import { getOrCreateDraftPartnershipAgreement } from "@/server/partnership-agreements";
import { setCurrentOrgId, withOrgContext } from "@/lib/tenant-context";
import { fixturePrisma } from "./helpers/tenant";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 8 — quadro de comissão
 * (Lei 13.786/18, art. 33) injetado no contrato via {{quadro_comissao}}.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Quadro de Comissão" } });
  setCurrentOrgId(org.id);
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "quadro-comissao@teste.local", fullName: "Usuário Quadro" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Quadro de Comissão", document: "63265390000141", status: "ACTIVE",
    email: "spe-quadro@teste.local", phone: "62999990096",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Quadro", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  await upsertCommissionRule(context, developmentId, {
    externalCommissionPercent: 6, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
  });
});

aroundEach((runTest) => withOrgContext(org.id, runTest));

afterAll(async () => {
  const orgIds = [org.id];
  await fixturePrisma().document.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().documentTemplate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().partnershipAgreement.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().externalCommissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await fixturePrisma().commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await fixturePrisma().contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await fixturePrisma().unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await fixturePrisma().customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().commissionRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await fixturePrisma().user.deleteMany({ where: { id: user.id } });
  await fixturePrisma().organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Quadro de comissão — {{quadro_comissao}} resolvido a partir do ExternalCommissionSplit", () => {
  it("lista o corretor com CRECI, documento e valor; comissão do quadro_resumo usa o valor externo, não o legado", async () => {
    const broker = await createBroker(context, { name: "Corretor Quadro", document: "11122233396", creci: "GO-99887" });
    const agreement = await getOrCreateDraftPartnershipAgreement(context, { partnerType: "AUTONOMOUS_BROKER", brokerId: broker.id });
    await prisma.partnershipAgreement.update({ where: { id: agreement.id }, data: { status: "SIGNED", signedAt: new Date() } });

    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "QDR-1", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Quadro", document: "44455566677" });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Quadro", downPaymentPercent: 20, monthlyInstallments: 5 });
    const proposal = await createProposal(context, {
      developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
    });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id);

    const template = await createDocumentTemplate(context, {
      name: "CCV Quadro", type: "SALES_CONTRACT",
      content: "Comprador: {{cliente.nome}}.\n\n{{quadro_resumo}}\n\n{{quadro_comissao}}",
      developmentIds: [],
    });

    const preview = await previewDocumentGeneration(org.id, contract.id, template.id);
    expect(preview.status).toBe("READY");
    if (preview.status !== "READY") return;

    expect(preview.text).toContain("GO-99887");
    expect(preview.text).toContain("Corretor Quadro");
    expect(preview.text).toContain("11122233396");
    expect(preview.text).toContain("R$"); // valor formatado presente
    expect(preview.text).toContain("Comissão de corretagem: 100% (R$"); // 6% resolvido em 1 split autônomo = 100% dele
  });
});

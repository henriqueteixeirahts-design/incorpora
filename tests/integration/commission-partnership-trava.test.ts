import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5, caso de teste obrigatório
 * 7 — trava: venda pode fechar, mas o contrato de compra e venda não é
 * gerado sem a parceria do beneficiário da comissão externa assinada.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let templateId: string;

let seq = 0;

async function setUpContract(brokerId?: string) {
  seq += 1;
  const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: `TRAVA-${seq}`, referenceValue: 200000 });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente Trava ${seq}`, document: `${20000000000 + seq}`.slice(0, 11) });
  const salesTable = await createSalesTable(context, { developmentId, name: `Tabela Trava ${Math.random()}`, downPaymentPercent: 20, monthlyInstallments: 5 });
  const proposal = await createProposal(context, {
    developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId, discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  return contract;
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Trava de Parceria" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "trava-parceria@teste.local", fullName: "Usuário Trava" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Trava de Parceria", document: "63265390000141", status: "ACTIVE",
    email: "spe-trava@teste.local", phone: "62999990094",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Trava", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  await upsertCommissionRule(context, developmentId, {
    externalCommissionPercent: 6, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
  });

  const template = await createDocumentTemplate(context, {
    name: "CCV Trava", type: "SALES_CONTRACT", content: "Comprador: {{cliente.nome}}.", developmentIds: [],
  });
  templateId = template.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.partnershipAgreement.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.externalCommissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Caso 7 — trava bloqueia geração sem parceria assinada", () => {
  it("corretor autônomo sem parceria: bloqueia a geração", async () => {
    const broker = await createBroker(context, { name: "Corretor Sem Parceria" });
    const contract = await setUpContract(broker.id);

    await expect(previewDocumentGeneration(org.id, contract.id, templateId)).rejects.toThrow(
      /parceria com o corretor autônomo.*não foi assinada/,
    );
  });

  it("corretor autônomo COM parceria assinada: gera normalmente", async () => {
    const broker = await createBroker(context, { name: "Corretor Com Parceria" });
    const agreement = await getOrCreateDraftPartnershipAgreement(context, { partnerType: "AUTONOMOUS_BROKER", brokerId: broker.id });
    await prisma.partnershipAgreement.update({ where: { id: agreement.id }, data: { status: "SIGNED", signedAt: new Date() } });

    const contract = await setUpContract(broker.id);
    const preview = await previewDocumentGeneration(org.id, contract.id, templateId);
    expect(preview.status).toBe("READY");
  });

  it("venda sem corretor/imobiliária: não trava (nada pra exigir)", async () => {
    const contract = await setUpContract(undefined);
    const preview = await previewDocumentGeneration(org.id, contract.id, templateId);
    expect(preview.status).toBe("READY");
  });

  it("empreendimento sem CommissionRule (modelo legado): não trava mesmo com corretor sem parceria", async () => {
    const legacyDevelopment = await createDevelopment(context, {
      speId: (await createSpe(context, {
        name: "SPE Legado Trava", document: "11444777000161", status: "ACTIVE", email: "spe-legado-trava@teste.local", phone: "62999990095",
      })).id,
      name: "Empreendimento Legado Trava",
      type: "RESIDENTIAL_BUILDING",
    });
    const broker = await createBroker(context, { name: "Corretor Legado Sem Parceria" });
    const unit = await createUnit(context, { developmentId: legacyDevelopment.id, unitType: "APARTMENT", number: "LEG-1", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Legado Trava", document: "98765432100" });
    const salesTable = await createSalesTable(context, { developmentId: legacyDevelopment.id, name: "Tabela Legado Trava", downPaymentPercent: 20, monthlyInstallments: 5, commissionPercent: 6 });
    const proposal = await createProposal(context, {
      developmentId: legacyDevelopment.id, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
    });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id);

    const preview = await previewDocumentGeneration(org.id, contract.id, templateId);
    expect(preview.status).toBe("READY");
  });
});

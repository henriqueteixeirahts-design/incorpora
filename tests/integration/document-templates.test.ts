import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import { createContract } from "@/server/contracts";
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  getLatestDocumentTemplateVersion,
  listDocumentTemplateVersions,
  listApplicableDocumentTemplates,
  setDocumentTemplateStatus,
} from "@/server/document-templates";
import {
  buildGenerationContext,
  previewDocumentGeneration,
  recordGeneratedDocument,
  listGeneratedDocuments,
} from "@/server/document-generation";

/**
 * Fase A, Parte 1 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md) — motor de
 * templates de documento: biblioteca versionada por organização, variáveis
 * resolvidas contra dados reais do contrato, e o bloqueio de geração
 * quando falta dado obrigatório no cadastro (spec 1.4).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let contractId: string;
let customerId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Modelos de Documento" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "modelos-doc@teste.local", fullName: "Usuário Modelos" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Modelos de Documento",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-modelos@teste.local",
    phone: "62999990050",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Modelos de Documento",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;

  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: "M101",
    referenceValue: 400000,
  });

  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: "Cliente Modelos",
    document: "02654427102",
  });
  customerId = customer.id;

  const salesTable = await createSalesTable(context, {
    developmentId,
    name: "Tabela Modelos",
    downPaymentPercent: 20,
    monthlyInstallments: 5,
  });

  const proposal = await createProposal(context, {
    developmentId,
    unitId: unit.id,
    customerId: customer.id,
    salesTableId: salesTable.id,
    discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  contractId = contract.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.documentTemplateDevelopment.deleteMany({
    where: { documentTemplate: { organizationId: { in: orgIds } } },
  });
  await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Biblioteca de modelos — versionamento", () => {
  it("criar um modelo começa na versão 1; editar cria a versão 2 sem apagar a 1", async () => {
    const v1 = await createDocumentTemplate(context, {
      name: "CCV Padrão",
      type: "SALES_CONTRACT",
      content: "Comprador: {{cliente.nome}}.",
      developmentIds: [],
    });
    expect(v1.version).toBe(1);

    const v2 = await updateDocumentTemplate(context, v1.templateGroupId, {
      name: "CCV Padrão",
      type: "SALES_CONTRACT",
      content: "Comprador: {{cliente.nome}}, CPF {{cliente.cpf_cnpj}}.",
      developmentIds: [],
    });
    expect(v2.version).toBe(2);
    expect(v2.templateGroupId).toBe(v1.templateGroupId);

    const history = await listDocumentTemplateVersions(org.id, v1.templateGroupId);
    expect(history.map((h) => h.version).sort()).toEqual([1, 2]);
    expect(history.find((h) => h.version === 1)?.content).toBe("Comprador: {{cliente.nome}}.");

    const latest = await getLatestDocumentTemplateVersion(org.id, v1.templateGroupId);
    expect(latest?.id).toBe(v2.id);
  });

  it("ativar/inativar não cria versão nova", async () => {
    const v1 = await createDocumentTemplate(context, {
      name: "Distrato Padrão",
      type: "RESCISSION",
      content: "Distrato de {{cliente.nome}}.",
      developmentIds: [],
    });

    await setDocumentTemplateStatus(context, v1.templateGroupId, "INACTIVE");
    let latest = await getLatestDocumentTemplateVersion(org.id, v1.templateGroupId);
    expect(latest?.status).toBe("INACTIVE");
    expect(latest?.version).toBe(1);

    await setDocumentTemplateStatus(context, v1.templateGroupId, "ACTIVE");
    latest = await getLatestDocumentTemplateVersion(org.id, v1.templateGroupId);
    expect(latest?.status).toBe("ACTIVE");
    expect(latest?.version).toBe(1);
  });

  it("sem empreendimentos vinculados, o modelo se aplica a todos; com vínculo, só aos listados", async () => {
    const otherDevelopment = await createDevelopment(context, {
      speId: (await prisma.development.findUniqueOrThrow({ where: { id: developmentId } })).speId,
      name: "Outro Empreendimento",
      type: "RESIDENTIAL_BUILDING",
    });

    const global = await createDocumentTemplate(context, {
      name: "Modelo Global",
      type: "SALES_CONTRACT",
      content: "{{cliente.nome}}",
      developmentIds: [],
    });
    const specific = await createDocumentTemplate(context, {
      name: "Modelo Específico",
      type: "SALES_CONTRACT",
      content: "{{cliente.nome}}",
      developmentIds: [developmentId],
    });

    const applicableToDev = await listApplicableDocumentTemplates(org.id, developmentId, "SALES_CONTRACT");
    expect(applicableToDev.map((t) => t.id)).toEqual(expect.arrayContaining([global.id, specific.id]));

    const applicableToOther = await listApplicableDocumentTemplates(org.id, otherDevelopment.id, "SALES_CONTRACT");
    expect(applicableToOther.map((t) => t.id)).toContain(global.id);
    expect(applicableToOther.map((t) => t.id)).not.toContain(specific.id);
  });
});

describe("Geração de documento — resolução real contra o contrato", () => {
  it("bloqueia a geração e lista o que falta quando o cadastro está incompleto", async () => {
    const template = await createDocumentTemplate(context, {
      name: "CCV com qualificação civil",
      type: "SALES_CONTRACT",
      content: "Comprador: {{cliente.nome}}, {{cliente.estado_civil}}, {{cliente.nacionalidade}}.",
      developmentIds: [],
    });

    const preview = await previewDocumentGeneration(org.id, contractId, template.id);
    expect(preview.status).toBe("MISSING_DATA");
    if (preview.status === "MISSING_DATA") {
      expect(preview.missing.sort()).toEqual(["cliente.estado_civil", "cliente.nacionalidade"]);
    }
  });

  it("gera com sucesso depois que o cadastro é completado — texto reflete os dados reais", async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { maritalStatus: "Casado", nationality: "Brasileira", profession: "Engenheiro" },
    });

    const template = await createDocumentTemplate(context, {
      name: "CCV com qualificação civil completa",
      type: "SALES_CONTRACT",
      content: "Comprador: {{cliente.nome}}, {{cliente.estado_civil}}, {{cliente.nacionalidade}}.\n\n{{quadro_resumo}}",
      developmentIds: [],
    });

    const preview = await previewDocumentGeneration(org.id, contractId, template.id);
    expect(preview.status).toBe("READY");
    if (preview.status === "READY") {
      expect(preview.text).toContain("Cliente Modelos, Casado, Brasileira");
      expect(preview.text).toContain("Preço:");
      expect(preview.templateVersion).toBe(1);
    }
  });

  it("versão substituída não pode mais ser usada pra gerar — força pegar a mais recente", async () => {
    const v1 = await createDocumentTemplate(context, {
      name: "CCV Versionado",
      type: "SALES_CONTRACT",
      content: "{{cliente.nome}}",
      developmentIds: [],
    });
    await updateDocumentTemplate(context, v1.templateGroupId, {
      name: "CCV Versionado",
      type: "SALES_CONTRACT",
      content: "{{cliente.nome}} — v2",
      developmentIds: [],
    });

    await expect(previewDocumentGeneration(org.id, contractId, v1.id)).rejects.toThrow(/substituída/);
  });

  it("registra o documento gerado com modelo + versão + quem + quando — rastreável", async () => {
    const template = await createDocumentTemplate(context, {
      name: "CCV Registro",
      type: "SALES_CONTRACT",
      content: "{{cliente.nome}}",
      developmentIds: [],
    });

    const before = await listGeneratedDocuments(org.id, contractId);
    expect(before).toHaveLength(0);

    await recordGeneratedDocument(context, {
      contractId,
      documentTemplateId: template.id,
      templateVersion: template.version,
      fileName: "ccv-registro-v1.pdf",
      storagePath: `contract-${contractId}/fake-path.pdf`,
      sizeBytes: 1234,
    });

    const after = await listGeneratedDocuments(org.id, contractId);
    expect(after).toHaveLength(1);
    expect(after[0].documentTemplateId).toBe(template.id);
    expect(after[0].documentTemplateVersion).toBe(1);
    expect(after[0].uploadedBy?.id).toBe(user.id);
  });

  it("índice sem cadastro resolve pro rótulo de juros fixos — não bloqueia a geração", async () => {
    const ctx = await buildGenerationContext(org.id, contractId);
    expect(ctx.correction.preHabiteSeIndexName).toBeNull();
    expect(ctx.correction.postHabiteSeIndexName).toBeNull();
  });

  it("unidade.area resolve por privateArea mesmo sem totalArea preenchido (docs/RELATORIO_TESTDRIVE.md, achado 22)", async () => {
    // Repro exata do achado: unidade com só área privativa cadastrada (o
    // espelho de vendas já mostrava isso corretamente) — o gerador de
    // documento lia só totalArea antes do fix e resolvia vazio.
    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "M-AREA-01",
      referenceValue: 450000,
      privateArea: 80,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Área",
      document: "05192837465",
    });
    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      discountPercent: 0,
      proposedDownPaymentPercent: 100,
      proposedMonthlyInstallments: 0,
      proposedKeysInstallmentPercent: 0,
    });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id);

    const ctx = await buildGenerationContext(org.id, contract.id);
    expect(ctx.unit.area).toBe(80);

    const template = await createDocumentTemplate(context, {
      name: "CCV com área",
      type: "SALES_CONTRACT",
      content: "Unidade {{unidade.identificacao}}, área {{unidade.area}}.",
      developmentIds: [],
    });
    const preview = await previewDocumentGeneration(org.id, contract.id, template.id);
    expect(preview.status).toBe("READY");
    if (preview.status === "READY") {
      expect(preview.text).toContain("área 80 m²");
    }
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê nem edita modelo da Org A, nem gera documento a partir do contrato da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Modelos de Documento" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-modelos@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

    try {
      const templateA = await createDocumentTemplate(context, {
        name: "Modelo Isolamento",
        type: "SALES_CONTRACT",
        content: "{{cliente.nome}}",
        developmentIds: [],
      });

      await expect(
        updateDocumentTemplate(contextB, templateA.templateGroupId, {
          name: "Hackeado",
          type: "SALES_CONTRACT",
          content: "x",
          developmentIds: [],
        }),
      ).rejects.toThrow();

      const orgBTemplates = await listApplicableDocumentTemplates(orgB.id, developmentId, "SALES_CONTRACT");
      expect(orgBTemplates.map((t) => t.id)).not.toContain(templateA.id);

      await expect(previewDocumentGeneration(orgB.id, contractId, templateA.id)).rejects.toThrow();
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});

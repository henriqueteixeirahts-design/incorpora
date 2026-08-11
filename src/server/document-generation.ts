import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import {
  resolveDocumentVariables,
  substituteTemplate,
  type DocumentVariableContext,
} from "@/lib/document-variables";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import { getLatestDocumentTemplateVersion } from "@/server/document-templates";
import type { AccessContext } from "@/server/auth-context";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatStructuredAddress(entity: {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  address: string | null;
}): string {
  const parts = [
    entity.street ? `${entity.street}${entity.number ? `, ${entity.number}` : ""}` : null,
    entity.complement,
    entity.neighborhood,
    entity.city && entity.state ? `${entity.city}/${entity.state}` : entity.city,
    entity.zipCode,
  ].filter((part): part is string => !!part && part.trim() !== "");

  if (parts.length > 0) return parts.join(" — ");
  return entity.address ?? "";
}

const AMENDMENT_TYPE_LABELS: Record<string, string> = {
  FLOW_RENEGOTIATION: "Renegociação de fluxo",
  UNIT_CHANGE: "Alteração de unidade",
  TERM_CHANGE: "Alteração de prazo",
  OTHER: "Outro",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Busca todos os dados necessários pra resolver as variáveis de um contrato.
 * Quando `amendmentOverride` é passado (geração do documento de um aditivo),
 * o fluxo/valor total exibidos são os do aditivo (o novo fluxo renegociado),
 * não os do contrato original — e as variáveis `{{aditivo.*}}` resolvem.
 * Quando `assignmentOverride` é passado (geração do documento de cessão de
 * direitos), as variáveis `{{cessao.*}}`/`{{cedente.*}}`/`{{cessionario.*}}`
 * resolvem — o cliente principal (`{{cliente.*}}`) continua sendo o titular
 * atual do contrato (o cedente, já que a cessão ainda não foi assinada
 * quando o documento é gerado). Quando `distratoOverride` é passado
 * (geração do documento de distrato), as variáveis `{{distrato.*}}`
 * resolvem com o demonstrativo do acerto.
 */
export async function buildGenerationContext(
  organizationId: string,
  contractId: string,
  amendmentOverride?: { number: string; type: string; proposedPaymentFlow: PaymentFlowResult | null },
  assignmentOverride?: {
    number: string;
    assignmentDate: Date;
    feeAmount: number | null;
    previousCustomer: { name: string; document: string };
    newCustomer: { name: string; document: string };
  },
  distratoOverride?: {
    number: string;
    totalPaid: number;
    retentionPercent: number;
    retentionAmount: number;
    brokerageDeductionAmount: number | null;
    occupancyFeeAmount: number | null;
    refundAmount: number;
    refundTerms: string | null;
  },
  statementOverride?: {
    asOfDateLabel: string;
    situationLabel: string;
    contractedValueLabel: string;
    totalPaidLabel: string;
    outstandingBalanceLabel: string;
    percentPaidLabel: string;
  },
): Promise<DocumentVariableContext> {
  const contract = await prisma.contract.findFirstOrThrow({
    where: { id: contractId, organizationId },
    include: {
      organization: true,
      indexRule: true,
      unit: {
        include: {
          linksAsPrincipal: { include: { accessoryUnit: true } },
        },
      },
      customer: true,
      development: {
        include: {
          spe: {
            include: {
              partners: { where: { role: "ADMINISTRATOR" } },
            },
          },
          postHabiteSeIndexRule: true,
        },
      },
      sale: {
        include: {
          proposal: true,
          commissionSplits: true,
        },
      },
    },
  });

  const representative =
    contract.development.spe.partners.find((p) => p.endDate === null) ??
    contract.development.spe.partners[0] ??
    null;

  const flow = amendmentOverride
    ? amendmentOverride.proposedPaymentFlow
    : ((contract.sale.proposal.proposedPaymentFlow ??
        contract.sale.proposal.paymentFlow) as unknown as PaymentFlowResult | null);
  const items = flow?.items ?? [];
  const downPaymentAmount = items.find((i) => i.isDownPayment)?.amount ?? 0;
  const totalValue = amendmentOverride
    ? round2(items.reduce((sum, item) => sum + item.amount, 0))
    : Number(contract.sale.salePrice);

  const commissionSplits = contract.sale.commissionSplits;
  const commissionPercent =
    commissionSplits.length > 0
      ? commissionSplits.reduce((sum, s) => sum + Number(s.percent), 0)
      : null;
  const commissionTotalValue =
    commissionSplits.length > 0
      ? commissionSplits.reduce((sum, s) => sum + Number(s.value), 0)
      : null;

  const parkingSpaces = contract.unit.linksAsPrincipal
    .map((link) => link.accessoryUnit)
    .filter((u) => u.unitType === "PARKING_SPACE")
    .map((u) => u.number);

  return {
    organization: { name: contract.organization.name },
    spe: {
      name: contract.development.spe.name,
      document: contract.development.spe.document,
      addressFormatted: formatStructuredAddress(contract.development.spe),
      representativeName: representative?.name ?? null,
    },
    development: {
      name: contract.development.name,
      addressFormatted:
        [contract.development.address, contract.development.city && contract.development.state
          ? `${contract.development.city}/${contract.development.state}`
          : contract.development.city]
          .filter((part): part is string => !!part && part.trim() !== "")
          .join(" — ") || "",
      motherPropertyRecord: contract.development.motherPropertyRecord,
      registrationNumber: contract.development.registrationNumber,
      expectedDeliveryDate: contract.development.expectedDeliveryDate,
    },
    unit: {
      identification: contract.unit.number,
      area: contract.unit.totalArea !== null ? Number(contract.unit.totalArea) : null,
      idealFraction: contract.unit.idealFraction !== null ? Number(contract.unit.idealFraction) : null,
      parkingSpaces,
    },
    customer: {
      name: contract.customer.name,
      document: contract.customer.document,
      addressFormatted: formatStructuredAddress(contract.customer),
      maritalStatus: contract.customer.maritalStatus,
      nationality: contract.customer.nationality,
      profession: contract.customer.profession,
    },
    sale: { totalValue },
    flow: { items, downPaymentAmount },
    amendment: amendmentOverride
      ? { number: amendmentOverride.number, typeLabel: AMENDMENT_TYPE_LABELS[amendmentOverride.type] ?? amendmentOverride.type }
      : null,
    assignment: assignmentOverride
      ? {
          number: assignmentOverride.number,
          dateLabel: assignmentOverride.assignmentDate.toLocaleDateString("pt-BR"),
          feeLabel: assignmentOverride.feeAmount ? formatCurrency(assignmentOverride.feeAmount) : "Não há",
          previousCustomerName: assignmentOverride.previousCustomer.name,
          previousCustomerDocument: assignmentOverride.previousCustomer.document,
          newCustomerName: assignmentOverride.newCustomer.name,
          newCustomerDocument: assignmentOverride.newCustomer.document,
        }
      : null,
    distrato: distratoOverride
      ? {
          number: distratoOverride.number,
          totalPaidLabel: formatCurrency(distratoOverride.totalPaid),
          retentionPercentLabel: `${distratoOverride.retentionPercent}%`,
          retentionAmountLabel: formatCurrency(distratoOverride.retentionAmount),
          brokerageDeductionLabel: distratoOverride.brokerageDeductionAmount
            ? formatCurrency(distratoOverride.brokerageDeductionAmount)
            : "Não há",
          occupancyFeeLabel: distratoOverride.occupancyFeeAmount
            ? formatCurrency(distratoOverride.occupancyFeeAmount)
            : "Não há",
          refundAmountLabel: formatCurrency(distratoOverride.refundAmount),
          refundTermsLabel: distratoOverride.refundTerms ?? "",
        }
      : null,
    statement: statementOverride ?? null,
    correction: {
      preHabiteSeIndexName: contract.indexRule?.name ?? null,
      postHabiteSeIndexName: contract.development.postHabiteSeIndexRule?.name ?? null,
    },
    commission: { percent: commissionPercent, totalValue: commissionTotalValue },
    penalties: {
      finePercent: Number(contract.latePaymentFinePercent),
      monthlyInterestPercent: Number(contract.latePaymentMonthlyInterestPercent),
    },
  };
}

export type GenerationPreview =
  | { status: "MISSING_DATA"; missing: string[]; templateName: string }
  | {
      status: "READY";
      text: string;
      templateName: string;
      templateVersion: number;
      documentTemplateId: string;
    };

/**
 * Resolve as variáveis do modelo contra os dados reais do contrato, sem
 * gerar/persistir nada ainda — só pra decidir se pode prosseguir (spec 1.4:
 * avisar ANTES de gerar quando faltar dado, listando o que falta). Quando
 * `amendmentId` é passado, gera o documento do ADITIVO (fluxo/valor total
 * do aditivo, variáveis `{{aditivo.*}}` resolvidas) em vez do contrato
 * original.
 */
export async function previewDocumentGeneration(
  organizationId: string,
  contractId: string,
  documentTemplateId: string,
  amendmentId?: string,
  assignmentId?: string,
  distratoId?: string,
  statementOverride?: {
    asOfDateLabel: string;
    situationLabel: string;
    contractedValueLabel: string;
    totalPaidLabel: string;
    outstandingBalanceLabel: string;
    percentPaidLabel: string;
  },
): Promise<GenerationPreview> {
  const template = await prisma.documentTemplate.findFirst({
    where: { id: documentTemplateId, organizationId },
  });
  if (!template) throw new Error("Modelo de documento inválido.");

  const latest = await getLatestDocumentTemplateVersion(organizationId, template.templateGroupId);
  if (!latest || latest.id !== template.id) {
    throw new Error("Essa versão do modelo foi substituída — use a versão mais recente.");
  }
  if (latest.status !== "ACTIVE") {
    throw new Error("Esse modelo está inativo.");
  }

  let amendmentOverride: { number: string; type: string; proposedPaymentFlow: PaymentFlowResult | null } | undefined;
  if (amendmentId) {
    const amendment = await prisma.contractAmendment.findFirst({
      where: { id: amendmentId, organizationId, contractId },
    });
    if (!amendment) throw new Error("Aditivo inválido.");
    amendmentOverride = {
      number: amendment.amendmentNumber,
      type: amendment.type,
      proposedPaymentFlow: amendment.proposedPaymentFlow as unknown as PaymentFlowResult | null,
    };
  }

  let assignmentOverride:
    | {
        number: string;
        assignmentDate: Date;
        feeAmount: number | null;
        previousCustomer: { name: string; document: string };
        newCustomer: { name: string; document: string };
      }
    | undefined;
  if (assignmentId) {
    const assignment = await prisma.contractAssignment.findFirst({
      where: { id: assignmentId, organizationId, contractId },
      include: { previousCustomer: true, newCustomer: true },
    });
    if (!assignment) throw new Error("Cessão inválida.");
    assignmentOverride = {
      number: assignment.assignmentNumber,
      assignmentDate: assignment.assignmentDate,
      feeAmount: assignment.feeAmount ? Number(assignment.feeAmount) : null,
      previousCustomer: { name: assignment.previousCustomer.name, document: assignment.previousCustomer.document },
      newCustomer: { name: assignment.newCustomer.name, document: assignment.newCustomer.document },
    };
  }

  let distratoOverride:
    | {
        number: string;
        totalPaid: number;
        retentionPercent: number;
        retentionAmount: number;
        brokerageDeductionAmount: number | null;
        occupancyFeeAmount: number | null;
        refundAmount: number;
        refundTerms: string | null;
      }
    | undefined;
  if (distratoId) {
    const distrato = await prisma.contractDistrato.findFirst({
      where: { id: distratoId, organizationId, contractId },
    });
    if (!distrato) throw new Error("Distrato inválido.");
    distratoOverride = {
      number: distrato.distratoNumber,
      totalPaid: Number(distrato.totalPaid),
      retentionPercent: Number(distrato.retentionPercent),
      retentionAmount: Number(distrato.retentionAmount),
      brokerageDeductionAmount: distrato.brokerageDeductionAmount ? Number(distrato.brokerageDeductionAmount) : null,
      occupancyFeeAmount: distrato.occupancyFeeAmount ? Number(distrato.occupancyFeeAmount) : null,
      refundAmount: Number(distrato.refundAmount),
      refundTerms: distrato.refundTerms,
    };
  }

  const ctx = await buildGenerationContext(
    organizationId,
    contractId,
    amendmentOverride,
    assignmentOverride,
    distratoOverride,
    statementOverride,
  );
  const resolved = resolveDocumentVariables(ctx);
  const { text, missing } = substituteTemplate(template.content, resolved);

  if (missing.length > 0) {
    return { status: "MISSING_DATA", missing, templateName: template.name };
  }

  return {
    status: "READY",
    text,
    templateName: template.name,
    templateVersion: template.version,
    documentTemplateId: template.id,
  };
}

/**
 * Registra o documento já gerado e enviado ao Storage (spec 1.4: "modelo
 * usado + versão, quem gerou, quando"). O upload em si acontece na camada de
 * action, no mesmo padrão de `uploadContractDocument` — esta função só grava
 * o metadado depois que o arquivo já está no bucket.
 */
export async function recordGeneratedDocument(
  context: AccessContext,
  params: {
    contractId: string;
    documentTemplateId: string;
    templateVersion: number;
    fileName: string;
    storagePath: string;
    sizeBytes: number;
    amendmentId?: string;
    assignmentId?: string;
    distratoId?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const entityType = params.amendmentId
      ? "ContractAmendment"
      : params.assignmentId
        ? "ContractAssignment"
        : params.distratoId
          ? "ContractDistrato"
          : "Contract";
    const entityId = params.amendmentId ?? params.assignmentId ?? params.distratoId ?? params.contractId;
    const document = await tx.document.create({
      data: {
        organizationId: context.organizationId,
        entityType,
        entityId,
        category: "CONTRACT",
        fileName: params.fileName,
        fileUrl: params.storagePath,
        mimeType: "application/pdf",
        sizeBytes: params.sizeBytes,
        documentTemplateId: params.documentTemplateId,
        documentTemplateVersion: params.templateVersion,
        uploadedById: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "generate",
      entityType: "Document",
      entityId: document.id,
      afterData: document,
    });

    return document;
  });
}

export function listGeneratedDocuments(organizationId: string, contractId: string) {
  return prisma.document.findMany({
    where: { organizationId, entityType: "Contract", entityId: contractId, documentTemplateId: { not: null } },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export function listAmendmentGeneratedDocuments(organizationId: string, amendmentId: string) {
  return prisma.document.findMany({
    where: { organizationId, entityType: "ContractAmendment", entityId: amendmentId, documentTemplateId: { not: null } },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export function listAssignmentGeneratedDocuments(organizationId: string, assignmentId: string) {
  return prisma.document.findMany({
    where: { organizationId, entityType: "ContractAssignment", entityId: assignmentId, documentTemplateId: { not: null } },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export function listDistratoGeneratedDocuments(organizationId: string, distratoId: string) {
  return prisma.document.findMany({
    where: { organizationId, entityType: "ContractDistrato", entityId: distratoId, documentTemplateId: { not: null } },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

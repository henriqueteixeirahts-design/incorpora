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

/** Busca todos os dados necessários pra resolver as variáveis de um contrato. */
export async function buildGenerationContext(
  organizationId: string,
  contractId: string,
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

  const flow = (contract.sale.proposal.proposedPaymentFlow ??
    contract.sale.proposal.paymentFlow) as unknown as PaymentFlowResult | null;
  const items = flow?.items ?? [];
  const downPaymentAmount = items.find((i) => i.isDownPayment)?.amount ?? 0;

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
    sale: { totalValue: Number(contract.sale.salePrice) },
    flow: { items, downPaymentAmount },
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
 * avisar ANTES de gerar quando faltar dado, listando o que falta).
 */
export async function previewDocumentGeneration(
  organizationId: string,
  contractId: string,
  documentTemplateId: string,
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

  const ctx = await buildGenerationContext(organizationId, contractId);
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
  },
) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        organizationId: context.organizationId,
        entityType: "Contract",
        entityId: params.contractId,
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

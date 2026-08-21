import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { uploadEntityDocument, deleteEntityDocumentFile } from "@/server/storage";
import type { AccessContext } from "@/server/auth-context";

/**
 * Contrato de parceria com corretor autônomo ou imobiliária
 * (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5). Um por corretor/
 * imobiliária — unicidade garantida aqui (find-then-create), não no schema.
 * Documento é anexado diretamente (assinatura manual, sem motor de
 * templates nesta etapa — a geração automática do modelo de parceria fica
 * pra uma passada futura, registrado em docs/STATUS_IMPLANTACAO.md).
 */

export function listPartnershipAgreements(context: AccessContext) {
  return prisma.partnershipAgreement.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { createdAt: "desc" },
  });
}

async function findExisting(organizationId: string, partnerType: "AGENCY" | "AUTONOMOUS_BROKER", agencyId?: string, brokerId?: string) {
  return prisma.partnershipAgreement.findFirst({
    where: { organizationId, partnerType, agencyId: agencyId ?? null, brokerId: brokerId ?? null },
  });
}

/** Busca a parceria de um corretor autônomo ou imobiliária, criando um rascunho se ainda não existir. */
export async function getOrCreateDraftPartnershipAgreement(
  context: AccessContext,
  params: { partnerType: "AGENCY" | "AUTONOMOUS_BROKER"; agencyId?: string; brokerId?: string },
) {
  const existing = await findExisting(context.organizationId, params.partnerType, params.agencyId, params.brokerId);
  if (existing) return existing;

  if (params.partnerType === "AGENCY" && params.agencyId) {
    const agency = await prisma.realEstateAgency.findFirst({ where: { id: params.agencyId, organizationId: context.organizationId } });
    if (!agency) throw new Error("Imobiliária inválida.");
  }
  if (params.partnerType === "AUTONOMOUS_BROKER" && params.brokerId) {
    const broker = await prisma.broker.findFirst({ where: { id: params.brokerId, organizationId: context.organizationId } });
    if (!broker) throw new Error("Corretor inválido.");
  }

  return prisma.partnershipAgreement.create({
    data: {
      organizationId: context.organizationId,
      partnerType: params.partnerType,
      agencyId: params.agencyId,
      brokerId: params.brokerId,
    },
  });
}

/** Anexa o documento assinado e marca a parceria como SIGNED. */
export async function signPartnershipAgreement(context: AccessContext, agreementId: string, file: File) {
  const agreement = await prisma.partnershipAgreement.findFirst({
    where: { id: agreementId, organizationId: context.organizationId },
  });
  if (!agreement) throw new Error("Parceria não encontrada.");
  if (agreement.status === "SIGNED") throw new Error("Esta parceria já está assinada.");

  const path = await uploadEntityDocument(file, "PartnershipAgreement", agreementId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.partnershipAgreement.update({
      where: { id: agreementId },
      data: { status: "SIGNED", documentPath: path, signedAt: new Date() },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "PartnershipAgreement",
      entityId: agreementId,
      beforeData: { status: agreement.status },
      afterData: { status: "SIGNED" },
    });

    return updated;
  });
}

export async function revokePartnershipAgreement(context: AccessContext, agreementId: string) {
  const agreement = await prisma.partnershipAgreement.findFirst({
    where: { id: agreementId, organizationId: context.organizationId },
  });
  if (!agreement) throw new Error("Parceria não encontrada.");

  if (agreement.documentPath) await deleteEntityDocumentFile(agreement.documentPath);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.partnershipAgreement.update({
      where: { id: agreementId },
      data: { status: "DRAFT", documentPath: null, signedAt: null },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "PartnershipAgreement",
      entityId: agreementId,
      beforeData: { status: agreement.status },
      afterData: { status: "DRAFT" },
    });

    return updated;
  });
}

/**
 * TRAVA (Parte 5) — a venda pode fechar, mas o contrato de compra e venda
 * não é gerado enquanto a parceria do beneficiário da comissão externa não
 * estiver assinada. Só se aplica a vendas que usam o modelo novo de
 * comissão (com ExternalCommissionSplit resolvido) — vendas legadas não têm
 * essa exigência. Retorna null se não há nada a bloquear (autônomo/
 * vinculado com parceria assinada, ou venda sem corretor/imobiliária, ou
 * modelo legado); senão, a mensagem de erro pronta pra exibir.
 */
export async function checkPartnershipBlocksContractGeneration(
  organizationId: string,
  sale: { brokerId: string | null; agencyId: string | null },
  hasNewCommissionModel: boolean,
): Promise<string | null> {
  if (!hasNewCommissionModel) return null;
  if (!sale.brokerId && !sale.agencyId) return null;

  if (sale.agencyId) {
    const agreement = await findExisting(organizationId, "AGENCY", sale.agencyId);
    if (!agreement || agreement.status !== "SIGNED") {
      const agency = await prisma.realEstateAgency.findUnique({ where: { id: sale.agencyId } });
      return `Contrato não pode ser gerado: a parceria com a imobiliária "${agency?.name ?? sale.agencyId}" ainda não foi assinada (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5).`;
    }
    return null;
  }

  const agreement = await findExisting(organizationId, "AUTONOMOUS_BROKER", undefined, sale.brokerId!);
  if (!agreement || agreement.status !== "SIGNED") {
    const broker = await prisma.broker.findUnique({ where: { id: sale.brokerId! } });
    return `Contrato não pode ser gerado: a parceria com o corretor autônomo "${broker?.name ?? sale.brokerId}" ainda não foi assinada (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5).`;
  }
  return null;
}

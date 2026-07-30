import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { DocumentTemplateType } from "@/generated/prisma/client";

/**
 * Biblioteca de modelos de documento (Fase A, Parte 1). Cada modelo é uma
 * família versionada: `templateGroupId` é estável entre versões, `version`
 * incrementa a cada edição. Editar NUNCA sobrescreve uma versão — cria uma
 * nova linha e a anterior fica só de histórico (nunca apagada, rastreável
 * pro documento que a usou). Nasce por organização desde o início (Pilar 4
 * das Fundações multi-tenant) — sem linha "global" compartilhada.
 */

/** Um modelo por família (a versão mais recente), pra tela de listagem. */
export async function listDocumentTemplates(organizationId: string) {
  const templates = await prisma.documentTemplate.findMany({
    where: { organizationId },
    orderBy: [{ templateGroupId: "asc" }, { version: "desc" }],
    include: { developments: { include: { development: true } } },
  });

  const latestByGroup = new Map<string, (typeof templates)[number]>();
  const versionCountByGroup = new Map<string, number>();
  for (const template of templates) {
    versionCountByGroup.set(
      template.templateGroupId,
      (versionCountByGroup.get(template.templateGroupId) ?? 0) + 1,
    );
    if (!latestByGroup.has(template.templateGroupId)) {
      latestByGroup.set(template.templateGroupId, template);
    }
  }

  return Array.from(latestByGroup.values())
    .map((template) => ({ ...template, versionCount: versionCountByGroup.get(template.templateGroupId) ?? 1 }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Histórico completo de versões de uma família de modelo, mais recente primeiro. */
export function listDocumentTemplateVersions(organizationId: string, templateGroupId: string) {
  return prisma.documentTemplate.findMany({
    where: { organizationId, templateGroupId },
    orderBy: { version: "desc" },
  });
}

export function getDocumentTemplate(organizationId: string, id: string) {
  return prisma.documentTemplate.findFirst({
    where: { id, organizationId },
    include: { developments: { include: { development: true } } },
  });
}

export async function getLatestDocumentTemplateVersion(organizationId: string, templateGroupId: string) {
  return prisma.documentTemplate.findFirst({
    where: { organizationId, templateGroupId },
    orderBy: { version: "desc" },
  });
}

/**
 * Modelos ativos (última versão, status ACTIVE) de um tipo, aplicáveis a um
 * empreendimento — usados pra popular o seletor de "Gerar documento". Sem
 * nenhuma linha em `developments`, o modelo se aplica a todos.
 */
export async function listApplicableDocumentTemplates(
  organizationId: string,
  developmentId: string,
  type: DocumentTemplateType,
) {
  const all = await listDocumentTemplates(organizationId);
  return all.filter(
    (t) =>
      t.type === type &&
      t.status === "ACTIVE" &&
      (t.developments.length === 0 || t.developments.some((d) => d.developmentId === developmentId)),
  );
}

export type DocumentTemplateInput = {
  name: string;
  type: DocumentTemplateType;
  content: string;
  developmentIds: string[];
};

export async function createDocumentTemplate(context: AccessContext, input: DocumentTemplateInput) {
  return prisma.$transaction(async (tx) => {
    if (input.developmentIds.length > 0) {
      const count = await tx.development.count({
        where: { id: { in: input.developmentIds }, organizationId: context.organizationId },
      });
      if (count !== input.developmentIds.length) throw new Error("Empreendimento inválido.");
    }

    const templateGroupId = crypto.randomUUID();
    const template = await tx.documentTemplate.create({
      data: {
        organizationId: context.organizationId,
        templateGroupId,
        version: 1,
        name: input.name,
        type: input.type,
        content: input.content,
        createdByUserId: context.userId,
        developments: { create: input.developmentIds.map((developmentId) => ({ developmentId })) },
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "DocumentTemplate",
      entityId: template.id,
      afterData: template,
    });

    return template;
  });
}

/** Edita um modelo — sempre cria uma NOVA versão, nunca sobrescreve a anterior. */
export async function updateDocumentTemplate(
  context: AccessContext,
  templateGroupId: string,
  input: DocumentTemplateInput,
) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.documentTemplate.findFirst({
      where: { organizationId: context.organizationId, templateGroupId },
      orderBy: { version: "desc" },
    });
    if (!latest) throw new Error("Modelo inválido.");

    if (input.developmentIds.length > 0) {
      const count = await tx.development.count({
        where: { id: { in: input.developmentIds }, organizationId: context.organizationId },
      });
      if (count !== input.developmentIds.length) throw new Error("Empreendimento inválido.");
    }

    const newVersion = await tx.documentTemplate.create({
      data: {
        organizationId: context.organizationId,
        templateGroupId,
        version: latest.version + 1,
        name: input.name,
        type: latest.type,
        content: input.content,
        createdByUserId: context.userId,
        developments: { create: input.developmentIds.map((developmentId) => ({ developmentId })) },
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "new_version",
      entityType: "DocumentTemplate",
      entityId: newVersion.id,
      beforeData: latest,
      afterData: newVersion,
    });

    return newVersion;
  });
}

/** Ativa/inativa a versão mais recente de uma família — não cria versão nova (não é edição de conteúdo). */
export async function setDocumentTemplateStatus(
  context: AccessContext,
  templateGroupId: string,
  status: "ACTIVE" | "INACTIVE",
) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.documentTemplate.findFirst({
      where: { organizationId: context.organizationId, templateGroupId },
      orderBy: { version: "desc" },
    });
    if (!latest) throw new Error("Modelo inválido.");

    const updated = await tx.documentTemplate.update({
      where: { id: latest.id },
      data: { status },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update_status",
      entityType: "DocumentTemplate",
      entityId: updated.id,
      beforeData: latest,
      afterData: updated,
    });

    return updated;
  });
}

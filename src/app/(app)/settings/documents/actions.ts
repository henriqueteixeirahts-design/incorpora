"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  setDocumentTemplateStatus,
} from "@/server/document-templates";
import { seedDefaultDocumentTemplates } from "@/server/document-template-seed";
import type { DocumentTemplateType } from "@/generated/prisma/client";

export type FormState = { error?: string; ok?: boolean };

function parseInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "") as DocumentTemplateType;
  const content = String(formData.get("content") ?? "").trim();
  const developmentIds = formData.getAll("developmentIds").map(String).filter(Boolean);

  if (!name) throw new Error("Nome é obrigatório.");
  if (!content) throw new Error("Conteúdo é obrigatório.");

  return { name, type, content, developmentIds };
}

export async function createDocumentTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "CREATE")) {
    return { error: "Sem permissão." };
  }

  try {
    const input = parseInput(formData);
    await createDocumentTemplate(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar modelo." };
  }

  revalidatePath("/settings/documents");
  return { ok: true };
}

export async function updateDocumentTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const templateGroupId = String(formData.get("templateGroupId") ?? "");
  if (!templateGroupId) return { error: "Modelo inválido." };

  try {
    const input = parseInput(formData);
    await updateDocumentTemplate(context, templateGroupId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao salvar nova versão." };
  }

  revalidatePath("/settings/documents");
  return { ok: true };
}

/**
 * Biblioteca-padrão de modelos por organização (docs/RELATORIO_TESTDRIVE.md,
 * achado 21) — idempotente, só cria o que ainda não existe por tipo. Botão
 * manual em vez de disparo automático porque ainda não existe um fluxo de
 * criação de organização nesta versão (Pilar 4 do ESPEC_MULTITENANT_
 * FUNDACOES.md é fase futura) — este é o gatilho disponível hoje, tanto pro
 * seed retroativo da TSH quanto pra qualquer organização nova até lá.
 */
export async function seedDefaultDocumentTemplatesAction() {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "CREATE")) return;

  await seedDefaultDocumentTemplates(context);
  revalidatePath("/settings/documents");
}

export async function toggleDocumentTemplateStatusAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "EDIT")) return;

  const templateGroupId = String(formData.get("templateGroupId") ?? "");
  const status = String(formData.get("status") ?? "") as "ACTIVE" | "INACTIVE";
  if (!templateGroupId || (status !== "ACTIVE" && status !== "INACTIVE")) return;

  await setDocumentTemplateStatus(context, templateGroupId, status);
  revalidatePath("/settings/documents");
}

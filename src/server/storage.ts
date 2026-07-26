import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const CONTRACTS_BUCKET = "contracts";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, mesmo limite configurado no bucket

/**
 * Faz upload do PDF do contrato assinado para o Supabase Storage (bucket
 * privado). Retorna o caminho interno (não uma URL pública) — o acesso é
 * sempre via URL assinada de curto prazo, gerada sob demanda.
 */
export async function uploadContractDocument(file: File, contractId: string): Promise<string> {
  if (file.type !== "application/pdf") {
    throw new Error("O contrato assinado deve ser um arquivo PDF.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Arquivo maior que 10MB.");
  }

  const admin = createAdminClient();
  const path = `contract-${contractId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error } = await admin.storage.from(CONTRACTS_BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (error) {
    throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  }

  return path;
}

/** Gera uma URL assinada de curto prazo (1 hora) para baixar o contrato. */
export async function getSignedContractUrl(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error || !data) {
    throw new Error(`Falha ao gerar link do contrato: ${error?.message}`);
  }

  return data.signedUrl;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const DOCUMENTS_BUCKET = "documents";
const DOCUMENT_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB, mesmo limite configurado no bucket
const DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Faz upload de um anexo genérico (bucket privado "documents") para
 * qualquer entidade do sistema, identificada por (entityType, entityId) —
 * mesmo padrão polimórfico do model Document. Retorna o caminho interno.
 */
export async function uploadEntityDocument(
  file: File,
  entityType: string,
  entityId: string,
): Promise<string> {
  if (!DOCUMENT_ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de arquivo não permitido.");
  }
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error("Arquivo maior que 15MB.");
  }

  const admin = createAdminClient();
  const path = `${entityType.toLowerCase()}-${entityId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  }

  return path;
}

/** Gera uma URL assinada de curto prazo (1 hora) para baixar um anexo. */
export async function getSignedDocumentUrl(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error || !data) {
    throw new Error(`Falha ao gerar link do anexo: ${error?.message}`);
  }

  return data.signedUrl;
}

/** Remove o arquivo do bucket de anexos. Não falha se o arquivo já não existir. */
export async function deleteEntityDocumentFile(path: string): Promise<void> {
  const admin = createAdminClient();
  await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
}

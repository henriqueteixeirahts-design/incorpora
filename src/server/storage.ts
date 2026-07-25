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

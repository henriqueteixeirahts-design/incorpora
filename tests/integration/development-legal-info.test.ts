import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment, updateDevelopmentDetails } from "@/server/developments";

/**
 * docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 1 — registro/
 * documentação legal + anexos categorizados do empreendimento.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Registro Empreendimento" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Registro Empreendimento (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "registro-empreendimento@teste.local", fullName: "Usuário Registro" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Registro Empreendimento", document: "63265390001395", status: "ACTIVE",
    email: "spe-registro-empreendimento@teste.local", phone: "62999990760",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Registro", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("updateDevelopmentDetails", () => {
  it("grava número/cartório/data do registro e demais datas-chave", async () => {
    const updated = await updateDevelopmentDetails(context, developmentId, {
      registrationNumber: "R.12345",
      notaryOffice: "1º Ofício de Registro de Imóveis de Goiânia",
      registrationDate: new Date(2024, 0, 10),
      hasPropertyAffectation: true,
      launchDate: new Date(2023, 5, 1),
      expectedDeliveryDate: new Date(2027, 11, 1),
    });
    expect(updated.registrationNumber).toBe("R.12345");
    expect(updated.hasPropertyAffectation).toBe(true);
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(updateDevelopmentDetails(otherContext, developmentId, { registrationNumber: "X" })).rejects.toThrow(
      "Empreendimento não encontrado.",
    );
  });
});

// Nota: upload/listagem/remoção de documento do empreendimento
// (uploadDevelopmentDocument/listDevelopmentDocuments/deleteDevelopmentDocument,
// src/server/developments.ts) passam pelo Supabase Storage real
// (uploadEntityDocument/getSignedDocumentUrl, src/server/storage.ts) — sem
// mock de storage no ambiente de teste, sem precedente de teste de
// integração em nenhuma outra fase desta sessão (uploadSpeDocument,
// uploadExchangeContractDocument etc. também não têm). O código espelha
// exatamente o padrão já em produção de uploadSpeDocument.

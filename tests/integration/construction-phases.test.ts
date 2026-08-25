import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import {
  createConstructionPhase,
  deactivateConstructionPhase,
  createConstructionMeasurement,
  listConstructionMeasurements,
  getLatestConstructionMeasurement,
} from "@/server/construction";

/**
 * docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 2 — fases de obra +
 * evolução física. overallPercentComplete é a média ponderada pelo peso das
 * fases ATIVAS no momento da medição (Σ peso×% / Σ peso), congelada na hora.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Fases de Obra" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Fases de Obra (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "fases-obra@teste.local", fullName: "Usuário Fases de Obra" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Fases de Obra", document: "63265390001314", status: "ACTIVE",
    email: "spe-fases-obra@teste.local", phone: "62999990750",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Fases de Obra", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.constructionPhaseMeasurementValue.deleteMany({ where: { phase: { development: { organizationId: { in: orgIds } } } } });
  await prisma.constructionMeasurement.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.constructionPhase.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("createConstructionMeasurement — % geral ponderado pelo peso das fases", () => {
  it("soma dos pesos = 100: % geral é a média ponderada direta", async () => {
    const fundacao = await createConstructionPhase(context, developmentId, { name: "Fundação", sequence: 1, weightPct: 20 });
    const estrutura = await createConstructionPhase(context, developmentId, { name: "Estrutura", sequence: 2, weightPct: 30 });
    const acabamento = await createConstructionPhase(context, developmentId, { name: "Acabamento", sequence: 3, weightPct: 50 });

    // 20*100 + 30*50 + 50*10 = 2000+1500+500 = 4000 / 100 = 40
    const measurement = await createConstructionMeasurement(context, developmentId, {
      measurementDate: new Date(2026, 0, 15),
      phaseValues: [
        { phaseId: fundacao.id, percentComplete: 100 },
        { phaseId: estrutura.id, percentComplete: 50 },
        { phaseId: acabamento.id, percentComplete: 10 },
      ],
    });
    expect(Number(measurement.overallPercentComplete)).toBe(40);

    const latest = await getLatestConstructionMeasurement(context, developmentId);
    expect(latest!.id).toBe(measurement.id);
  });

  it("fase desativada não entra na ponderação de medições seguintes, mas o histórico anterior permanece intacto", async () => {
    const phases = await prisma.constructionPhase.findMany({ where: { developmentId }, orderBy: { sequence: "asc" } });
    const [fundacao, estrutura, acabamento] = phases;

    await deactivateConstructionPhase(context, developmentId, acabamento.id);

    // agora só fundação (20) e estrutura (30) ativas — soma pesos = 50
    // 20*100 + 30*80 = 2000+2400 = 4400 / 50 = 88
    const measurement = await createConstructionMeasurement(context, developmentId, {
      measurementDate: new Date(2026, 1, 15),
      phaseValues: [
        { phaseId: fundacao.id, percentComplete: 100 },
        { phaseId: estrutura.id, percentComplete: 80 },
      ],
    });
    expect(Number(measurement.overallPercentComplete)).toBe(88);

    const all = await listConstructionMeasurements(context, developmentId);
    expect(all).toHaveLength(2);
    // a medição anterior (com acabamento ainda ativo) continua com o valor congelado de 40
    const first = all.find((m) => Number(m.overallPercentComplete) === 40);
    expect(first).toBeDefined();
  });

  it("% concluído fora de 0-100 é rejeitado", async () => {
    const phase = await prisma.constructionPhase.findFirstOrThrow({ where: { developmentId, isActive: true } });
    await expect(
      createConstructionMeasurement(context, developmentId, {
        measurementDate: new Date(),
        phaseValues: [{ phaseId: phase.id, percentComplete: 150 }],
      }),
    ).rejects.toThrow(/entre 0 e 100/);
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(
      createConstructionPhase(otherContext, developmentId, { name: "Outra", sequence: 1, weightPct: 100 }),
    ).rejects.toThrow("Empreendimento não encontrado.");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createAgency, createBroker } from "@/server/crm";
import {
  getEffectiveCommissionRule,
  upsertCommissionRule,
  listCommissionRuleOverrides,
} from "@/server/commission-rules";
import { upsertSplitTiers, listSplitTiers } from "@/server/agency-split-tiers";

let org: { id: string };
let context: AccessContext;
let dev: { id: string };

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Regras de Comissão" } });
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "actor-commission-rules@teste.local", fullName: "Ator Regras" },
  });
  context = { userId: actor.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Regras de Comissão", document: "63265390000141", status: "ACTIVE",
    email: "spe-commission-rules@teste.local", phone: "62999990400",
  });
  dev = await createDevelopment(context, { speId: spe.id, name: "Development Regras Comissão", type: "RESIDENTIAL_BUILDING" });
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.agencySplitTier.deleteMany({ where: { agency: { organizationId: org.id } } });
  await prisma.broker.deleteMany({ where: { organizationId: org.id } });
  await prisma.realEstateAgency.deleteMany({ where: { organizationId: org.id } });
  await prisma.commissionRule.deleteMany({ where: { organizationId: org.id } });
  await prisma.development.deleteMany({ where: { organizationId: org.id } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { email: "actor-commission-rules@teste.local" } });
});

describe("CommissionRule — cascata empreendimento → geral → default", () => {
  it("sem regra nenhuma, resolve pro default (percentuais nulos)", async () => {
    const effective = await getEffectiveCommissionRule(org.id, dev.id);
    expect(effective.externalCommissionPercent).toBeNull();
    expect(effective.internalCommissionPercent).toBeNull();
  });

  it("regra geral vale quando não há regra específica do empreendimento", async () => {
    await upsertCommissionRule(context, null, {
      externalCommissionPercent: 6,
      internalCommissionPercent: 2,
      internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
    });

    const effective = await getEffectiveCommissionRule(org.id, dev.id);
    expect(effective.externalCommissionPercent).toBe(6);
    expect(effective.internalCommissionPercent).toBe(2);
  });

  it("regra do empreendimento sobrescreve a geral", async () => {
    await upsertCommissionRule(context, dev.id, {
      externalCommissionPercent: 8,
      internalCommissionPercent: 3,
      internalCommissionAppliesTo: "PARTICIPATED_ONLY", internalManagerBrokerId: null,
    });

    const effective = await getEffectiveCommissionRule(org.id, dev.id);
    expect(effective.externalCommissionPercent).toBe(8);
    expect(effective.internalCommissionAppliesTo).toBe("PARTICIPATED_ONLY");

    const overrides = await listCommissionRuleOverrides(context);
    expect(overrides.map((o) => o.developmentId)).toContain(dev.id);
  });

  it("rejeita percentual fora de 0-100", async () => {
    await expect(
      upsertCommissionRule(context, null, { externalCommissionPercent: 150, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null }),
    ).rejects.toThrow("inválido");
  });

  it("rejeita empreendimento de outra organização", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Org — Regras de Comissão (outra)" } });
    await expect(
      upsertCommissionRule({ ...context, organizationId: otherOrg.id }, dev.id, {
        externalCommissionPercent: 5,
        internalCommissionPercent: null,
        internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
      }),
    ).rejects.toThrow("Empreendimento inválido.");
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});

describe("AgencySplitTier — soma tem que dar exatamente 100%", () => {
  it("rejeita soma diferente de 100", async () => {
    const agency = await createAgency(context, { name: "Imobiliária Split Inválido" });
    await expect(
      upsertSplitTiers(context, agency.id, [
        { label: "Corretor", percent: 20, kind: "DYNAMIC_BROKER_OF_SALE" },
        { label: "Imobiliária", percent: 70, kind: "FIXED_AGENCY" },
      ]),
    ).rejects.toThrow("soma das fatias precisa ser exatamente 100%");
  });

  it("aceita soma 100% e substitui o conjunto anterior por completo", async () => {
    const agency = await createAgency(context, { name: "Imobiliária Split Válido" });

    await upsertSplitTiers(context, agency.id, [
      { label: "Corretor", percent: 40, kind: "DYNAMIC_BROKER_OF_SALE" },
      { label: "Imobiliária", percent: 60, kind: "FIXED_AGENCY" },
    ]);
    const firstSet = await listSplitTiers(agency.id);
    expect(firstSet).toHaveLength(2);

    await upsertSplitTiers(context, agency.id, [
      { label: "Corretor", percent: 100, kind: "DYNAMIC_BROKER_OF_SALE" },
    ]);
    const secondSet = await listSplitTiers(agency.id);
    expect(secondSet).toHaveLength(1);
    expect(Number(secondSet[0].percent)).toBe(100);
  });

  it("rejeita fatia FIXED_BROKER sem corretor selecionado", async () => {
    const agency = await createAgency(context, { name: "Imobiliária Split Sem Fixo" });
    await expect(
      upsertSplitTiers(context, agency.id, [
        { label: "Gerente de produto", percent: 100, kind: "FIXED_BROKER" },
      ]),
    ).rejects.toThrow("não tem um corretor/gerente selecionado");
  });

  it("rejeita corretor fixo de outra organização", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Org — Split Broker (outra)" } });
    const otherActor = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "actor-other-split@teste.local", fullName: "Ator Outro" },
    });
    const otherContext: AccessContext = { userId: otherActor.id, organizationId: otherOrg.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
    const otherBroker = await createBroker(otherContext, { name: "Corretor De Outra Org", role: "MANAGER" });

    const agency = await createAgency(context, { name: "Imobiliária Split Cross-Org" });
    await expect(
      upsertSplitTiers(context, agency.id, [
        { label: "Gerente de produto", percent: 100, kind: "FIXED_BROKER", fixedBrokerId: otherBroker.id },
      ]),
    ).rejects.toThrow("Corretor/gerente inválido");

    await prisma.broker.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.user.deleteMany({ where: { id: otherActor.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});

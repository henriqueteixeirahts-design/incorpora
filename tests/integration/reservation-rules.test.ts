import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import {
  upsertReservationRule,
  getEffectiveReservationRule,
  getGeneralReservationRule,
  listReservationRuleOverrides,
  DEFAULT_RESERVATION_RULE,
} from "@/server/reservation-rules";
import {
  createReservation,
  cancelReservation,
  cancelWaitlistEntry,
  renewReservation,
  expireReservationsForOrganization,
} from "@/server/reservations";
import { runJobForSingleOrganization, expireReservationsJob } from "@/server/jobs";

/**
 * docs/ESPEC_MODULO_COMERCIAL.md, Parte 2 (Módulo Comercial etapa 3): regras
 * de reserva parametrizáveis por empreendimento + fila de espera, com
 * expiração implementada como job (padrão da Confiabilidade), não varredura
 * solta. Isolamento entre organizações no padrão de
 * tests/integration/org-scope*.test.ts.
 */

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

let developmentId: string;

beforeAll(async () => {
  orgA = await prisma.organization.create({ data: { name: "Org A — Regras de Reserva" } });
  orgB = await prisma.organization.create({ data: { name: "Org B — Regras de Reserva" } });

  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-a-reservas@teste.local", fullName: "Usuário Org A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-b-reservas@teste.local", fullName: "Usuário Org B" },
  });

  contextA = { userId: userA.id, organizationId: orgA.id, roleNames: ["Corretor"], permissions: new Set() };
  contextB = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(contextA, {
    name: "SPE Regras de Reserva",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-reservas@teste.local",
    phone: "62999990030",
  });
  const development = await createDevelopment(contextA, {
    speId: spe.id,
    name: "Empreendimento Regras de Reserva",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [orgA.id, orgB.id];
  await prisma.reservationWaitlistEntry.deleteMany({ where: { unit: { development: { organizationId: { in: orgIds } } } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.reservationRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.jobRun.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Regra de reserva — defaults e configuração", () => {
  it("usa os defaults sugeridos quando o empreendimento não tem regra configurada", async () => {
    const rule = await getEffectiveReservationRule(orgA.id, developmentId);
    expect(rule.validityHours).toBe(48);
    expect(rule.maxActiveReservationsPerBroker).toBe(3);
    expect(rule.waitlistEnabled).toBe(true);
  });

  it("upsertReservationRule cria e depois atualiza a mesma linha (1:1 por empreendimento)", async () => {
    const created = await upsertReservationRule(contextA, developmentId, {
      validityHours: 24,
      maxActiveReservationsPerBroker: 2,
      waitlistEnabled: true,
      waitlistPriorityHours: 12,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: true,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });
    expect(created.validityHours).toBe(24);

    const updated = await upsertReservationRule(contextA, developmentId, {
      ...created,
      validityHours: 12,
      allowedReserverRoles: created.allowedReserverRoles,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.validityHours).toBe(12);

    const rowCount = await prisma.reservationRule.count({ where: { developmentId } });
    expect(rowCount).toBe(1);
  });
});

describe("Regra geral × por empreendimento (Parte 1.3)", () => {
  it("sem regra geral nem específica, cai no default do código", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Reserva Geral 1" } });
    const spe2 = await createSpe({ ...contextA, organizationId: org2.id }, {
      name: "SPE Reserva Geral 1", document: "63265390000141", status: "ACTIVE",
      email: "spe-reserva-geral-1@teste.local", phone: "62999990300",
    });
    const dev2 = await createDevelopment({ ...contextA, organizationId: org2.id }, {
      speId: spe2.id, name: "Dev Reserva Geral 1", type: "RESIDENTIAL_BUILDING",
    });

    const rule = await getEffectiveReservationRule(org2.id, dev2.id);
    expect(rule).toEqual(DEFAULT_RESERVATION_RULE);

    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });

  it("regra geral configurada vale pra empreendimento sem regra própria", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Reserva Geral 2" } });
    const ctx2 = { ...contextA, organizationId: org2.id };
    const spe2 = await createSpe(ctx2, {
      name: "SPE Reserva Geral 2", document: "63265390000141", status: "ACTIVE",
      email: "spe-reserva-geral-2@teste.local", phone: "62999990301",
    });
    const dev2 = await createDevelopment(ctx2, { speId: spe2.id, name: "Dev Reserva Geral 2", type: "RESIDENTIAL_BUILDING" });

    await upsertReservationRule(ctx2, null, {
      ...DEFAULT_RESERVATION_RULE,
      validityHours: 72,
      maxActiveReservationsPerBroker: 5,
    });

    const general = await getGeneralReservationRule(ctx2);
    expect(general?.developmentId).toBeNull();
    expect(general?.validityHours).toBe(72);

    const effective = await getEffectiveReservationRule(org2.id, dev2.id);
    expect(effective.validityHours).toBe(72);
    expect(effective.maxActiveReservationsPerBroker).toBe(5);

    await prisma.reservationRule.deleteMany({ where: { organizationId: org2.id } });
    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });

  it("regra do empreendimento sobrescreve a geral, e aparece na lista de sobrescrições", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Reserva Geral 3" } });
    const ctx2 = { ...contextA, organizationId: org2.id };
    const spe2 = await createSpe(ctx2, {
      name: "SPE Reserva Geral 3", document: "63265390000141", status: "ACTIVE",
      email: "spe-reserva-geral-3@teste.local", phone: "62999990302",
    });
    const dev2 = await createDevelopment(ctx2, { speId: spe2.id, name: "Dev Reserva Geral 3", type: "RESIDENTIAL_BUILDING" });

    await upsertReservationRule(ctx2, null, { ...DEFAULT_RESERVATION_RULE, validityHours: 72 });
    await upsertReservationRule(ctx2, dev2.id, { ...DEFAULT_RESERVATION_RULE, validityHours: 24 });

    const effective = await getEffectiveReservationRule(org2.id, dev2.id);
    expect(effective.validityHours).toBe(24);

    const overrides = await listReservationRuleOverrides(ctx2);
    expect(overrides).toHaveLength(1);
    expect(overrides[0].developmentId).toBe(dev2.id);

    // A geral continua intacta, não foi sobrescrita pela regra do empreendimento.
    const general = await getGeneralReservationRule(ctx2);
    expect(general?.validityHours).toBe(72);

    await prisma.reservationRule.deleteMany({ where: { organizationId: org2.id } });
    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });
});

describe("Máximo de reservas ativas por corretor", () => {
  it("bloqueia nova reserva do mesmo corretor acima do limite configurado", async () => {
    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: 1,
      waitlistEnabled: false,
      waitlistPriorityHours: 24,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });

    const broker = await createBroker(contextA, { name: "Corretor Teste Limite" });
    const unit1 = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L1-101" });
    const unit2 = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L1-102" });
    const customer1 = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Cliente Limite 1",
      document: "02654427102",
    });
    const customer2 = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Cliente Limite 2",
      document: "11144477735",
    });

    await createReservation(contextA, {
      unitId: unit1.id,
      customerId: customer1.id,
      brokerId: broker.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    await expect(
      createReservation(contextA, {
        unitId: unit2.id,
        customerId: customer2.id,
        brokerId: broker.id,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }),
    ).rejects.toThrow("máximo de 1 reservas ativas");
  });
});

describe("Fila de espera", () => {
  it("nova reserva numa unidade já reservada entra na fila em vez de falhar, e é promovida quando a reserva ativa cai", async () => {
    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: null,
      waitlistEnabled: true,
      waitlistPriorityHours: 6,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });

    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L2-101" });
    const firstCustomer = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Primeiro da Fila",
      document: "96173820340",
    });
    const secondCustomer = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Segundo da Fila",
      document: "50864238006",
    });

    const first = await createReservation(contextA, {
      unitId: unit.id,
      customerId: firstCustomer.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    expect(first.kind).toBe("reservation");

    const second = await createReservation(contextA, {
      unitId: unit.id,
      customerId: secondCustomer.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    expect(second.kind).toBe("waitlisted");

    if (first.kind !== "reservation") throw new Error("esperava reserva");
    await cancelReservation(contextA, first.reservation.id, "teste — liberar pra fila");

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("RESERVED");

    const promoted = await prisma.reservation.findFirst({
      where: { unitId: unit.id, customerId: secondCustomer.id, status: "ACTIVE" },
    });
    expect(promoted).not.toBeNull();
    expect(promoted?.fromWaitlist).toBe(true);

    if (second.kind !== "waitlisted") throw new Error("esperava entrada na fila");
    const entryAfter = await prisma.reservationWaitlistEntry.findUniqueOrThrow({ where: { id: second.entry.id } });
    expect(entryAfter.status).toBe("CONVERTED");
  });

  it("cancelWaitlistEntry tira o cliente da fila sem promover ninguém", async () => {
    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L2-201" });
    const holder = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Segurando a Unidade",
      document: "72495130847",
    });
    const waiter = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Desiste da Fila",
      document: "36547891004",
    });

    await createReservation(contextA, {
      unitId: unit.id,
      customerId: holder.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    const waitlisted = await createReservation(contextA, {
      unitId: unit.id,
      customerId: waiter.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    if (waitlisted.kind !== "waitlisted") throw new Error("esperava fila");

    await cancelWaitlistEntry(contextA, waitlisted.entry.id);
    const entry = await prisma.reservationWaitlistEntry.findUniqueOrThrow({ where: { id: waitlisted.entry.id } });
    expect(entry.status).toBe("CANCELLED");
  });
});

describe("Renovação de reserva", () => {
  it("respeita o teto de renovações da regra", async () => {
    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: null,
      waitlistEnabled: false,
      waitlistPriorityHours: 24,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });

    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L3-101" });
    const customer = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Cliente Renovação",
      document: "83027461950",
    });
    const result = await createReservation(contextA, {
      unitId: unit.id,
      customerId: customer.id,
      expiresAt: new Date(Date.now() + 1000),
    });
    if (result.kind !== "reservation") throw new Error("esperava reserva");

    const renewed = await renewReservation(contextA, result.reservation.id);
    expect(renewed.renewalCount).toBe(1);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await expect(renewReservation(contextA, result.reservation.id)).rejects.toThrow("Limite de 1 renovação");
  });
});

describe("Expiração via job (padrão JOB_REGISTRY)", () => {
  it("expireReservationsForOrganization libera a unidade e promove a fila, registrado como JobRun", async () => {
    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L4-101" });
    const holder = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Reserva Vai Expirar",
      document: "64738291005",
    });
    const waiter = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Aguardando Expiração",
      document: "29384756012",
    });

    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: null,
      waitlistEnabled: true,
      waitlistPriorityHours: 6,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });

    await createReservation(contextA, {
      unitId: unit.id,
      customerId: holder.id,
      expiresAt: new Date(Date.now() - 1000), // já vencida
    });
    const waitlisted = await createReservation(contextA, {
      unitId: unit.id,
      customerId: waiter.id,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    expect(waitlisted.kind).toBe("waitlisted");

    const result = await runJobForSingleOrganization(expireReservationsJob, orgA.id, "MANUAL");
    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({ expired: expect.any(Number), promotedFromWaitlist: expect.any(Number) });

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: "expire-reservations", organizationId: orgA.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("SUCCESS");

    const promoted = await prisma.reservation.findFirst({
      where: { unitId: unit.id, customerId: waiter.id, status: "ACTIVE" },
    });
    expect(promoted?.fromWaitlist).toBe(true);
  });

  it("idempotente: rodar de novo sem reserva vencida não muda nada", async () => {
    const before = await expireReservationsForOrganization(orgA.id);
    expect(before.expired).toBe(0);
  });
});

describe("Papéis permitidos a reservar", () => {
  it("bloqueia reserva de quem não tem o papel exigido pela regra do empreendimento", async () => {
    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: null,
      waitlistEnabled: false,
      waitlistPriorityHours: 24,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: ["Gerente comercial"],
    });

    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L5-101" });
    const customer = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Cliente Papel Restrito",
      document: "05192837465",
    });

    await expect(
      createReservation(contextA, {
        unitId: unit.id,
        customerId: customer.id,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }),
    ).rejects.toThrow("papel não tem permissão");

    // limpa a regra pra não afetar os testes seguintes desta suíte
    await upsertReservationRule(contextA, developmentId, {
      validityHours: 48,
      maxActiveReservationsPerBroker: null,
      waitlistEnabled: false,
      waitlistPriorityHours: 24,
      renewalAllowed: true,
      maxRenewals: 1,
      requiresApprovalForRenewal: false,
      requireIdentifiedCustomer: true,
      allowedReserverRoles: [],
    });
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não configura regra nem reserva unidade do empreendimento da Org A", async () => {
    await expect(
      upsertReservationRule(contextB, developmentId, {
        validityHours: 10,
        maxActiveReservationsPerBroker: null,
        waitlistEnabled: false,
        waitlistPriorityHours: 24,
        renewalAllowed: true,
        maxRenewals: 1,
        requiresApprovalForRenewal: false,
        requireIdentifiedCustomer: true,
        allowedReserverRoles: [],
      }),
    ).rejects.toThrow();

    const unit = await createUnit(contextA, { developmentId, unitType: "APARTMENT", number: "L6-101" });
    await expect(
      createReservation(contextB, {
        unitId: unit.id,
        customerId: "00000000-0000-0000-0000-000000000000",
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      }),
    ).rejects.toThrow("Unidade inválida");
  });
});

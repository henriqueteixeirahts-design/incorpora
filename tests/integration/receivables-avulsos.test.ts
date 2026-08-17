import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createDevelopment } from "@/server/developments";
import { createSpe } from "@/server/spes";
import { createCustomer } from "@/server/customers";
import {
  createReceivable,
  updateReceivable,
  getReceivableDetail,
  registerReceivableReceipt,
  cancelReceivable,
  listReceivablesPaged,
  type CreateReceivableInput,
} from "@/server/receivables-avulsos";
import { getCashFlow } from "@/server/cash-flow";

/**
 * Fase B, etapa 6 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 4.3) —
 * recebíveis avulsos: entrada que não nasce de venda (taxa de cessão,
 * aluguel de espaço, reembolso, rendimento). Separado da carteira de
 * vendas — sem motor de correção — e somado ao fluxo de caixa sem duplicar
 * a carteira existente (Installment).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let speId: string;
let customerId: string;

function baseInput(overrides: Partial<CreateReceivableInput> = {}): CreateReceivableInput {
  return {
    category: "SPACE_RENTAL",
    origin: "Aluguel do espaço comum — julho/2026",
    dueDate: new Date("2026-08-15"),
    amount: 1500,
    ...overrides,
  };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Receivables Avulsos" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "avulsos@teste.local", fullName: "Usuário Avulsos" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Avulsos",
    document: "63265390000582",
    status: "ACTIVE",
    email: "spe-avulsos@teste.local",
    phone: "62999990600",
  });
  speId = spe.id;
  const development = await createDevelopment(context, { speId, name: "Empreendimento Avulsos", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Pagador Avulso", document: "77788899902" });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("CRUD básico", () => {
  it("cria um recebível avulso com todos os campos da spec (origem, pagador, categoria, empreendimento/SPE, vencimento, valor)", async () => {
    const receivable = await createReceivable(
      context,
      baseInput({ developmentId, speId, customerId, category: "ASSIGNMENT_FEE", amount: 3500 }),
    );
    const detail = await getReceivableDetail(org.id, receivable.id);
    expect(detail).toMatchObject({
      category: "ASSIGNMENT_FEE",
      status: "PENDING",
      developmentId,
      speId,
      customerId,
    });
    expect(Number(detail!.amount)).toBe(3500);
  });

  it("permite lançar sem empreendimento/SPE/cliente (todos opcionais, conforme spec)", async () => {
    const receivable = await createReceivable(context, baseInput({ category: "YIELD", origin: "Rendimento aplicação" }));
    const detail = await getReceivableDetail(org.id, receivable.id);
    expect(detail!.developmentId).toBeNull();
    expect(detail!.speId).toBeNull();
    expect(detail!.customerId).toBeNull();
  });

  it("edita só enquanto pendente", async () => {
    const receivable = await createReceivable(context, baseInput({ amount: 1000 }));
    await updateReceivable(context, receivable.id, baseInput({ amount: 1200 }));
    const detail = await getReceivableDetail(org.id, receivable.id);
    expect(Number(detail!.amount)).toBe(1200);

    await registerReceivableReceipt(context, receivable.id);
    await expect(updateReceivable(context, receivable.id, baseInput({ amount: 999 }))).rejects.toThrow(/pendentes/i);
  });
});

describe("Registrar recebimento e cancelar", () => {
  it("registra o recebimento com data e valor informados", async () => {
    const receivable = await createReceivable(context, baseInput({ amount: 2000 }));
    const receivedAt = new Date("2026-08-20");
    await registerReceivableReceipt(context, receivable.id, { receivedAt, receivedAmount: 2000 });

    const detail = await getReceivableDetail(org.id, receivable.id);
    expect(detail!.status).toBe("RECEIVED");
    expect(Number(detail!.receivedAmount)).toBe(2000);
    expect(detail!.receivedAt!.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  it("não permite registrar recebimento duas vezes", async () => {
    const receivable = await createReceivable(context, baseInput());
    await registerReceivableReceipt(context, receivable.id);
    await expect(registerReceivableReceipt(context, receivable.id)).rejects.toThrow(/já foi baixado/i);
  });

  it("cancela um recebível pendente, mas não um já recebido", async () => {
    const pending = await createReceivable(context, baseInput());
    await cancelReceivable(context, pending.id);
    const detailPending = await getReceivableDetail(org.id, pending.id);
    expect(detailPending!.status).toBe("CANCELLED");

    const received = await createReceivable(context, baseInput());
    await registerReceivableReceipt(context, received.id);
    await expect(cancelReceivable(context, received.id)).rejects.toThrow(/já baixado/i);
  });
});

describe("Filtros da lista", () => {
  it("filtra por empreendimento, categoria e status", async () => {
    const otherDev = await createDevelopment(context, { speId, name: "Outro Empreendimento Avulsos", type: "RESIDENTIAL_BUILDING" });

    await createReceivable(context, baseInput({ developmentId, category: "REFUND", origin: "Reembolso A" }));
    await createReceivable(context, baseInput({ developmentId: otherDev.id, category: "OTHER", origin: "Diverso B" }));

    const byDevelopment = await listReceivablesPaged(org.id, { developmentId });
    expect(byDevelopment.items.every((r) => r.developmentId === developmentId)).toBe(true);
    expect(byDevelopment.items.some((r) => r.origin === "Reembolso A")).toBe(true);
    expect(byDevelopment.items.some((r) => r.origin === "Diverso B")).toBe(false);

    const byCategory = await listReceivablesPaged(org.id, { category: "REFUND" });
    expect(byCategory.items.every((r) => r.category === "REFUND")).toBe(true);
  });
});

describe("Fluxo de caixa soma recebíveis avulsos sem duplicar a carteira", () => {
  it("entra em receivablesForecast no mês de vencimento, e em receivablesRealized no mês do recebimento", async () => {
    const dueDate = new Date();
    const before = await getCashFlow(org.id, { developmentId, monthsBack: 0, monthsForward: 0 });

    const receivable = await createReceivable(context, baseInput({ developmentId, dueDate, amount: 4000, origin: "Fluxo de caixa avulso" }));

    const afterCreate = await getCashFlow(org.id, { developmentId, monthsBack: 0, monthsForward: 0 });
    expect(afterCreate[0].receivablesForecast - before[0].receivablesForecast).toBe(4000);
    expect(afterCreate[0].receivablesRealized - before[0].receivablesRealized).toBe(0);

    await registerReceivableReceipt(context, receivable.id, { receivedAt: new Date(), receivedAmount: 4000 });
    const afterReceipt = await getCashFlow(org.id, { developmentId, monthsBack: 0, monthsForward: 0 });
    expect(afterReceipt[0].receivablesRealized - before[0].receivablesRealized).toBe(4000);
  });

  it("recebível cancelado não entra no fluxo de caixa previsto", async () => {
    const dueDate = new Date();
    const before = await getCashFlow(org.id, { developmentId, monthsBack: 0, monthsForward: 0 });

    const receivable = await createReceivable(context, baseInput({ developmentId, dueDate, amount: 777, origin: "Cancelado no fluxo" }));
    await cancelReceivable(context, receivable.id);

    const after = await getCashFlow(org.id, { developmentId, monthsBack: 0, monthsForward: 0 });
    expect(after[0].receivablesForecast - before[0].receivablesForecast).toBe(0);
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê recebíveis da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Avulsos" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-avulsos@teste.local", fullName: "Usuário Org B" },
    });

    const receivable = await createReceivable(context, baseInput({ origin: "Só da Org A" }));
    const detailFromB = await getReceivableDetail(orgB.id, receivable.id);
    expect(detailFromB).toBeNull();

    await prisma.organization.delete({ where: { id: orgB.id } });
    await prisma.user.deleteMany({ where: { id: userB.id } });
  });
});

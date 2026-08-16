import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createDevelopment } from "@/server/developments";
import { createSpe } from "@/server/spes";
import { createSupplier } from "@/server/finance-setup";
import {
  createPayable,
  getPayableDetail,
  listPayablesPaged,
  advancePayableStatus,
  countPendingApproval,
  type CreatePayableInput,
} from "@/server/payables";

/**
 * Fase B, etapa 4 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 4.1) —
 * contas a pagar no padrão novo de UI: itens (detalhamento do valor total,
 * validado centavo a centavo), filtros da lista, e histórico de aprovação
 * (quem avançou cada etapa, reaproveitando o AuditEvent já gravado).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let speId: string;
let supplierId: string;

function baseInput(overrides: Partial<CreatePayableInput> = {}): CreatePayableInput {
  return {
    category: "CONSTRUCTION",
    description: "Medição de obra",
    competenceDate: new Date("2026-08-01"),
    dueDate: new Date("2026-08-15"),
    amount: 10000,
    ...overrides,
  };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Payables" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "payables@teste.local", fullName: "Usuário Financeiro" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Payables",
    document: "63265390000257",
    status: "ACTIVE",
    email: "spe-payables@teste.local",
    phone: "62999990200",
  });
  speId = spe.id;
  const development = await createDevelopment(context, { speId, name: "Empreendimento Payables", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  const supplier = await createSupplier(context, { name: "Construtora XPTO" });
  supplierId = supplier.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("Itens da conta a pagar — soma centavo a centavo", () => {
  it("cria com itens cuja soma bate exato com o valor total", async () => {
    const payable = await createPayable(
      context,
      baseInput({
        amount: 1500.5,
        items: [
          { description: "Material", amount: 1000.3 },
          { description: "Mão de obra", amount: 500.2 },
        ],
      }),
    );

    const detail = await getPayableDetail(org.id, payable.id);
    expect(detail!.items).toHaveLength(2);
    const sum = detail!.items.reduce((acc, item) => acc + Number(item.amount), 0);
    expect(sum).toBeCloseTo(1500.5, 2);
  });

  it("rejeita quando a soma dos itens não bate com o valor total", async () => {
    await expect(
      createPayable(
        context,
        baseInput({
          amount: 1000,
          items: [
            { description: "Item 1", amount: 400 },
            { description: "Item 2", amount: 500 },
          ],
        }),
      ),
    ).rejects.toThrow(/soma dos itens/i);
  });

  it("permite lançar sem itens (detalhamento é opcional)", async () => {
    const payable = await createPayable(context, baseInput({ amount: 5000 }));
    const detail = await getPayableDetail(org.id, payable.id);
    expect(detail!.items).toHaveLength(0);
  });
});

describe("Filtros da lista", () => {
  it("filtra por empreendimento, status e faixa de valor", async () => {
    const otherDevelopment = await createDevelopment(context, { speId, name: "Outro Empreendimento", type: "RESIDENTIAL_BUILDING" });

    await createPayable(context, baseInput({ developmentId, amount: 2000, description: "Conta A" }));
    await createPayable(context, baseInput({ developmentId: otherDevelopment.id, amount: 8000, description: "Conta B" }));
    await createPayable(context, baseInput({ developmentId, supplierId, amount: 50000, description: "Conta C — cara" }));

    const byDevelopment = await listPayablesPaged(org.id, { developmentId });
    expect(byDevelopment.items.every((p) => p.developmentId === developmentId)).toBe(true);
    expect(byDevelopment.items.some((p) => p.description === "Conta A")).toBe(true);
    expect(byDevelopment.items.some((p) => p.description === "Conta B")).toBe(false);

    const bySupplier = await listPayablesPaged(org.id, { supplierId });
    expect(bySupplier.items.every((p) => p.supplierId === supplierId)).toBe(true);

    const byRange = await listPayablesPaged(org.id, { minAmount: 10000, maxAmount: 60000 });
    expect(byRange.items.some((p) => p.description === "Conta C — cara")).toBe(true);
    expect(byRange.items.some((p) => p.description === "Conta A")).toBe(false);
  });
});

describe("Histórico de aprovação (quem avançou cada etapa)", () => {
  it("registra o ator de cada avanço de status e conta pendências", async () => {
    const payable = await createPayable(context, baseInput({ description: "Conta a aprovar" }));

    const before = await countPendingApproval(org.id);

    await advancePayableStatus(context, payable.id); // ENTERED -> REVIEWED
    await advancePayableStatus(context, payable.id); // REVIEWED -> APPROVED

    const detail = await getPayableDetail(org.id, payable.id);
    expect(detail!.status).toBe("APPROVED");
    expect(detail!.approvalHistory).toHaveLength(2);
    expect(detail!.approvalHistory[0]).toMatchObject({
      fromStatus: "ENTERED",
      toStatus: "REVIEWED",
      actorName: "Usuário Financeiro",
    });
    expect(detail!.approvalHistory[1]).toMatchObject({
      fromStatus: "REVIEWED",
      toStatus: "APPROVED",
      actorName: "Usuário Financeiro",
    });

    const after = await countPendingApproval(org.id);
    expect(after).toBe(before); // ainda pendente (APPROVED não é terminal), só mudou de etapa
  });

  it("não conta mais como pendente depois de conciliada", async () => {
    const payable = await createPayable(context, baseInput({ description: "Conta ciclo completo" }));
    await advancePayableStatus(context, payable.id); // REVIEWED
    await advancePayableStatus(context, payable.id); // APPROVED
    await advancePayableStatus(context, payable.id); // SCHEDULED
    await advancePayableStatus(context, payable.id); // PAID
    const beforeReconciled = await countPendingApproval(org.id);
    await advancePayableStatus(context, payable.id); // RECONCILED
    const afterReconciled = await countPendingApproval(org.id);
    expect(afterReconciled).toBe(beforeReconciled - 1);
  });
});

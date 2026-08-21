// Funções puras de rateio de despesa entre empreendimentos (Fase B, Parte
// 4.2) — sem acesso a banco, testáveis isoladamente. Vivem fora de
// src/server porque não usam `server-only`/Prisma (mesma convenção de
// src/lib/index-correction.ts e src/lib/renegotiation-settlement.ts).

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type AllocationDestinationInput = {
  developmentId: string | null; // nulo = Organização
  percent?: number | null; // nulo quando lançado em valor fixo
  amount: number;
};

/**
 * Resolve os destinos "de verdade" de uma Payable pra agregação (relatórios,
 * fluxo de caixa, lista) — se não há rateio configurado, cai no destino
 * único já existente (`developmentId` da própria Payable), exatamente como
 * pedido na spec ("contas existentes continuam válidas como rateio de 100%
 * num destino só").
 */
export function resolvePayableDestinations(payable: {
  amount: number | string | { toString(): string };
  developmentId: string | null;
  allocations: { developmentId: string | null; amount: number | string | { toString(): string } }[];
}): { developmentId: string | null; amount: number }[] {
  if (payable.allocations.length > 0) {
    return payable.allocations.map((a) => ({ developmentId: a.developmentId, amount: Number(a.amount) }));
  }
  return [{ developmentId: payable.developmentId, amount: Number(payable.amount) }];
}

/**
 * Divide `totalAmount` pelos percentuais informados — arredonda cada destino
 * pra 2 casas exceto o último, que absorve a diferença de arredondamento,
 * garantindo soma exata (mesmo padrão de rigor centavo a centavo do resto do
 * financeiro).
 */
export function computeAllocationAmountsFromPercent(
  totalAmount: number,
  destinations: { developmentId: string | null; percent: number }[],
): AllocationDestinationInput[] {
  if (destinations.length === 0) return [];
  const result: AllocationDestinationInput[] = [];
  let allocated = 0;
  destinations.forEach((dest, index) => {
    if (index === destinations.length - 1) {
      result.push({ developmentId: dest.developmentId, percent: dest.percent, amount: round2(totalAmount - allocated) });
    } else {
      const amount = round2((totalAmount * dest.percent) / 100);
      allocated = round2(allocated + amount);
      result.push({ developmentId: dest.developmentId, percent: dest.percent, amount });
    }
  });
  return result;
}

export function assertDestinationsMatchAmount(amount: number, destinations: AllocationDestinationInput[]) {
  const sum = round2(destinations.reduce((acc, d) => acc + d.amount, 0));
  if (sum !== round2(amount)) {
    throw new Error(
      `A soma do rateio (${sum.toFixed(2)}) precisa bater exato com o valor total (${amount.toFixed(2)}).`,
    );
  }
}

/**
 * Escopo por EMPREENDIMENTO (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5)
 * aplicado a uma entidade que pode ter VÁRIOS destinos de empreendimento
 * (Payable rateado entre vários `developmentId` via `PayableAllocation`, ou
 * um `AllocationTemplate` com múltiplos destinos) — visível/acessível se
 * PELO MENOS UM destino está no escopo do usuário. Lista de destinos vazia
 * ou só com `developmentId: null` (nível organização) é sempre visível —
 * mesma convenção de `canAccessDevelopment` em src/server/scope.ts pra
 * entidade sem empreendimento específico.
 */
export function developmentIdsWithinAccess(
  developmentIds: (string | null | undefined)[],
  developmentAccess: "ALL" | Set<string>,
): boolean {
  if (developmentAccess === "ALL") return true;
  const ids = developmentIds.filter((id): id is string => !!id);
  if (ids.length === 0) return true;
  return ids.some((id) => developmentAccess.has(id));
}

import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Linha do tempo da venda (Fase A, Parte 3.2 — o "dossiê" cronológico:
 * reserva → proposta → venda → contrato → assinatura → carteira →
 * recebimentos). Montada em cima do `DevelopmentEvent` que já registra tudo
 * — é exibição, não infraestrutura nova (mesma premissa da spec).
 *
 * `DevelopmentEvent.entityId` não é uma FK tipada — a cadeia de entidades de
 * uma venda (reserva, proposta, venda, contrato, carteira, parcelas) não se
 * referencia entre si por uma chave única, então a linha do tempo é montada
 * juntando os eventos de cada entidade da cadeia por `entityId`. Vendas
 * anteriores a `Sale.reservationId` existir não mostram o evento de reserva
 * (campo nulo pra elas) — limitação aceita, não um bug.
 */
const EVENT_LABELS: Record<string, string> = {
  "reservation.created": "Reserva criada",
  "reservation.renewed": "Reserva renovada",
  "reservation.waitlist_joined": "Entrou na fila de espera",
  "reservation.waitlist_promoted": "Promovido(a) da fila de espera para reserva",
  "reservation.expired": "Reserva expirada",
  "proposal.created": "Proposta criada",
  "proposal.submitted": "Proposta enviada para aprovação",
  "proposal.approved_auto": "Proposta aprovada automaticamente (VPL)",
  "proposal.rejected_auto": "Proposta reprovada automaticamente (VPL)",
  "proposal.approved": "Proposta aprovada",
  "proposal.rejected": "Proposta reprovada",
  "sale.completed": "Venda registrada",
  "contract.drafted": "Contrato gerado (minuta)",
  "contract.sent_for_signature": "Enviado para assinatura",
  "contract.down_payment_as_commission": "Entrada líquida da comissão do corretor",
  "receivable_portfolio.created": "Carteira criada",
  "contract.signed": "Contrato assinado",
  "installment.paid": "Recebimento registrado",
};

export type TimelineEvent = {
  id: string;
  eventType: string;
  label: string;
  occurredAt: Date;
  entityType: string | null;
  payload: unknown;
};

export async function listSaleTimeline(
  organizationId: string,
  sale: { id: string; proposalId: string; reservationId: string | null },
  contract: { id: string; portfolio: { id: string; installments: { id: string }[] } | null } | null,
): Promise<TimelineEvent[]> {
  const entityIds = [sale.id, sale.proposalId];
  if (sale.reservationId) entityIds.push(sale.reservationId);
  if (contract) {
    entityIds.push(contract.id);
    if (contract.portfolio) {
      entityIds.push(contract.portfolio.id);
      entityIds.push(...contract.portfolio.installments.map((i) => i.id));
    }
  }

  const events = await prisma.developmentEvent.findMany({
    where: { organizationId, entityId: { in: entityIds } },
    orderBy: { occurredAt: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    label: EVENT_LABELS[event.eventType] ?? event.eventType,
    occurredAt: event.occurredAt,
    entityType: event.entityType,
    payload: event.payload,
  }));
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { orgScope, canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

const ENTITY_TYPE = "ReservationRule";

/**
 * Regra de reserva — geral (organização) OU por empreendimento (Fase A,
 * Parte 2.4; docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3). Resolução em
 * cascata: regra do empreendimento específico → regra geral da organização
 * → default do código. `developmentId: null` em `upsertReservationRule`
 * grava/edita a linha geral.
 */

/** Defaults sugeridos pela especificação (Parte 2) — valem quando não há regra geral nem específica configurada. */
export const DEFAULT_RESERVATION_RULE = {
  validityHours: 48,
  maxActiveReservationsPerBroker: 3 as number | null,
  waitlistEnabled: true,
  waitlistPriorityHours: 24,
  renewalAllowed: true,
  maxRenewals: 1,
  requiresApprovalForRenewal: true,
  requireIdentifiedCustomer: true,
  allowedReserverRoles: [] as string[],
};

export type ReservationRuleValues = typeof DEFAULT_RESERVATION_RULE;

function toValues(rule: {
  validityHours: number;
  maxActiveReservationsPerBroker: number | null;
  waitlistEnabled: boolean;
  waitlistPriorityHours: number;
  renewalAllowed: boolean;
  maxRenewals: number;
  requiresApprovalForRenewal: boolean;
  requireIdentifiedCustomer: boolean;
  allowedReserverRoles: string[];
}): ReservationRuleValues {
  return {
    validityHours: rule.validityHours,
    maxActiveReservationsPerBroker: rule.maxActiveReservationsPerBroker,
    waitlistEnabled: rule.waitlistEnabled,
    waitlistPriorityHours: rule.waitlistPriorityHours,
    renewalAllowed: rule.renewalAllowed,
    maxRenewals: rule.maxRenewals,
    requiresApprovalForRenewal: rule.requiresApprovalForRenewal,
    requireIdentifiedCustomer: rule.requireIdentifiedCustomer,
    allowedReserverRoles: rule.allowedReserverRoles,
  };
}

/** Regra efetiva: do empreendimento específico → geral da organização → default do código. */
export async function getEffectiveReservationRule(organizationId: string, developmentId: string): Promise<ReservationRuleValues> {
  const rule = await prisma.reservationRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.reservationRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return DEFAULT_RESERVATION_RULE;
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralReservationRule(context: AccessContext) {
  return prisma.reservationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export async function getReservationRule(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return null;
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development) return null;
  return prisma.reservationRule.findUnique({ where: { developmentId } });
}

/**
 * Empreendimentos da organização que têm uma regra própria (sobrescrevem a
 * geral) — filtrado pelo `developmentAccess` do usuário, pra não vazar quais
 * empreendimentos fora do escopo dele têm regra customizada.
 */
export async function listReservationRuleOverrides(context: AccessContext) {
  const rules = await prisma.reservationRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
  return rules.filter((r) => canAccessDevelopment(context, r.developmentId));
}

export type UpsertReservationRuleInput = ReservationRuleValues;

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico.
 */
export async function upsertReservationRule(
  context: AccessContext,
  developmentId: string | null,
  input: UpsertReservationRuleInput,
) {
  return prisma.$transaction(async (tx) => {
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development || !canAccessDevelopment(context, developmentId)) {
        throw new Error("Empreendimento inválido.");
      }
    }

    // `developmentId` é @unique (não composto) — a busca da linha geral usa
    // findFirst (não findUnique) porque não há chave única declarada sobre
    // (organizationId, developmentId nulo); a unicidade de "uma geral por
    // organização" é garantida aqui, na camada de serviço (find-then-create/
    // update dentro da mesma transação), não por constraint de banco — mesmo
    // padrão de validação em serviço já usado no resto do projeto.
    const before = developmentId
      ? await tx.reservationRule.findUnique({ where: { developmentId } })
      : await tx.reservationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.reservationRule.update({ where: { id: before.id }, data: input })
      : await tx.reservationRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: ENTITY_TYPE,
      entityId: rule.id,
      beforeData: before,
      afterData: rule,
    });

    return rule;
  });
}

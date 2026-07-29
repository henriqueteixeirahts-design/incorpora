import type { UnitStatus } from "@/generated/prisma/client";

// Cor e rótulo por status (PRD: "Cada status deve ter uma cor e um histórico").
// Fixo por ora; migra para Setting (por organização) na Fase 3.
export const UNIT_STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  AVAILABLE: { label: "Disponível", color: "#2f9e44" },
  IN_SERVICE: { label: "Em atendimento", color: "#f08c00" },
  RESERVED: { label: "Reservada", color: "#f5a623" },
  PROPOSAL_UNDER_REVIEW: { label: "Proposta em análise", color: "#4263eb" },
  PROPOSAL_APPROVED: { label: "Proposta aprovada", color: "#3b5bdb" },
  CONTRACT_IN_PROGRESS: { label: "Contrato em elaboração", color: "#7048e8" },
  AWAITING_SIGNATURE: { label: "Aguardando assinatura", color: "#9c36b5" },
  SOLD: { label: "Vendida", color: "#495057" },
  BLOCKED: { label: "Bloqueada", color: "#e03131" },
  EXCHANGE: { label: "Permutante — fora de gestão", color: "#ae3ec9" },
  DEVELOPER_UNIT: { label: "Unidade da incorporadora", color: "#868e96" },
  INVESTOR_UNIT: { label: "Unidade de investidor", color: "#5c940d" },
  CANCELLED: { label: "Distratada", color: "#c92a2a" },
  UNAVAILABLE: { label: "Indisponível", color: "#212529" },
};

export const UNIT_STATUS_VALUES = Object.keys(UNIT_STATUS_META) as UnitStatus[];

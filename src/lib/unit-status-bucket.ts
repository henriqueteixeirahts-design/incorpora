import type { UnitStatus } from "@/generated/prisma/client";

// O espelho resumido do dashboard (direção visual INCORPORA) usa só 5
// buckets de cor; os 14 status reais do sistema colapsam neles por estágio
// de negócio, não por igualdade literal de nome.
export type UnitStatusBucket = "disponivel" | "reservado" | "vendido" | "permuta" | "bloqueado";

const BUCKET_BY_STATUS: Record<UnitStatus, UnitStatusBucket> = {
  AVAILABLE: "disponivel",
  IN_SERVICE: "reservado",
  RESERVED: "reservado",
  PROPOSAL_UNDER_REVIEW: "reservado",
  PROPOSAL_APPROVED: "reservado",
  CONTRACT_IN_PROGRESS: "reservado",
  AWAITING_SIGNATURE: "reservado",
  SOLD: "vendido",
  EXCHANGE: "permuta",
  BLOCKED: "bloqueado",
  UNAVAILABLE: "bloqueado",
  CANCELLED: "bloqueado",
  DEVELOPER_UNIT: "bloqueado",
  INVESTOR_UNIT: "bloqueado",
};

export function bucketUnitStatus(status: UnitStatus): UnitStatusBucket {
  return BUCKET_BY_STATUS[status];
}

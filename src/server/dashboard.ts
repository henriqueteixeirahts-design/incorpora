import "server-only";

import { prisma } from "@/lib/prisma";
import { bucketUnitStatus, type UnitStatusBucket } from "@/lib/unit-status-bucket";
import type { AccessContext } from "@/server/auth-context";
import { developmentAccessScope, developmentIdAccessScope } from "@/server/scope";

const BUCKET_LABEL: Record<UnitStatusBucket, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  permuta: "Permuta",
  bloqueado: "Bloqueado",
};

const MAX_FLOORS_SHOWN = 6;

export type MirrorSummary = {
  developmentName: string;
  maxCols: number;
  floors: {
    label: string;
    units: { id: string; number: string; area: number | null; bucket: UnitStatusBucket }[];
  }[];
  legend: { bucket: UnitStatusBucket; label: string; count: number }[];
};

/**
 * Espelho de vendas resumido do dashboard: pega o empreendimento com mais
 * unidades (o mais representativo da carteira) e mostra só os pavimentos
 * mais altos — a legenda soma todas as unidades, não só as exibidas.
 * `developmentIdAccessScope` garante que o empreendimento escolhido está no
 * escopo do usuário (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5) — um
 * usuário restrito a um empreendimento nunca vê o espelho de outro só
 * porque ele tem mais unidades na organização inteira.
 */
export async function getDashboardMirrorSummary(context: AccessContext): Promise<MirrorSummary | null> {
  const development = await prisma.development.findFirst({
    where: { organizationId: context.organizationId, buildings: { some: { floors: { some: {} } } }, ...developmentIdAccessScope(context) },
    orderBy: { units: { _count: "desc" } },
    include: { buildings: { include: { floors: true } } },
  });
  if (!development) return null;

  const units = await prisma.unit.findMany({
    where: { developmentId: development.id, isAccessory: false, floorId: { not: null } },
    select: { id: true, number: true, status: true, totalArea: true, floorId: true },
  });

  const legendCounts = new Map<UnitStatusBucket, number>();
  for (const unit of units) {
    const bucket = bucketUnitStatus(unit.status);
    legendCounts.set(bucket, (legendCounts.get(bucket) ?? 0) + 1);
  }

  const floorsByLevel = development.buildings
    .flatMap((building) => building.floors)
    .sort((a, b) => b.level - a.level)
    .slice(0, MAX_FLOORS_SHOWN);

  const unitsByFloor = new Map<string, typeof units>();
  for (const unit of units) {
    if (!unit.floorId) continue;
    const list = unitsByFloor.get(unit.floorId) ?? [];
    list.push(unit);
    unitsByFloor.set(unit.floorId, list);
  }

  const floors = floorsByLevel.map((floor) => ({
    label: floor.label ?? String(floor.level),
    units: (unitsByFloor.get(floor.id) ?? [])
      .sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true }))
      .map((unit) => ({
        id: unit.id,
        number: unit.number,
        area: unit.totalArea === null ? null : Number(unit.totalArea),
        bucket: bucketUnitStatus(unit.status),
      })),
  }));

  const maxCols = Math.max(1, ...floors.map((f) => f.units.length));

  const legend = (Object.keys(BUCKET_LABEL) as UnitStatusBucket[]).map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    count: legendCounts.get(bucket) ?? 0,
  }));

  return { developmentName: development.name, maxCols, floors, legend };
}

export async function getRecentSales(context: AccessContext, limit = 5) {
  const sales = await prisma.sale.findMany({
    where: { organizationId: context.organizationId, status: "ACTIVE", ...developmentAccessScope(context) },
    orderBy: { saleDate: "desc" },
    take: limit,
    include: { customer: true, development: true, unit: true },
  });

  return sales.map((sale) => ({
    id: sale.id,
    unitNumber: sale.unit.number,
    customerName: sale.customer.name,
    developmentName: sale.development.name,
    salePrice: Number(sale.salePrice),
    saleDate: sale.saleDate,
  }));
}

"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { UNIT_STATUS_META, UNIT_STATUS_VALUES } from "@/lib/unit-status";
import { bucketUnitStatus, type UnitStatusBucket } from "@/lib/unit-status-bucket";
import { getUnitColumnKey, groupLotsByBlock, UNASSIGNED_BLOCK } from "@/lib/unit-grid";
import type { UnitSaleDetail } from "@/server/unit-sale-detail";
import {
  createReservationFromMapAction,
  destacarUnidadeFromMapAction,
  removerDestaqueFromMapAction,
  renewReservationFromMapAction,
  cancelReservationFromMapAction,
  getUnitSaleDetailAction,
  type FormState,
} from "./actions";

export type EspelhoUnit = {
  id: string;
  number: string;
  status: string;
  unitType: string;
  buildingId: string | null;
  floorId: string | null;
  position: string | null;
  block: string | null;
  referenceValue: number | null;
  area: number | null;
  exchangeContractId: string | null;
};

export type EspelhoBuilding = {
  id: string;
  name: string;
  floors: { id: string; level: number; label: string | null }[];
};

export type EspelhoContract = {
  id: string;
  permutanteName: string;
  type: string;
  managedBySystem: boolean | null;
};

export type EspelhoReservation = {
  id: string;
  unitId: string;
  customerName: string;
  brokerName: string | null;
  expiresAt: Date;
  renewalCount: number;
};

type Option = { id: string; label: string };

const UNIT_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "Apartamento",
  COMMERCIAL_ROOM: "Sala comercial",
  STORE: "Loja",
  LOT: "Lote",
  PARKING_SPACE: "Vaga",
  STORAGE_UNIT: "Depósito",
  BOX: "Box",
  OTHER: "Outro",
};

const BUCKET_LABEL: Record<UnitStatusBucket, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  permuta: "Permuta",
  bloqueado: "Bloqueado",
};

const HIGH_RISE_FLOOR_THRESHOLD = 20;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SaleDetailSection({ unitId }: { unitId: string }) {
  const [saleDetail, setSaleDetail] = useState<UnitSaleDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getUnitSaleDetailAction(unitId).then((detail) => {
      if (!cancelled) {
        setSaleDetail(detail);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  if (loading) {
    return <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>Carregando contrato…</p>;
  }
  if (!saleDetail) return null;

  return (
    <>
      <div>
        <div className="inc-eyebrow">Valor da venda</div>
        <div style={{ marginTop: "4px", fontSize: "15px", fontWeight: 600, color: "var(--inc-brand-azul)" }}>
          {formatCurrency(saleDetail.salePrice)}
        </div>
      </div>
      <div style={{ height: "1px", background: "var(--inc-border-divider)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <div
            style={{
              width: 32,
              height: 32,
              flex: "none",
              borderRadius: "16px",
              background: "var(--inc-info-bg)",
              color: "var(--inc-brand-azul)",
              fontSize: "11px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {initialsOf(saleDetail.customerName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{saleDetail.customerName}</div>
            <div style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>{saleDetail.customerDocument}</div>
          </div>
        </div>
        {saleDetail.commission ? (
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div
              style={{
                width: 32,
                height: 32,
                flex: "none",
                borderRadius: "16px",
                background: "var(--inc-warning-bg)",
                color: "var(--inc-warning-text)",
                fontSize: "11px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initialsOf(saleDetail.commission.beneficiaryName)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13.5px", fontWeight: 500 }}>{saleDetail.commission.beneficiaryName}</div>
              <div style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>
                Comissão {saleDetail.commission.percent}% · {formatCurrency(saleDetail.commission.value)}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {saleDetail.installmentGroups.length > 0 ? (
        <>
          <div style={{ height: "1px", background: "var(--inc-border-divider)" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--inc-brand-azul)" }}>Recebíveis</div>
              <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--inc-text-soft)" }}>
                {saleDetail.installments.paidCount} de {saleDetail.installments.totalCount} pagas
              </div>
            </div>
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {saleDetail.installmentGroups.map((group) => {
                const label = group.count > 1 ? `${group.label} · ${group.count} parcelas` : group.label;
                const state = group.paidCount === group.count ? "pago" : group.paidCount > 0 ? "em curso" : "previsto";
                const color =
                  state === "pago" ? "var(--inc-success)" : state === "em curso" ? "var(--inc-warning-text)" : "var(--inc-text-soft)";
                return (
                  <div key={group.label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px" }}>
                    <span style={{ flex: 1, color: "var(--inc-text-secondary)" }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(group.value)}</span>
                    <span style={{ color, fontWeight: 500 }}>{state}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
      <Link href={`/sales/${saleDetail.saleId}`} className="inc-btn inc-btn--primary" style={{ marginTop: "auto" }}>
        Ver contrato
      </Link>
    </>
  );
}

const reservationInitialState: FormState = {};

function ReservationPanel({
  developmentId,
  unit,
  customers,
  brokers,
  agencies,
  salesTables,
  defaultValidityHours,
  onDone,
}: {
  developmentId: string;
  unit: EspelhoUnit;
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
  defaultValidityHours: number;
  onDone: () => void;
}) {
  const [state, dispatch, pending] = useActionState(createReservationFromMapAction, reservationInitialState);
  const isWaitlistFlow = unit.status === "RESERVED";

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="unitId" value={unit.id} />

      <label className="inc-field">
        <span className="inc-label">Cliente *</span>
        <select id="map-res-customer" name="customerId" className="inc-select" required defaultValue="">
          <option value="" disabled>
            Selecione...
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inc-field">
        <span className="inc-label">Corretor</span>
        <select name="brokerId" className="inc-select" defaultValue="">
          <option value="">—</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inc-field">
        <span className="inc-label">Imobiliária</span>
        <select name="agencyId" className="inc-select" defaultValue="">
          <option value="">—</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inc-field">
        <span className="inc-label">Tabela de vendas</span>
        <select name="salesTableId" className="inc-select" defaultValue="">
          <option value="">—</option>
          {salesTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {!isWaitlistFlow ? (
        <label className="inc-field">
          <span className="inc-label">Validade (horas)</span>
          <input name="expiresInHours" type="number" className="inc-input" defaultValue={defaultValidityHours} min={1} />
        </label>
      ) : null}
      <label className="inc-field">
        <span className="inc-label">Observação</span>
        <input name="reason" className="inc-input" />
      </label>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.message ? <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>{state.message}</p> : null}

      <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
        {pending ? "Enviando..." : isWaitlistFlow ? "Entrar na fila de espera" : "Reservar"}
      </button>
    </form>
  );
}

function UnitCell({
  unit,
  selected,
  destacadaToActive,
  visible,
  busy,
  onClick,
  compact,
}: {
  unit: EspelhoUnit;
  selected: boolean;
  destacadaToActive: boolean;
  visible: boolean;
  busy: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  const meta = UNIT_STATUS_META[unit.status as keyof typeof UNIT_STATUS_META];
  const bucket = bucketUnitStatus(unit.status as keyof typeof UNIT_STATUS_META);

  return (
    <button
      type="button"
      title={`${unit.number} — ${meta.label}`}
      onClick={onClick}
      disabled={busy}
      aria-pressed={selected}
      className={`inc-unit inc-unit--${bucket}`}
      style={{
        position: "relative",
        height: compact ? "26px" : undefined,
        border: destacadaToActive ? "2px dashed #fff" : undefined,
        opacity: visible ? 1 : 0.3,
        cursor: "pointer",
      }}
    >
      <div className="inc-unit__n">{unit.number}</div>
      {!compact && unit.area !== null ? <div className="inc-unit__area">{unit.area} m²</div> : null}
      {unit.exchangeContractId ? (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "#fff",
            color: "#000",
            borderRadius: "50%",
            width: 14,
            height: 14,
            fontSize: "9px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          P
        </span>
      ) : null}
    </button>
  );
}

export function EspelhoGrid({
  developmentId,
  buildings,
  units,
  unassignedUnits,
  contracts,
  reservations,
  customers,
  brokers,
  agencies,
  salesTables,
  canCreateReservation,
  canCreateProposal,
  canManageExchange,
  canCancelReservation,
  canRenewReservation,
  renewalAllowed,
  maxRenewals,
  defaultValidityHours,
  waitlistCounts,
}: {
  developmentId: string;
  buildings: EspelhoBuilding[];
  units: EspelhoUnit[];
  unassignedUnits: EspelhoUnit[];
  contracts: EspelhoContract[];
  reservations: EspelhoReservation[];
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
  canCreateReservation: boolean;
  canCreateProposal: boolean;
  canManageExchange: boolean;
  canCancelReservation: boolean;
  canRenewReservation: boolean;
  renewalAllowed: boolean;
  maxRenewals: number;
  defaultValidityHours: number;
  waitlistCounts: Record<string, number>;
}) {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [activeContractId, setActiveContractId] = useState("");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeBusy, setExchangeBusy] = useState(false);

  const allUnits = useMemo(() => [...units, ...unassignedUnits], [units, unassignedUnits]);
  const lotsByBlock = useMemo(() => groupLotsByBlock(unassignedUnits), [unassignedUnits]);

  const passesFilter = (unit: EspelhoUnit) => {
    if (typeFilter && unit.unitType !== typeFilter) return false;
    if (statusFilter && unit.status !== statusFilter) return false;
    if (minPrice && (unit.referenceValue ?? 0) < Number(minPrice)) return false;
    if (maxPrice && (unit.referenceValue ?? Infinity) > Number(maxPrice)) return false;
    return true;
  };

  const counters = useMemo(() => {
    const total = allUnits.length;
    const byBucket = new Map<UnitStatusBucket, number>();
    for (const unit of allUnits) {
      const bucket = bucketUnitStatus(unit.status as keyof typeof UNIT_STATUS_META);
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + 1);
    }
    const vendido = byBucket.get("vendido") ?? 0;
    const vso = total > 0 ? (vendido / total) * 100 : 0;
    return { total, byBucket, vso };
  }, [allUnits]);

  const selectedUnit = allUnits.find((u) => u.id === selectedUnitId) ?? null;
  const selectedReservation = selectedUnit ? reservations.find((r) => r.unitId === selectedUnit.id) ?? null : null;
  const selectedBuilding = selectedUnit ? buildings.find((b) => b.id === selectedUnit.buildingId) ?? null : null;
  const selectedFloor = selectedBuilding?.floors.find((f) => f.id === selectedUnit?.floorId) ?? null;
  const selectedExchangeContract = selectedUnit?.exchangeContractId
    ? contracts.find((c) => c.id === selectedUnit.exchangeContractId) ?? null
    : null;
  const activeContract = contracts.find((c) => c.id === activeContractId) ?? null;

  async function handleUnitClick(unit: EspelhoUnit) {
    setExchangeError(null);

    if (exchangeMode && activeContract) {
      if (unit.exchangeContractId === activeContract.id) {
        setExchangeBusy(true);
        const result = await removerDestaqueFromMapAction(developmentId, activeContract.id, unit.id);
        setExchangeBusy(false);
        if (result.error) setExchangeError(result.error);
        return;
      }
      if (unit.exchangeContractId) {
        setExchangeError("Unidade já destacada para outro contrato de permuta.");
        return;
      }
      if (unit.status !== "AVAILABLE") {
        setExchangeError("Só é possível destacar unidades disponíveis.");
        return;
      }
      setExchangeBusy(true);
      const result = await destacarUnidadeFromMapAction(developmentId, activeContract.id, unit.id);
      setExchangeBusy(false);
      if (result.error) setExchangeError(result.error);
      return;
    }

    setSelectedUnitId(unit.id === selectedUnitId ? null : unit.id);
  }

  function renderCell(unit: EspelhoUnit, compact: boolean) {
    const isDestacadaToActive = Boolean(exchangeMode && activeContract && unit.exchangeContractId === activeContract.id);
    return (
      <UnitCell
        key={unit.id}
        unit={unit}
        selected={selectedUnitId === unit.id}
        destacadaToActive={isDestacadaToActive}
        visible={passesFilter(unit)}
        busy={exchangeBusy}
        compact={compact}
        onClick={() => handleUnitClick(unit)}
      />
    );
  }

  const exchangeableContracts = contracts.filter((c) => c.type !== "FINANCIAL");

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 18px",
          padding: "13px 18px",
          background: "var(--inc-surface)",
          border: "1px solid var(--inc-border-card)",
        }}
      >
        {(Object.keys(BUCKET_LABEL) as UnitStatusBucket[]).map((bucket) => (
          <div key={bucket} className="inc-legend__item" style={{ fontWeight: 500, color: "var(--inc-text-body)" }}>
            <span className={`inc-legend__swatch inc-unit--${bucket}`} />
            {BUCKET_LABEL[bucket]} <span style={{ color: "var(--inc-text-soft)", fontWeight: 400 }}>{counters.byBucket.get(bucket) ?? 0}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {counters.total} unidades · VSO {counters.vso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </div>
      </div>

      <div className="inc-filters" style={{ margin: "16px 0" }}>
        <label className="inc-field" style={{ minWidth: 180 }}>
          <span className="inc-label">Tipologia</span>
          <select className="inc-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Todas as tipologias</option>
            {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field" style={{ minWidth: 180 }}>
          <span className="inc-label">Status</span>
          <select className="inc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            {UNIT_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {UNIT_STATUS_META[status].label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field" style={{ width: 130 }}>
          <span className="inc-label">Preço mín.</span>
          <input type="number" className="inc-input" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        </label>
        <label className="inc-field" style={{ width: 130 }}>
          <span className="inc-label">Preço máx.</span>
          <input type="number" className="inc-input" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </label>
      </div>

      {canManageExchange && exchangeableContracts.length > 0 ? (
        <div className="inc-card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
            <input
              type="checkbox"
              checked={exchangeMode}
              onChange={(e) => {
                setExchangeMode(e.target.checked);
                setSelectedUnitId(null);
                setExchangeError(null);
              }}
            />
            Modo permutante — destacar/remover unidades de um contrato de permuta
          </label>
          {exchangeMode ? (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", maxWidth: 420 }}>
              <select className="inc-select" value={activeContractId} onChange={(e) => setActiveContractId(e.target.value)}>
                <option value="">Selecione o contrato...</option>
                {exchangeableContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.permutanteName} ({c.type === "PHYSICAL" ? "Física" : "Mista"})
                  </option>
                ))}
              </select>
              <p style={{ fontSize: "12px", color: "var(--inc-text-soft)" }}>
                Clique numa unidade Disponível para destacar; clique numa já destacada deste contrato pra remover.
              </p>
              {exchangeError ? <p className="error-text">{exchangeError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 336px", gap: "18px", alignItems: "start" }}>
        <div className="inc-card" style={{ padding: "20px 22px" }}>
          {buildings.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "26px" }}>
              {buildings.map((building) => {
                const buildingUnits = units.filter((unit) => unit.buildingId === building.id);
                const floors = [...building.floors].sort((a, b) => b.level - a.level);
                const columnKeys = Array.from(new Set(buildingUnits.map((u) => getUnitColumnKey(u)))).sort();
                const compact = building.floors.length > HIGH_RISE_FLOOR_THRESHOLD;

                return (
                  <div key={building.id} style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--inc-brand-azul)",
                        paddingBottom: "8px",
                        borderBottom: "1px solid var(--inc-border-divider)",
                      }}
                    >
                      {building.name}
                    </div>
                    <div style={{ display: "flex", gap: "5px", alignItems: "center", paddingTop: "4px" }}>
                      <div style={{ width: 30, flex: "none" }} />
                      <div
                        style={{
                          flex: 1,
                          display: "grid",
                          gridTemplateColumns: `repeat(${columnKeys.length}, 1fr)`,
                          gap: "5px",
                          fontSize: "10px",
                          color: "var(--inc-text-muted)",
                          fontWeight: 600,
                          textAlign: "center",
                        }}
                      >
                        {columnKeys.map((key) => (
                          <div key={key}>{key}</div>
                        ))}
                      </div>
                    </div>
                    {floors.map((floor) => {
                      const floorUnits = buildingUnits.filter((u) => u.floorId === floor.id);
                      if (floorUnits.length === 0) return null;
                      const unitsByColumn = new Map(floorUnits.map((u) => [getUnitColumnKey(u), u]));

                      return (
                        <div key={floor.id} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                          <div
                            style={{
                              width: 30,
                              flex: "none",
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "var(--inc-text-muted)",
                              textAlign: "right",
                              paddingRight: "6px",
                            }}
                          >
                            {floor.label ?? floor.level}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              display: "grid",
                              gridTemplateColumns: `repeat(${columnKeys.length}, 1fr)`,
                              gap: "5px",
                            }}
                          >
                            {columnKeys.map((key) => {
                              const unit = unitsByColumn.get(key);
                              return unit ? renderCell(unit, compact) : <span key={key} />;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}

          {lotsByBlock.length > 0 ? (
            <div style={{ marginTop: buildings.length > 0 ? "26px" : 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {lotsByBlock.map(([block, lots]) => (
                <div key={block} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ width: 90, fontSize: "10px", fontWeight: 600, color: "var(--inc-text-muted)", flexShrink: 0 }}>
                    {block === UNASSIGNED_BLOCK ? "Sem quadra" : `Quadra ${block}`}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>{lots.map((unit) => renderCell(unit, false))}</div>
                </div>
              ))}
            </div>
          ) : null}

          {allUnits.length === 0 ? (
            <p style={{ color: "var(--inc-text-soft)", fontSize: "13px" }}>Nenhuma unidade cadastrada.</p>
          ) : null}
        </div>

        <div className="inc-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selectedUnit ? (
            <>
              <div style={{ padding: "18px 20px", background: "var(--inc-brand-azul)", color: "var(--inc-text-on-azul)" }}>
                <div
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--inc-brand-azul-claro)",
                    fontWeight: 600,
                  }}
                >
                  Unidade selecionada
                </div>
                <div style={{ marginTop: "7px", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {selectedUnit.number}
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--inc-nav-subitem)" }}>
                  {[selectedBuilding?.name, selectedFloor ? `${selectedFloor.label ?? selectedFloor.level}º pavimento` : null, UNIT_TYPE_LABELS[selectedUnit.unitType] ?? selectedUnit.unitType]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "4px 11px",
                    borderRadius: "2px",
                    background: "var(--inc-brand-bege)",
                    color: "var(--inc-brand-azul)",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {UNIT_STATUS_META[selectedUnit.status as keyof typeof UNIT_STATUS_META].label}
                </div>
              </div>

              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1, overflowY: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  {selectedUnit.area !== null ? (
                    <div>
                      <div className="inc-eyebrow">Área privativa</div>
                      <div style={{ marginTop: "4px", fontSize: "15px", fontWeight: 600 }}>{selectedUnit.area} m²</div>
                    </div>
                  ) : null}
                  {selectedUnit.referenceValue !== null ? (
                    <div>
                      <div className="inc-eyebrow">Valor de tabela</div>
                      <div style={{ marginTop: "4px", fontSize: "15px", fontWeight: 600 }}>{formatCurrency(selectedUnit.referenceValue)}</div>
                    </div>
                  ) : null}
                </div>

                <SaleDetailSection key={selectedUnit.id} unitId={selectedUnit.id} />

                {selectedExchangeContract ? (
                  <>
                    <div style={{ height: "1px", background: "var(--inc-border-divider)" }} />
                    <p style={{ fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                      Destacada para o contrato de permuta de <strong>{selectedExchangeContract.permutanteName}</strong>.
                    </p>
                  </>
                ) : null}

                {selectedUnit.status === "RESERVED" && selectedReservation ? (
                  <>
                    <div style={{ height: "1px", background: "var(--inc-border-divider)" }} />
                    <p style={{ fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                      Reservada para <strong>{selectedReservation.customerName}</strong>
                      {selectedReservation.brokerName ? ` (corretor: ${selectedReservation.brokerName})` : ""} — expira em{" "}
                      {new Date(selectedReservation.expiresAt).toLocaleString("pt-BR")}
                    </p>
                    {(waitlistCounts[selectedUnit.id] ?? 0) > 0 ? (
                      <p style={{ fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                        {waitlistCounts[selectedUnit.id]} cliente(s) na fila de espera.
                      </p>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {canRenewReservation && renewalAllowed && selectedReservation.renewalCount < maxRenewals ? (
                        <button
                          type="button"
                          className="inc-btn inc-btn--secondary"
                          onClick={async () => {
                            await renewReservationFromMapAction(developmentId, selectedReservation.id);
                          }}
                        >
                          Renovar
                        </button>
                      ) : null}
                      {canCancelReservation ? (
                        <button
                          type="button"
                          className="inc-btn inc-btn--secondary"
                          onClick={async () => {
                            await cancelReservationFromMapAction(developmentId, selectedReservation.id);
                            setSelectedUnitId(null);
                          }}
                        >
                          Cancelar reserva
                        </button>
                      ) : null}
                      {canCreateProposal ? (
                        <Link href={`/developments/${developmentId}/commercial?unitId=${selectedUnit.id}#nova-proposta`} className="inc-btn inc-btn--secondary">
                          Simular proposta
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {!exchangeMode && (selectedUnit.status === "AVAILABLE" || selectedUnit.status === "RESERVED") && canCreateReservation ? (
                  <>
                    <div style={{ height: "1px", background: "var(--inc-border-divider)" }} />
                    <ReservationPanel
                      developmentId={developmentId}
                      unit={selectedUnit}
                      customers={customers}
                      brokers={brokers}
                      agencies={agencies}
                      salesTables={salesTables}
                      defaultValidityHours={defaultValidityHours}
                      onDone={() => setSelectedUnitId(null)}
                    />
                  </>
                ) : null}

                <button type="button" className="inc-btn inc-btn--quiet" onClick={() => setSelectedUnitId(null)}>
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "20px", color: "var(--inc-text-soft)", fontSize: "13px" }}>
              Selecione uma unidade no espelho para ver os detalhes.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

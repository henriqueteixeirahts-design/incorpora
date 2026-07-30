"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { UNIT_STATUS_META, UNIT_STATUS_VALUES } from "@/lib/unit-status";
import { getUnitColumnKey, groupLotsByBlock, UNASSIGNED_BLOCK } from "@/lib/unit-grid";
import {
  createReservationFromMapAction,
  destacarUnidadeFromMapAction,
  removerDestaqueFromMapAction,
  renewReservationFromMapAction,
  cancelReservationFromMapAction,
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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    <form action={dispatch} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="unitId" value={unit.id} />

      <div className="field">
        <label htmlFor="map-res-customer">Cliente *</label>
        <select id="map-res-customer" name="customerId" required defaultValue="">
          <option value="" disabled>
            Selecione...
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="map-res-broker">Corretor</label>
        <select id="map-res-broker" name="brokerId" defaultValue="">
          <option value="">—</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="map-res-agency">Imobiliária</label>
        <select id="map-res-agency" name="agencyId" defaultValue="">
          <option value="">—</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="map-res-table">Tabela de vendas</label>
        <select id="map-res-table" name="salesTableId" defaultValue="">
          <option value="">—</option>
          {salesTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {!isWaitlistFlow ? (
        <div className="field">
          <label htmlFor="map-res-hours">Validade (horas)</label>
          <input id="map-res-hours" name="expiresInHours" type="number" defaultValue={defaultValidityHours} min={1} />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="map-res-reason">Observação</label>
        <input id="map-res-reason" name="reason" />
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.message ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Enviando..." : isWaitlistFlow ? "Entrar na fila de espera" : "Reservar"}
      </button>
    </form>
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
    const disponiveis = allUnits.filter((u) => u.status === "AVAILABLE").length;
    const reservadas = allUnits.filter((u) => u.status === "RESERVED").length;
    const vendidas = allUnits.filter((u) => u.status === "SOLD").length;
    const bloqueadas = allUnits.filter((u) => u.status === "BLOCKED").length;
    const vgvDisponivel = allUnits
      .filter((u) => u.status === "AVAILABLE")
      .reduce((sum, u) => sum + (u.referenceValue ?? 0), 0);
    const pctVendido = total > 0 ? (vendidas / total) * 100 : 0;
    return { total, disponiveis, reservadas, vendidas, bloqueadas, vgvDisponivel, pctVendido };
  }, [allUnits]);

  const selectedUnit = allUnits.find((u) => u.id === selectedUnitId) ?? null;
  const selectedReservation = selectedUnit
    ? reservations.find((r) => r.unitId === selectedUnit.id) ?? null
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

  function renderCell(unit: EspelhoUnit) {
    const meta = UNIT_STATUS_META[unit.status as keyof typeof UNIT_STATUS_META];
    const visible = passesFilter(unit);
    const isDestacadaToActive = exchangeMode && activeContract && unit.exchangeContractId === activeContract.id;

    return (
      <button
        key={unit.id}
        type="button"
        title={`${unit.number} — ${meta.label}`}
        onClick={() => handleUnitClick(unit)}
        disabled={exchangeBusy}
        style={{
          position: "relative",
          background: meta.color,
          color: "#fff",
          borderRadius: 4,
          padding: "0.3rem 0.4rem",
          fontSize: "0.75rem",
          border: selectedUnitId === unit.id ? "2px solid var(--foreground)" : isDestacadaToActive ? "2px dashed #fff" : "none",
          opacity: visible ? 1 : 0.25,
          cursor: "pointer",
          minWidth: 46,
        }}
      >
        {unit.number}
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
              fontSize: "0.6rem",
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

  const exchangeableContracts = contracts.filter((c) => c.type !== "FINANCIAL");

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", margin: "1rem 0", fontSize: "0.85rem" }}>
        <span>Total: {counters.total}</span>
        <span>Disponíveis: {counters.disponiveis}</span>
        <span>Reservadas: {counters.reservadas}</span>
        <span>Vendidas: {counters.vendidas}</span>
        <span>Bloqueadas: {counters.bloqueadas}</span>
        <span>% vendido: {counters.pctVendido.toFixed(1)}%</span>
        <span>VGV disponível: {formatCurrency(counters.vgvDisponivel)}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todas as tipologias</option>
          {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {UNIT_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {UNIT_STATUS_META[status].label}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Preço mín."
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          style={{ width: 120 }}
        />
        <input
          type="number"
          placeholder="Preço máx."
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          style={{ width: 120 }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {Object.values(UNIT_STATUS_META).map((meta) => (
          <span key={meta.label} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: meta.color, display: "inline-block" }} />
            {meta.label}
          </span>
        ))}
      </div>

      {canManageExchange && exchangeableContracts.length > 0 ? (
        <div className="field-section" style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
            <div style={{ marginTop: "0.5rem" }}>
              <select value={activeContractId} onChange={(e) => setActiveContractId(e.target.value)}>
                <option value="">Selecione o contrato...</option>
                {exchangeableContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.permutanteName} ({c.type === "PHYSICAL" ? "Física" : "Mista"})
                  </option>
                ))}
              </select>
              <p className="field-hint" style={{ marginTop: "0.35rem" }}>
                Clique numa unidade Disponível para destacar; clique numa já destacada deste contrato pra remover.
              </p>
              {exchangeError ? <p className="error-text">{exchangeError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {buildings.map((building) => {
        const buildingUnits = units.filter((unit) => unit.buildingId === building.id);
        const floors = [...building.floors].sort((a, b) => b.level - a.level);
        const columnKeys = Array.from(new Set(buildingUnits.map((u) => getUnitColumnKey(u)))).sort();

        return (
          <section key={building.id} style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>{building.name}</h2>
            <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `90px repeat(${columnKeys.length}, minmax(50px, 1fr))`,
                  gap: "0.3rem",
                  minWidth: columnKeys.length * 55 + 90,
                }}
              >
                {floors.map((floor) => {
                  const floorUnits = buildingUnits.filter((u) => u.floorId === floor.id);
                  if (floorUnits.length === 0) return null;
                  const unitsByColumn = new Map(floorUnits.map((u) => [getUnitColumnKey(u), u]));

                  return (
                    <div key={floor.id} style={{ display: "contents" }}>
                      <span style={{ fontSize: "0.78rem", opacity: 0.7, alignSelf: "center" }}>
                        {floor.label ?? `Andar ${floor.level}`}
                      </span>
                      {columnKeys.map((key) => {
                        const unit = unitsByColumn.get(key);
                        return unit ? (
                          renderCell(unit)
                        ) : (
                          <span key={key} />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      {lotsByBlock.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Loteamento</h2>
          {lotsByBlock.map(([block, lots]) => (
            <div key={block} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <span style={{ width: 110, fontSize: "0.78rem", opacity: 0.7, flexShrink: 0 }}>
                {block === UNASSIGNED_BLOCK ? "Sem quadra" : `Quadra ${block}`}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>{lots.map((unit) => renderCell(unit))}</div>
            </div>
          ))}
        </section>
      ) : null}

      {allUnits.length === 0 ? <p style={{ opacity: 0.7 }}>Nenhuma unidade cadastrada.</p> : null}

      {selectedUnit ? (
        <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 420 }}>
          <h3>
            Unidade {selectedUnit.number} — {UNIT_STATUS_META[selectedUnit.status as keyof typeof UNIT_STATUS_META].label}
          </h3>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            {UNIT_TYPE_LABELS[selectedUnit.unitType] ?? selectedUnit.unitType}
            {selectedUnit.referenceValue !== null ? ` · ${formatCurrency(selectedUnit.referenceValue)}` : ""}
          </p>

          {selectedUnit.status === "RESERVED" && selectedReservation ? (
            <>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                Reservada para {selectedReservation.customerName}
                {selectedReservation.brokerName ? ` (corretor: ${selectedReservation.brokerName})` : ""} — expira em{" "}
                {new Date(selectedReservation.expiresAt).toLocaleString("pt-BR")}
              </p>
              {(waitlistCounts[selectedUnit.id] ?? 0) > 0 ? (
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  {waitlistCounts[selectedUnit.id]} cliente(s) na fila de espera.
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                {canRenewReservation && renewalAllowed && selectedReservation.renewalCount < maxRenewals ? (
                  <button
                    type="button"
                    className="secondary"
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
                    className="secondary"
                    onClick={async () => {
                      await cancelReservationFromMapAction(developmentId, selectedReservation.id);
                      setSelectedUnitId(null);
                    }}
                  >
                    Cancelar reserva
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {!exchangeMode &&
          (selectedUnit.status === "AVAILABLE" || selectedUnit.status === "RESERVED") &&
          canCreateReservation ? (
            <div style={{ marginTop: "0.75rem" }}>
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
            </div>
          ) : null}

          <button
            type="button"
            className="secondary"
            style={{ marginTop: "0.75rem" }}
            onClick={() => setSelectedUnitId(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

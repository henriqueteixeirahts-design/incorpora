"use client";

import { useActionState, useState } from "react";
import { upsertReservationRuleAction, type FormState } from "./actions";
import type { ReservationRuleValues } from "@/server/reservation-rules";

const initialState: FormState = {};

export function ReservationRuleForm({
  developmentId,
  rule,
  roles,
  canEdit,
}: {
  developmentId: string;
  rule: ReservationRuleValues;
  roles: string[];
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertReservationRuleAction, initialState);
  const [waitlistEnabled, setWaitlistEnabled] = useState(rule.waitlistEnabled);
  const [renewalAllowed, setRenewalAllowed] = useState(rule.renewalAllowed);

  if (!canEdit) {
    return (
      <div className="inc-card" style={{ marginTop: "18px", maxWidth: 680, padding: "18px 20px", fontSize: "13.5px" }}>
        <p>
          Prazo de validade: {rule.validityHours}h · Máx. reservas ativas/corretor:{" "}
          {rule.maxActiveReservationsPerBroker ?? "sem limite"} · Fila de espera:{" "}
          {rule.waitlistEnabled ? `ativa (${rule.waitlistPriorityHours}h de prioridade)` : "desativada"} ·
          Renovação: {rule.renewalAllowed ? `até ${rule.maxRenewals}x` : "não permitida"}
        </p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="inc-card" style={{ marginTop: "18px", maxWidth: 680, padding: "20px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Prazos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Prazo de validade da reserva (horas) *</span>
            <input name="validityHours" className="inc-input" type="number" min="1" step="1" required defaultValue={rule.validityHours} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Máximo de reservas ativas por corretor</span>
            <input
              name="maxActiveReservationsPerBroker"
              className="inc-input"
              type="number"
              min="1"
              step="1"
              placeholder="Sem limite"
              defaultValue={rule.maxActiveReservationsPerBroker ?? ""}
            />
          </label>
        </div>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Fila de espera</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
            <input
              type="checkbox"
              name="waitlistEnabled"
              checked={waitlistEnabled}
              onChange={(e) => setWaitlistEnabled(e.target.checked)}
            />
            Fila de espera ativa por unidade reservada
          </label>
          {waitlistEnabled ? (
            <label className="inc-field">
              <span className="inc-label">Prazo de prioridade da fila (horas) *</span>
              <input name="waitlistPriorityHours" className="inc-input" type="number" min="1" step="1" required defaultValue={rule.waitlistPriorityHours} />
            </label>
          ) : null}
        </div>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Renovação</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
            <input
              type="checkbox"
              name="renewalAllowed"
              checked={renewalAllowed}
              onChange={(e) => setRenewalAllowed(e.target.checked)}
            />
            Renovação de reserva permitida
          </label>
          {renewalAllowed ? (
            <label className="inc-field">
              <span className="inc-label">Máximo de renovações *</span>
              <input name="maxRenewals" className="inc-input" type="number" min="0" step="1" required defaultValue={rule.maxRenewals} />
            </label>
          ) : null}
        </div>
        {renewalAllowed ? (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", marginTop: "10px" }}>
            <input type="checkbox" name="requiresApprovalForRenewal" defaultChecked={rule.requiresApprovalForRenewal} />
            Exige aprovação do gerente comercial
          </label>
        ) : null}
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Quem pode reservar</div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
          <input type="checkbox" name="requireIdentifiedCustomer" defaultChecked={rule.requireIdentifiedCustomer} />
          Reserva exige cliente identificado (nome + CPF/CNPJ)
        </label>
        <p style={{ marginTop: "6px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
          Já é sempre exigido pelo cadastro de cliente — este campo é informativo.
        </p>

        <div style={{ marginTop: "12px" }}>
          <span className="inc-label">Papéis com permissão extra pra reservar (além da permissão geral)</span>
          {roles.length === 0 ? (
            <p style={{ marginTop: "6px", fontSize: "12px", color: "var(--inc-text-soft)" }}>Nenhum papel cadastrado.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {roles.map((role) => (
                <label key={role} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
                  <input
                    type="checkbox"
                    name="allowedReserverRoles"
                    value={role}
                    defaultChecked={rule.allowedReserverRoles.includes(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          )}
          <p style={{ marginTop: "6px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
            Deixe tudo desmarcado pra valer só a permissão geral do sistema (reservation.CREATE).
          </p>
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>Regras salvas.</p> : null}

      <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Salvando..." : "Salvar regras"}
      </button>
    </form>
  );
}

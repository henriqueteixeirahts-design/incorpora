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
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
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
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <h3>Prazos</h3>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="rr-validity">Prazo de validade da reserva (horas) *</label>
          <input
            id="rr-validity"
            name="validityHours"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={rule.validityHours}
          />
        </div>
        <div className="field">
          <label htmlFor="rr-max-broker">Máximo de reservas ativas por corretor</label>
          <input
            id="rr-max-broker"
            name="maxActiveReservationsPerBroker"
            type="number"
            min="1"
            step="1"
            placeholder="Sem limite"
            defaultValue={rule.maxActiveReservationsPerBroker ?? ""}
          />
        </div>
      </div>

      <h3 style={{ marginTop: "1rem" }}>Fila de espera</h3>
      <div className="field-grid">
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
            <input
              type="checkbox"
              name="waitlistEnabled"
              checked={waitlistEnabled}
              onChange={(e) => setWaitlistEnabled(e.target.checked)}
            />
            Fila de espera ativa por unidade reservada
          </label>
        </div>
        {waitlistEnabled ? (
          <div className="field">
            <label htmlFor="rr-priority">Prazo de prioridade da fila (horas) *</label>
            <input
              id="rr-priority"
              name="waitlistPriorityHours"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={rule.waitlistPriorityHours}
            />
          </div>
        ) : null}
      </div>

      <h3 style={{ marginTop: "1rem" }}>Renovação</h3>
      <div className="field-grid">
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
            <input
              type="checkbox"
              name="renewalAllowed"
              checked={renewalAllowed}
              onChange={(e) => setRenewalAllowed(e.target.checked)}
            />
            Renovação de reserva permitida
          </label>
        </div>
        {renewalAllowed ? (
          <>
            <div className="field">
              <label htmlFor="rr-max-renewals">Máximo de renovações *</label>
              <input
                id="rr-max-renewals"
                name="maxRenewals"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={rule.maxRenewals}
              />
            </div>
            <div className="field">
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  name="requiresApprovalForRenewal"
                  defaultChecked={rule.requiresApprovalForRenewal}
                />
                Exige aprovação do gerente comercial
              </label>
            </div>
          </>
        ) : null}
      </div>

      <h3 style={{ marginTop: "1rem" }}>Quem pode reservar</h3>
      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
          <input type="checkbox" name="requireIdentifiedCustomer" defaultChecked={rule.requireIdentifiedCustomer} />
          Reserva exige cliente identificado (nome + CPF/CNPJ)
        </label>
        <p className="field-hint" style={{ marginTop: "0.25rem" }}>
          Já é sempre exigido pelo cadastro de cliente — este campo é informativo.
        </p>
      </div>
      <div className="field" style={{ marginTop: "0.5rem" }}>
        <label>Papéis com permissão extra pra reservar (além da permissão geral)</label>
        {roles.length === 0 ? (
          <p className="field-hint">Nenhum papel cadastrado.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {roles.map((role) => (
              <label key={role} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
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
        <p className="field-hint" style={{ marginTop: "0.25rem" }}>
          Deixe tudo desmarcado pra valer só a permissão geral do sistema (reservation.CREATE).
        </p>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Regras salvas.</p> : null}

      <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? "Salvando..." : "Salvar regras"}
      </button>
    </form>
  );
}

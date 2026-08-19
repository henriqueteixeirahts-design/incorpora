"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createReservationAction, type FormState } from "./actions";

const initialState: FormState = {};

type Option = { id: string; label: string };

export function ReservationModal({
  developmentId,
  units,
  customers,
  brokers,
  agencies,
  salesTables,
  defaultValidityHours = 48,
}: {
  developmentId: string;
  units: Option[];
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
  defaultValidityHours?: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(createReservationAction, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      setOpen(false);
      submittedRef.current = false;
    }
  }, [pending, state.error]);

  return (
    <>
      <button type="button" className="inc-btn inc-btn--primary" onClick={() => setOpen(true)}>
        Nova reserva
      </button>

      {open ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel" style={{ width: 520, maxWidth: "95vw" }}>
            <div className="modal-header">
              <strong>Nova reserva</strong>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <form
              action={dispatch}
              onSubmit={() => {
                submittedRef.current = true;
              }}
            >
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <input type="hidden" name="developmentId" value={developmentId} />

                <label className="inc-field">
                  <span className="inc-label">Unidade *</span>
                  <select name="unitId" className="inc-select" required defaultValue="">
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {units.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inc-field">
                  <span className="inc-label">Cliente *</span>
                  <select name="customerId" className="inc-select" required defaultValue="">
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {customers.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="inc-field">
                    <span className="inc-label">Corretor</span>
                    <select name="brokerId" className="inc-select" defaultValue="">
                      <option value="">—</option>
                      {brokers.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Imobiliária</span>
                    <select name="agencyId" className="inc-select" defaultValue="">
                      <option value="">—</option>
                      {agencies.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="inc-field">
                    <span className="inc-label">Tabela de vendas</span>
                    <select name="salesTableId" className="inc-select" defaultValue="">
                      <option value="">—</option>
                      {salesTables.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Validade (horas)</span>
                    <input name="expiresInHours" className="inc-input" type="number" defaultValue={defaultValidityHours} min={1} />
                  </label>
                </div>

                <label className="inc-field">
                  <span className="inc-label">Observação</span>
                  <input name="reason" className="inc-input" />
                </label>

                {state.error ? <p className="error-text">{state.error}</p> : null}
                {state.message ? <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>{state.message}</p> : null}
              </div>

              <div className="modal-footer">
                <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
                  {pending ? "Salvando..." : "Criar reserva"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

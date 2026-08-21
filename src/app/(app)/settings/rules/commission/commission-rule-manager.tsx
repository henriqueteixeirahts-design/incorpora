"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { EditIcon } from "@/components/icons";
import { upsertCommissionRuleAction, type CommissionRuleFormState } from "./actions";

type RuleValues = {
  externalCommissionPercent: number | null;
  internalCommissionPercent: number | null;
  internalCommissionAppliesTo: "ALL_SALES" | "PARTICIPATED_ONLY";
};

export type OverrideRow = RuleValues & { id: string; developmentId: string; developmentName: string };
export type DevelopmentOption = { id: string; name: string };

const initialState: CommissionRuleFormState = {};

function RuleFields({ rule }: { rule: RuleValues }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
      <label className="inc-field">
        <span className="inc-label">Comissão externa (%)</span>
        <input
          name="externalCommissionPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="inc-input"
          defaultValue={rule.externalCommissionPercent ?? ""}
        />
      </label>
      <label className="inc-field">
        <span className="inc-label">Comissão interna (%)</span>
        <input
          name="internalCommissionPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          className="inc-input"
          defaultValue={rule.internalCommissionPercent ?? ""}
        />
      </label>
      <label className="inc-field">
        <span className="inc-label">Gerente interno recebe</span>
        <select name="internalCommissionAppliesTo" className="inc-select" defaultValue={rule.internalCommissionAppliesTo}>
          <option value="ALL_SALES">Em toda venda do empreendimento</option>
          <option value="PARTICIPATED_ONLY">Só nas vendas em que participou</option>
        </select>
      </label>
    </div>
  );
}

export function CommissionRuleManager({
  generalRule,
  overrides,
  developments,
  canEdit,
}: {
  generalRule: RuleValues;
  overrides: OverrideRow[];
  developments: DevelopmentOption[];
  canEdit: boolean;
}) {
  const generalFormRef = useRef<HTMLFormElement>(null);
  const [generalState, generalDispatch, generalPending] = useActionState(upsertCommissionRuleAction, initialState);

  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; override: OverrideRow } | null>(null);

  return (
    <>
      <form ref={generalFormRef} action={generalDispatch} style={{ marginTop: "20px" }}>
        <RuleFields rule={generalRule} />
        {generalState.error ? <p className="error-text" style={{ marginTop: "10px" }}>{generalState.error}</p> : null}
        {canEdit ? (
          <button type="submit" className="inc-btn inc-btn--primary" style={{ marginTop: "14px" }} disabled={generalPending}>
            {generalPending ? "Salvando..." : "Salvar regra geral"}
          </button>
        ) : null}
      </form>

      <div className="inc-eyebrow" style={{ marginTop: "28px", marginBottom: "8px" }}>
        Exceções por empreendimento
      </div>

      {canEdit && developments.length > 0 ? (
        <button type="button" className="inc-btn inc-btn--secondary" style={{ marginBottom: "12px" }} onClick={() => setModal({ mode: "create" })}>
          + Nova exceção
        </button>
      ) : null}

      {overrides.length === 0 ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>
          Nenhum empreendimento tem regra própria — todos usam a geral acima.
        </p>
      ) : (
        <div className="inc-card">
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th className="is-num">Externa</th>
                <th className="is-num">Interna</th>
                {canEdit ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.developmentName}</td>
                  <td className="is-num">{o.externalCommissionPercent ?? "—"}%</td>
                  <td className="is-num">{o.internalCommissionPercent ?? "—"}%</td>
                  {canEdit ? (
                    <td>
                      <button type="button" className="inc-btn-icon" aria-label={`Editar regra de ${o.developmentName}`} onClick={() => setModal({ mode: "edit", override: o })}>
                        <EditIcon />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <OverrideModal
          mode={modal.mode}
          override={modal.mode === "edit" ? modal.override : null}
          developments={developments}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function OverrideModal({
  mode,
  override,
  developments,
  onClose,
}: {
  mode: "create" | "edit";
  override: OverrideRow | null;
  developments: DevelopmentOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(upsertCommissionRuleAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const rule: RuleValues = override ?? { externalCommissionPercent: null, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES" };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar regra — ${override!.developmentName}` : "Nova exceção por empreendimento"}
      width={560}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>Fechar</button>
          <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "create" ? (
          <label className="inc-field" style={{ marginBottom: "14px" }}>
            <span className="inc-label">Empreendimento *</span>
            <select name="developmentId" className="inc-select" required defaultValue="">
              <option value="" disabled>Selecione...</option>
              {developments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="developmentId" value={override!.developmentId} />
        )}
        <RuleFields rule={rule} />
        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}

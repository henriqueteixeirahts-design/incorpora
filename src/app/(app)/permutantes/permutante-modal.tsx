"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { AddressFields } from "@/components/AddressFields";
import { formatDocument, formatPhone } from "@/lib/br-validation";
import { createPermutanteAction, updatePermutanteAction, type FormState } from "./actions";
import type { Permutante } from "@/generated/prisma/client";

const initialState: FormState = {};

export function PermutanteModal({
  mode,
  permutante,
  onClose,
  onSaved,
  onOpenDuplicate,
}: {
  mode: "create" | "edit";
  permutante: Permutante | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenDuplicate: (permutanteId: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">(permutante?.type ?? "INDIVIDUAL");
  const formAction = mode === "create" ? createPermutanteAction : updatePermutanteAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" && permutante ? `Editar permutante — ${permutante.name}` : "Novo permutante"}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            disabled={pending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && permutante ? (
          <input type="hidden" name="permutanteId" value={permutante.id} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
              <label className="inc-field">
                <span className="inc-label">Tipo *</span>
                <select
                  id="perm-type"
                  name="type"
                  className="inc-select"
                  defaultValue={permutante?.type ?? "INDIVIDUAL"}
                  onChange={(e) => {
                    const next = e.target.value as "INDIVIDUAL" | "COMPANY";
                    setType(next);
                    if (documentInputRef.current) {
                      documentInputRef.current.value = formatDocument(documentInputRef.current.value, next);
                    }
                  }}
                >
                  <option value="INDIVIDUAL">Pessoa física</option>
                  <option value="COMPANY">Pessoa jurídica</option>
                </select>
              </label>
              <label className="inc-field">
                <span className="inc-label">Nome / Razão social *</span>
                <input id="perm-name" name="name" className="inc-input" required defaultValue={permutante?.name ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</span>
                <input
                  id="perm-document"
                  name="document"
                  className="inc-input"
                  ref={documentInputRef}
                  required
                  defaultValue={permutante ? formatDocument(permutante.document, permutante.type) : ""}
                  onBlur={(e) => {
                    e.target.value = formatDocument(e.target.value, type);
                  }}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Contato</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <label className="inc-field">
                <span className="inc-label">E-mail</span>
                <input id="perm-email" name="email" type="email" className="inc-input" defaultValue={permutante?.email ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">Telefone</span>
                <input
                  id="perm-phone"
                  name="phone"
                  className="inc-input"
                  defaultValue={permutante?.phone ? formatPhone(permutante.phone) : ""}
                  onBlur={(e) => {
                    e.target.value = formatPhone(e.target.value);
                  }}
                />
              </label>
            </div>
          </div>

          <AddressFields defaultValues={permutante ?? undefined} />

          <div>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Observações</div>
            <label className="inc-field">
              <textarea id="perm-notes" name="notes" className="inc-input" rows={3} defaultValue={permutante?.notes ?? ""} />
            </label>
          </div>

          {state.error ? (
            <p className="error-text">
              {state.error}
              {state.duplicatePermutanteId ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="inc-btn inc-btn--secondary inc-btn--sm"
                    onClick={() => onOpenDuplicate(state.duplicatePermutanteId!)}
                  >
                    Abrir cadastro existente
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

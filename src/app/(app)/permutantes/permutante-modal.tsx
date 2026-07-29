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
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && permutante ? (
          <input type="hidden" name="permutanteId" value={permutante.id} />
        ) : null}

        <div className="field-section">
          <h3>Identificação</h3>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="perm-type">Tipo *</label>
              <select
                id="perm-type"
                name="type"
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
            </div>
            <div className="field">
              <label htmlFor="perm-name">Nome / Razão social *</label>
              <input id="perm-name" name="name" required defaultValue={permutante?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="perm-document">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</label>
              <input
                id="perm-document"
                name="document"
                ref={documentInputRef}
                required
                defaultValue={permutante ? formatDocument(permutante.document, permutante.type) : ""}
                onBlur={(e) => {
                  e.target.value = formatDocument(e.target.value, type);
                }}
              />
            </div>
          </div>
        </div>

        <div className="field-section">
          <h3>Contato</h3>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="perm-email">E-mail</label>
              <input id="perm-email" name="email" type="email" defaultValue={permutante?.email ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="perm-phone">Telefone</label>
              <input
                id="perm-phone"
                name="phone"
                defaultValue={permutante?.phone ? formatPhone(permutante.phone) : ""}
                onBlur={(e) => {
                  e.target.value = formatPhone(e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        <AddressFields defaultValues={permutante ?? undefined} />

        <div className="field-section">
          <h3>Observações</h3>
          <div className="field">
            <textarea id="perm-notes" name="notes" rows={3} defaultValue={permutante?.notes ?? ""} />
          </div>
        </div>

        {state.error ? (
          <p className="error-text">
            {state.error}
            {state.duplicatePermutanteId ? (
              <>
                {" "}
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  onClick={() => onOpenDuplicate(state.duplicatePermutanteId!)}
                >
                  Abrir cadastro existente
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import {
  updateDevelopmentDetailsAction,
  uploadDevelopmentDocumentAction,
  deleteDevelopmentDocumentAction,
  type FormState,
} from "./actions";
import { formatCalendarDateBR } from "@/lib/format";

const initialState: FormState = {};

const CATEGORY_LABELS: Record<string, string> = {
  PLAN: "Planta",
  MEMORIAL: "Memorial descritivo",
  REGISTRATION: "Matrícula",
  PERMIT_LICENSE: "Alvará/licença",
  AFFECTATION_DEED: "Termo de afetação",
  CONDOMINIUM_CONVENTION: "Convenção de condomínio",
  CONSTRUCTION_INSURANCE: "Seguro obra",
  CLEARANCE_CERTIFICATE: "Certidão negativa",
  OTHER: "Outro",
};

export type DevelopmentLegalData = {
  launchDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  registrationNumber: string | null;
  notaryOffice: string | null;
  registrationDate: string | null;
  motherPropertyRecord: string | null;
  hasPropertyAffectation: boolean;
  taxRegime: string | null;
  bankAccount: string | null;
  builderCompanyName: string | null;
  marketingAgencyName: string | null;
};

export type DevelopmentDocumentRow = {
  id: string;
  category: string;
  description: string | null;
  fileName: string;
  expiresAt: Date | null;
  signedUrl: string | null;
};

export function DevelopmentLegalForm({ developmentId, current }: { developmentId: string; current: DevelopmentLegalData }) {
  const [state, formAction, pending] = useActionState(updateDevelopmentDetailsAction, initialState);

  return (
    <form action={formAction} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", maxWidth: 780 }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <label>
        Lançamento
        <br />
        <input name="launchDate" type="date" defaultValue={current.launchDate ?? ""} />
      </label>
      <label>
        Entrega prevista
        <br />
        <input name="expectedDeliveryDate" type="date" defaultValue={current.expectedDeliveryDate ?? ""} />
      </label>
      <label>
        Entrega real
        <br />
        <input name="actualDeliveryDate" type="date" defaultValue={current.actualDeliveryDate ?? ""} />
      </label>

      <label>
        Nº do registro de incorporação
        <br />
        <input name="registrationNumber" defaultValue={current.registrationNumber ?? ""} />
      </label>
      <label>
        Cartório
        <br />
        <input name="notaryOffice" defaultValue={current.notaryOffice ?? ""} />
      </label>
      <label>
        Data do registro
        <br />
        <input name="registrationDate" type="date" defaultValue={current.registrationDate ?? ""} />
      </label>

      <label style={{ gridColumn: "1 / -1" }}>
        Matrícula-mãe
        <br />
        <input name="motherPropertyRecord" style={{ width: "100%" }} defaultValue={current.motherPropertyRecord ?? ""} />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input type="checkbox" name="hasPropertyAffectation" defaultChecked={current.hasPropertyAffectation} />
        Patrimônio de afetação
      </label>
      <label>
        Regime tributário
        <br />
        <input name="taxRegime" defaultValue={current.taxRegime ?? ""} />
      </label>
      <label>
        Conta bancária
        <br />
        <input name="bankAccount" defaultValue={current.bankAccount ?? ""} />
      </label>

      <label>
        Construtora
        <br />
        <input name="builderCompanyName" defaultValue={current.builderCompanyName ?? ""} />
      </label>
      <label>
        Agência de marketing
        <br />
        <input name="marketingAgencyName" defaultValue={current.marketingAgencyName ?? ""} />
      </label>

      {state.error ? <p className="error-text" style={{ gridColumn: "1 / -1" }}>{state.error}</p> : null}
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar registro e documentação"}
        </button>
      </div>
    </form>
  );
}

export function DevelopmentDocumentsSection({ developmentId, documents }: { developmentId: string; documents: DevelopmentDocumentRow[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const expiresAtRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("category", categoryRef.current?.value ?? "OTHER");
    formData.set("description", descriptionRef.current?.value ?? "");
    formData.set("expiresAt", expiresAtRef.current?.value ?? "");
    setBusy(true);
    const result = await uploadDevelopmentDocumentAction(developmentId, formData);
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (descriptionRef.current) descriptionRef.current.value = "";
      if (expiresAtRef.current) expiresAtRef.current.value = "";
    }
  }

  async function handleDelete(documentId: string) {
    if (!confirm("Remover este anexo?")) return;
    setError(null);
    const result = await deleteDevelopmentDocumentAction(developmentId, documentId);
    if (result.error) setError(result.error);
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <table style={{ maxWidth: 780 }}>
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Categoria</th>
            <th>Validade</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {documents.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                Nenhum anexo.
              </td>
            </tr>
          ) : null}
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                {doc.signedUrl ? (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                    {doc.fileName}
                  </a>
                ) : (
                  doc.fileName
                )}
              </td>
              <td>{CATEGORY_LABELS[doc.category] ?? doc.category}</td>
              <td>{doc.expiresAt ? formatCalendarDateBR(doc.expiresAt) : "—"}</td>
              <td>
                <button type="button" className="secondary" onClick={() => handleDelete(doc.id)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <select ref={categoryRef} defaultValue="OTHER">
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input ref={descriptionRef} placeholder="Observação (opcional)" />
        <label>
          Validade
          <input ref={expiresAtRef} type="date" />
        </label>
        <input ref={fileInputRef} type="file" />
        <button type="button" className="secondary" disabled={busy} onClick={handleUpload}>
          {busy ? "Enviando..." : "Anexar"}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import {
  createRenegotiationAction,
  decideRenegotiationApprovalAction,
  signRenegotiationAction,
  generateRenegotiationPdfAction,
  type RenegotiationFormState,
  type GenerateStatementState,
} from "./actions";

const createInitialState: RenegotiationFormState = {};
const generateInitialState: GenerateStatementState = {};

type Option = { id: string; label: string };

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho (assinável)",
  PENDING_APPROVAL: "Aguardando aprovação",
  SIGNED: "Assinado",
  BROKEN: "Quebrado",
  REJECTED: "Rejeitado",
};

const APPROVAL_LEVEL_LABELS: Record<string, string> = {
  COMMERCIAL: "Comercial",
  SALES_MANAGER: "Gerente comercial",
  DIRECTOR: "Diretor",
  FINANCIAL: "Financeiro",
  LEGAL: "Jurídico",
  PARTNERS: "Sócios",
};

export type RenegotiationApprovalRow = { level: string; decision: string; comment: string | null };
export type RenegotiationInstallmentRow = { id: string; label: string; dueDateLabel: string; originalValue: number; status: string };
export type RenegotiationDocumentRow = {
  id: string;
  fileName: string;
  uploadedByName: string;
  createdAtLabel: string;
  downloadUrl: string | null;
};

export type RenegotiationRow = {
  id: string;
  agreementNumber: string;
  status: string;
  agreementDateLabel: string;
  consolidatedPrincipal: number;
  consolidatedCharges: number;
  chargesDiscountPercent: number;
  chargesDiscountAmount: number;
  downPayment: number | null;
  finalValue: number;
  applyFutureCorrection: boolean;
  reason: string | null;
  brokenAtLabel: string | null;
  reactivatedOriginal: boolean;
  approvals: RenegotiationApprovalRow[];
  originInstallments: RenegotiationInstallmentRow[];
  destinationInstallments: RenegotiationInstallmentRow[];
  generatedDocuments: RenegotiationDocumentRow[];
};

export type OpenInstallmentOption = { id: string; label: string; dueDateLabel: string; resultValue: number };

function NewRenegotiationForm({
  customerId,
  contractId,
  openInstallments,
}: {
  customerId: string;
  contractId: string;
  openInstallments: OpenInstallmentOption[];
}) {
  const [state, formAction, pending] = useActionState(createRenegotiationAction, createInitialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (openInstallments.length === 0) {
    return <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Nenhuma parcela em aberto pra renegociar.</p>;
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 480 }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />

      <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Selecione as parcelas a renegociar</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {openInstallments.map((installment) => (
          <label key={installment.id} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              name="installmentIds"
              value={installment.id}
              checked={selected.has(installment.id)}
              onChange={() => toggle(installment.id)}
            />
            {installment.label} — vence {installment.dueDateLabel} — {formatCurrency(installment.resultValue)}
          </label>
        ))}
      </div>

      <label htmlFor="rn-date">Data do acordo</label>
      <input id="rn-date" name="agreementDate" type="date" required />

      <label htmlFor="rn-discount">Desconto sobre encargos (%)</label>
      <input id="rn-discount" name="chargesDiscountPercent" type="number" step="0.01" min="0" max="100" defaultValue={0} />

      <label htmlFor="rn-down">Entrada do acordo (opcional)</label>
      <input id="rn-down" name="downPayment" type="number" step="0.01" min="0" />

      <label htmlFor="rn-installments">Novo parcelamento — quantidade de parcelas</label>
      <input id="rn-installments" name="monthlyInstallments" type="number" min="1" required />

      <label htmlFor="rn-correction" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input id="rn-correction" name="applyFutureCorrection" type="checkbox" defaultChecked />
        Aplicar correção (índice/juros) nas novas parcelas
      </label>

      <label htmlFor="rn-reason">Motivo/observações</label>
      <textarea id="rn-reason" name="reason" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Acordo calculado — confira o demonstrativo antes de assinar.</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Calculando..." : "Montar acordo"}
      </button>
    </form>
  );
}

function ApprovalButtons({ customerId, agreementId, level }: { customerId: string; agreementId: string; level: string }) {
  return (
    <form action={decideRenegotiationApprovalAction} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="level" value={level} />
      <span style={{ fontSize: "0.8rem" }}>{APPROVAL_LEVEL_LABELS[level] ?? level}:</span>
      <button type="submit" name="decision" value="APPROVED">
        Aprovar
      </button>
      <button type="submit" name="decision" value="REJECTED" className="secondary">
        Rejeitar
      </button>
    </form>
  );
}

function SignRenegotiationButton({ customerId, agreementId }: { customerId: string; agreementId: string }) {
  return (
    <form action={signRenegotiationAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="agreementId" value={agreementId} />
      <button type="submit">Assinar acordo</button>
    </form>
  );
}

function GenerateRenegotiationDocumentForm({
  customerId,
  contractId,
  agreementId,
  templates,
}: {
  customerId: string;
  contractId: string;
  agreementId: string;
  templates: Option[];
}) {
  const [state, formAction, pending] = useActionState(generateRenegotiationPdfAction, generateInitialState);

  if (templates.length === 0) {
    return <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Nenhum modelo (aditivo/termo) ativo pra este empreendimento.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="agreementId" value={agreementId} />
      <select name="documentTemplateId" required defaultValue="">
        <option value="" disabled>
          Selecione o modelo...
        </option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? "Gerando..." : "Gerar documento"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.8rem", opacity: 0.8 }}>Documento gerado.</p> : null}
      {state.missing && state.missing.length > 0 ? (
        <p className="error-text" style={{ width: "100%" }}>
          Faltam dados pra gerar &quot;{state.missingTemplateName}&quot;: {state.missing.join(", ")}
        </p>
      ) : null}
    </form>
  );
}

function AgreementCard({
  customerId,
  contractId,
  agreement,
  templates,
  canEdit,
  canGenerateDocument,
}: {
  customerId: string;
  contractId: string;
  agreement: RenegotiationRow;
  templates: Option[];
  canEdit: boolean;
  canGenerateDocument: boolean;
}) {
  const pendingApprovals = agreement.approvals.filter((a) => a.decision === "PENDING");

  return (
    <div
      style={{
        border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
        borderRadius: 8,
        padding: "0.75rem 1rem",
        marginTop: "0.75rem",
      }}
    >
      <p>
        <strong>{agreement.agreementNumber}</strong> — {STATUS_LABELS[agreement.status] ?? agreement.status}
      </p>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Data do acordo: {agreement.agreementDateLabel}</p>

      <table style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
        <tbody>
          <tr>
            <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Principal consolidado</td>
            <td>{formatCurrency(agreement.consolidatedPrincipal)}</td>
          </tr>
          <tr>
            <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Encargos consolidados (multa+mora)</td>
            <td>{formatCurrency(agreement.consolidatedCharges)}</td>
          </tr>
          <tr>
            <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Desconto sobre encargos ({agreement.chargesDiscountPercent}%)</td>
            <td>-{formatCurrency(agreement.chargesDiscountAmount)}</td>
          </tr>
          {agreement.downPayment ? (
            <tr>
              <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Entrada do acordo</td>
              <td>-{formatCurrency(agreement.downPayment)}</td>
            </tr>
          ) : null}
          <tr>
            <td style={{ fontWeight: 500, paddingRight: "1rem" }}>Valor final renegociado</td>
            <td style={{ fontWeight: 500 }}>{formatCurrency(agreement.finalValue)}</td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: "0.4rem" }}>
        Correção futura: {agreement.applyFutureCorrection ? "aplica índice/juros" : "sem correção — só nominal"}
      </p>
      {agreement.reason ? <p style={{ fontSize: "0.85rem" }}>{agreement.reason}</p> : null}

      {agreement.originInstallments.length > 0 ? (
        <details style={{ marginTop: "0.5rem" }}>
          <summary style={{ fontSize: "0.85rem", cursor: "pointer" }}>Parcelas de origem (renegociadas)</summary>
          <ul style={{ paddingLeft: "1.1rem", marginTop: "0.4rem", fontSize: "0.8rem" }}>
            {agreement.originInstallments.map((i) => (
              <li key={i.id}>
                {i.label} — venceria {i.dueDateLabel} — {formatCurrency(i.originalValue)} — {i.status === "CANCELLED" ? "Renegociada" : i.status}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {agreement.destinationInstallments.length > 0 ? (
        <details style={{ marginTop: "0.4rem" }}>
          <summary style={{ fontSize: "0.85rem", cursor: "pointer" }}>Novas parcelas do acordo</summary>
          <ul style={{ paddingLeft: "1.1rem", marginTop: "0.4rem", fontSize: "0.8rem" }}>
            {agreement.destinationInstallments.map((i) => (
              <li key={i.id}>
                {i.label} — {i.dueDateLabel} — {formatCurrency(i.originalValue)} — {i.status}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {agreement.status === "BROKEN" ? (
        <p className="error-text" style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
          Acordo quebrado em {agreement.brokenAtLabel} —{" "}
          {agreement.reactivatedOriginal ? "condições originais reativadas." : "condições originais não reativadas."}
        </p>
      ) : null}

      {agreement.status === "PENDING_APPROVAL" && canEdit ? (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {pendingApprovals.map((a) => (
            <ApprovalButtons key={a.level} customerId={customerId} agreementId={agreement.id} level={a.level} />
          ))}
        </div>
      ) : null}

      {agreement.status === "DRAFT" && canEdit ? (
        <div style={{ marginTop: "0.5rem" }}>
          <SignRenegotiationButton customerId={customerId} agreementId={agreement.id} />
        </div>
      ) : null}

      {canGenerateDocument ? (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>Gerar documento</p>
          <GenerateRenegotiationDocumentForm customerId={customerId} contractId={contractId} agreementId={agreement.id} templates={templates} />
        </div>
      ) : null}

      {agreement.generatedDocuments.length > 0 ? (
        <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
          {agreement.generatedDocuments.map((doc) => (
            <li key={doc.id}>
              {doc.fileName} — {doc.uploadedByName} em {doc.createdAtLabel}
              {doc.downloadUrl ? (
                <>
                  {" "}
                  —{" "}
                  <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
                    Baixar
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RenegotiationSection({
  customerId,
  contractId,
  agreements,
  openInstallments,
  templates,
  canEdit,
  canGenerateDocument,
}: {
  customerId: string;
  contractId: string;
  agreements: RenegotiationRow[];
  openInstallments: OpenInstallmentOption[];
  templates: Option[];
  canEdit: boolean;
  canGenerateDocument: boolean;
}) {
  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h3 style={{ fontSize: "1rem" }}>Renegociação de parcelas</h3>
      <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 560 }}>
        Acordo sobre dívida vencida/a vencer já existente — desconto sobre encargos (multa/mora, nunca sobre o
        principal) e novo parcelamento. Diferente do aditivo (que redesenha o fluxo futuro inteiro).
      </p>

      {agreements.length > 0 ? (
        <div>
          {agreements.map((agreement) => (
            <AgreementCard
              key={agreement.id}
              customerId={customerId}
              contractId={contractId}
              agreement={agreement}
              templates={templates}
              canEdit={canEdit}
              canGenerateDocument={canGenerateDocument}
            />
          ))}
        </div>
      ) : (
        <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.5rem" }}>Nenhum acordo criado ainda.</p>
      )}

      {canEdit ? (
        <div style={{ marginTop: "1rem" }}>
          <NewRenegotiationForm customerId={customerId} contractId={contractId} openInstallments={openInstallments} />
        </div>
      ) : null}
    </div>
  );
}

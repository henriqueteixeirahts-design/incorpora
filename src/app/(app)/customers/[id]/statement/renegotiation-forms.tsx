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

const STATUS_CHIP_CLASSES: Record<string, string> = {
  DRAFT: "inc-chip inc-chip--proposta",
  PENDING_APPROVAL: "inc-chip inc-chip--reserva",
  SIGNED: "inc-chip inc-chip--contrato",
  BROKEN: "inc-chip inc-chip--atraso",
  REJECTED: "inc-chip inc-chip--atraso",
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
    return <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>Nenhuma parcela em aberto pra renegociar.</p>;
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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: 480 }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />

      <span className="inc-label">Selecione as parcelas a renegociar</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {openInstallments.map((installment) => (
          <label key={installment.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "var(--inc-fs-sm)" }}>
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

      <label className="inc-field" htmlFor="rn-date">
        <span className="inc-label">Data do acordo</span>
        <input id="rn-date" className="inc-input" name="agreementDate" type="date" required />
      </label>

      <label className="inc-field" htmlFor="rn-discount">
        <span className="inc-label">Desconto sobre encargos (%)</span>
        <input id="rn-discount" className="inc-input" name="chargesDiscountPercent" type="number" step="0.01" min="0" max="100" defaultValue={0} />
      </label>

      <label className="inc-field" htmlFor="rn-down">
        <span className="inc-label">Entrada do acordo (opcional)</span>
        <input id="rn-down" className="inc-input" name="downPayment" type="number" step="0.01" min="0" />
      </label>

      <label className="inc-field" htmlFor="rn-installments">
        <span className="inc-label">Novo parcelamento — quantidade de parcelas</span>
        <input id="rn-installments" className="inc-input" name="monthlyInstallments" type="number" min="1" required />
      </label>

      <label htmlFor="rn-correction" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--inc-fs-sm)" }}>
        <input id="rn-correction" name="applyFutureCorrection" type="checkbox" defaultChecked />
        Aplicar correção (índice/juros) nas novas parcelas
      </label>

      <label className="inc-field" htmlFor="rn-reason">
        <span className="inc-label">Motivo/observações</span>
        <textarea id="rn-reason" className="inc-input" name="reason" rows={2} style={{ height: "auto", padding: "8px 12px" }} />
      </label>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)" }}>
          Acordo calculado — confira o demonstrativo antes de assinar.
        </p>
      ) : null}

      <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Calculando..." : "Montar acordo"}
      </button>
    </form>
  );
}

function ApprovalButtons({ customerId, agreementId, level }: { customerId: string; agreementId: string; level: string }) {
  return (
    <form action={decideRenegotiationApprovalAction} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="level" value={level} />
      <span style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>{APPROVAL_LEVEL_LABELS[level] ?? level}:</span>
      <button type="submit" name="decision" value="APPROVED" className="inc-btn inc-btn--primary inc-btn--sm">
        Aprovar
      </button>
      <button type="submit" name="decision" value="REJECTED" className="inc-btn inc-btn--danger inc-btn--sm">
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
      <button type="submit" className="inc-btn inc-btn--primary inc-btn--sm">
        Assinar acordo
      </button>
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
    return <p style={{ fontSize: "var(--inc-fs-xs)", color: "var(--inc-text-muted)" }}>Nenhum modelo (aditivo/termo) ativo pra este empreendimento.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="agreementId" value={agreementId} />
      <select className="inc-select" name="documentTemplateId" required defaultValue="">
        <option value="" disabled>
          Selecione o modelo...
        </option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm" disabled={pending}>
        {pending ? "Gerando..." : "Gerar documento"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "var(--inc-fs-xs)", color: "var(--inc-text-secondary)" }}>Documento gerado.</p> : null}
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
    <div className="inc-card" style={{ marginTop: "12px" }}>
      <div className="inc-card__head">
        <div>
          <div className="inc-card__title">{agreement.agreementNumber}</div>
          <div className="inc-card__meta" style={{ marginLeft: 0 }}>Data do acordo: {agreement.agreementDateLabel}</div>
        </div>
        <span className={STATUS_CHIP_CLASSES[agreement.status] ?? "inc-chip inc-chip--permuta"} style={{ marginLeft: "auto" }}>
          {STATUS_LABELS[agreement.status] ?? agreement.status}
        </span>
      </div>

      <div className="inc-card__body">
        <table className="inc-table" style={{ border: 0 }}>
          <tbody>
            <tr>
              <td className="is-muted">Principal consolidado</td>
              <td className="is-num">{formatCurrency(agreement.consolidatedPrincipal)}</td>
            </tr>
            <tr>
              <td className="is-muted">Encargos consolidados (multa+mora)</td>
              <td className="is-num">{formatCurrency(agreement.consolidatedCharges)}</td>
            </tr>
            <tr>
              <td className="is-muted">Desconto sobre encargos ({agreement.chargesDiscountPercent}%)</td>
              <td className="is-num">-{formatCurrency(agreement.chargesDiscountAmount)}</td>
            </tr>
            {agreement.downPayment ? (
              <tr>
                <td className="is-muted">Entrada do acordo</td>
                <td className="is-num">-{formatCurrency(agreement.downPayment)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="is-strong">Valor final renegociado</td>
              <td className="is-num is-strong">{formatCurrency(agreement.finalValue)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)", marginTop: "10px" }}>
          Correção futura: {agreement.applyFutureCorrection ? "aplica índice/juros" : "sem correção — só nominal"}
        </p>
        {agreement.reason ? <p style={{ fontSize: "var(--inc-fs-sm)" }}>{agreement.reason}</p> : null}

        {agreement.originInstallments.length > 0 ? (
          <details style={{ marginTop: "10px" }}>
            <summary style={{ fontSize: "var(--inc-fs-sm)", cursor: "pointer", color: "var(--inc-brand-azul)" }}>
              Parcelas de origem (renegociadas)
            </summary>
            <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "var(--inc-fs-xs)", color: "var(--inc-text-secondary)" }}>
              {agreement.originInstallments.map((i) => (
                <li key={i.id}>
                  {i.label} — venceria {i.dueDateLabel} — {formatCurrency(i.originalValue)} — {i.status === "CANCELLED" ? "Renegociada" : i.status}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {agreement.destinationInstallments.length > 0 ? (
          <details style={{ marginTop: "8px" }}>
            <summary style={{ fontSize: "var(--inc-fs-sm)", cursor: "pointer", color: "var(--inc-brand-azul)" }}>
              Novas parcelas do acordo
            </summary>
            <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "var(--inc-fs-xs)", color: "var(--inc-text-secondary)" }}>
              {agreement.destinationInstallments.map((i) => (
                <li key={i.id}>
                  {i.label} — {i.dueDateLabel} — {formatCurrency(i.originalValue)} — {i.status}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {agreement.status === "BROKEN" ? (
          <p className="error-text" style={{ fontSize: "var(--inc-fs-sm)", marginTop: "8px" }}>
            Acordo quebrado em {agreement.brokenAtLabel} —{" "}
            {agreement.reactivatedOriginal ? "condições originais reativadas." : "condições originais não reativadas."}
          </p>
        ) : null}

        {agreement.status === "PENDING_APPROVAL" && canEdit ? (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {pendingApprovals.map((a) => (
              <ApprovalButtons key={a.level} customerId={customerId} agreementId={agreement.id} level={a.level} />
            ))}
          </div>
        ) : null}

        {agreement.status === "DRAFT" && canEdit ? (
          <div style={{ marginTop: "10px" }}>
            <SignRenegotiationButton customerId={customerId} agreementId={agreement.id} />
          </div>
        ) : null}

        {canGenerateDocument ? (
          <div style={{ marginTop: "10px" }}>
            <div className="inc-label" style={{ marginBottom: "6px" }}>Gerar documento</div>
            <GenerateRenegotiationDocumentForm customerId={customerId} contractId={contractId} agreementId={agreement.id} templates={templates} />
          </div>
        ) : null}

        {agreement.generatedDocuments.length > 0 ? (
          <ul style={{ paddingLeft: "18px", marginTop: "10px", fontSize: "var(--inc-fs-xs)", color: "var(--inc-text-secondary)" }}>
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
    <div style={{ marginTop: "20px" }}>
      <div className="inc-eyebrow">Renegociação de parcelas</div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 560, marginTop: "4px" }}>
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
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", marginTop: "8px" }}>Nenhum acordo criado ainda.</p>
      )}

      {canEdit ? (
        <div className="inc-card" style={{ marginTop: "14px" }}>
          <div className="inc-card__head">
            <div className="inc-card__title">Novo acordo de renegociação</div>
          </div>
          <div className="inc-card__body">
            <NewRenegotiationForm customerId={customerId} contractId={contractId} openInstallments={openInstallments} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

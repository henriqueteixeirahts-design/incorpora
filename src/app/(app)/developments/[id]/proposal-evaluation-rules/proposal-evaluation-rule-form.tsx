"use client";

import { useActionState } from "react";
import { upsertProposalEvaluationRuleAction, type FormState } from "./actions";
import type { ApprovalLevel } from "@/generated/prisma/client";

const initialState: FormState = {};

const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> = {
  COMMERCIAL: "Comercial",
  SALES_MANAGER: "Gerente comercial",
  DIRECTOR: "Diretor",
  FINANCIAL: "Financeiro",
  LEGAL: "Jurídico",
  PARTNERS: "Sócios",
};

const ALL_LEVELS: ApprovalLevel[] = ["COMMERCIAL", "SALES_MANAGER", "DIRECTOR", "FINANCIAL", "LEGAL", "PARTNERS"];

export function ProposalEvaluationRuleForm({
  developmentId,
  rule,
  canEdit,
}: {
  developmentId: string;
  rule: {
    allowOffTable: boolean;
    discountRatePercent: number;
    discountRatePeriod: string;
    vplTolerancePercent: number;
    vplAnalysisLimitPercent: number;
    minDownPaymentPercent: number;
    maxTermMonths: number;
    maxPostKeysPercent: number;
    analysisApprovalLevels: ApprovalLevel[];
  };
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertProposalEvaluationRuleAction, initialState);

  if (!canEdit) {
    return (
      <div className="inc-card" style={{ marginTop: "18px", maxWidth: 680, padding: "18px 20px", fontSize: "13.5px" }}>
        <p>
          Taxa de desconto: {rule.discountRatePercent}% {rule.discountRatePeriod === "MONTHLY" ? "a.m." : "a.a."} ·
          Tolerância: {rule.vplTolerancePercent}% · Limite de deságio: {rule.vplAnalysisLimitPercent}% · Entrada
          mínima: {rule.minDownPaymentPercent}% · Prazo máximo: {rule.maxTermMonths} meses · Pós-chaves máximo:{" "}
          {rule.maxPostKeysPercent}% · Fora de tabela: {rule.allowOffTable ? "permitido" : "não permitido"}
        </p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="inc-card" style={{ marginTop: "18px", maxWidth: 680, padding: "20px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Aceite fora da tabela</div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
          <input type="checkbox" name="allowOffTable" defaultChecked={rule.allowOffTable} />
          Aceita proposta com fluxo diferente da tabela padrão
        </label>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Taxa de desconto (TMA)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Taxa (%) *</span>
            <input
              name="discountRatePercent"
              className="inc-input"
              type="number"
              step="0.001"
              min="0"
              required
              defaultValue={rule.discountRatePercent}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Periodicidade</span>
            <select name="discountRatePeriod" className="inc-select" defaultValue={rule.discountRatePeriod}>
              <option value="MONTHLY">% ao mês</option>
              <option value="YEARLY">% ao ano</option>
            </select>
          </label>
        </div>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Faixas de VPL</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Tolerância pra aprovação automática (%) *</span>
            <input
              name="vplTolerancePercent"
              className="inc-input"
              type="number"
              step="0.001"
              min="0"
              required
              defaultValue={rule.vplTolerancePercent}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Limite de deságio pra análise (%) *</span>
            <input
              name="vplAnalysisLimitPercent"
              className="inc-input"
              type="number"
              step="0.001"
              min="0"
              required
              defaultValue={rule.vplAnalysisLimitPercent}
            />
          </label>
        </div>
        <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
          Dentro da tolerância → aprova sozinha. Entre a tolerância e o limite → vai pro gestor analisar. Acima do
          limite → reprovada automaticamente.
        </p>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Limites duros</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Entrada mínima (%) *</span>
            <input
              name="minDownPaymentPercent"
              className="inc-input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              defaultValue={rule.minDownPaymentPercent}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Prazo máximo total (meses) *</span>
            <input
              name="maxTermMonths"
              className="inc-input"
              type="number"
              step="1"
              min="1"
              required
              defaultValue={rule.maxTermMonths}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">% máximo pós-chaves *</span>
            <input
              name="maxPostKeysPercent"
              className="inc-input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              defaultValue={rule.maxPostKeysPercent}
            />
          </label>
        </div>
      </div>

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Quem analisa propostas pendentes</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {ALL_LEVELS.map((level) => (
            <label key={level} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
              <input
                type="checkbox"
                name="analysisApprovalLevels"
                value={level}
                defaultChecked={rule.analysisApprovalLevels.includes(level)}
              />
              {APPROVAL_LEVEL_LABELS[level]}
            </label>
          ))}
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

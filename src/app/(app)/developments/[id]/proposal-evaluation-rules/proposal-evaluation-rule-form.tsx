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
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
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
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 640 }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <h3>Aceite fora da tabela</h3>
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
        <input type="checkbox" name="allowOffTable" defaultChecked={rule.allowOffTable} />
        Aceita proposta com fluxo diferente da tabela padrão
      </label>

      <h3 style={{ marginTop: "1rem" }}>Taxa de desconto (TMA)</h3>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="per-rate">Taxa (%) *</label>
          <input
            id="per-rate"
            name="discountRatePercent"
            type="number"
            step="0.001"
            min="0"
            required
            defaultValue={rule.discountRatePercent}
          />
        </div>
        <div className="field">
          <label htmlFor="per-period">Periodicidade</label>
          <select id="per-period" name="discountRatePeriod" defaultValue={rule.discountRatePeriod}>
            <option value="MONTHLY">% ao mês</option>
            <option value="YEARLY">% ao ano</option>
          </select>
        </div>
      </div>

      <h3 style={{ marginTop: "1rem" }}>Faixas de VPL</h3>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="per-tolerance">Tolerância pra aprovação automática (%) *</label>
          <input
            id="per-tolerance"
            name="vplTolerancePercent"
            type="number"
            step="0.001"
            min="0"
            required
            defaultValue={rule.vplTolerancePercent}
          />
        </div>
        <div className="field">
          <label htmlFor="per-limit">Limite de deságio pra análise (%) *</label>
          <input
            id="per-limit"
            name="vplAnalysisLimitPercent"
            type="number"
            step="0.001"
            min="0"
            required
            defaultValue={rule.vplAnalysisLimitPercent}
          />
        </div>
      </div>
      <p className="field-hint">
        Dentro da tolerância → aprova sozinha. Entre a tolerância e o limite → vai pro gestor analisar. Acima do
        limite → reprovada automaticamente.
      </p>

      <h3 style={{ marginTop: "1rem" }}>Limites duros</h3>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="per-min-down">Entrada mínima (%) *</label>
          <input
            id="per-min-down"
            name="minDownPaymentPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            defaultValue={rule.minDownPaymentPercent}
          />
        </div>
        <div className="field">
          <label htmlFor="per-max-term">Prazo máximo total (meses) *</label>
          <input
            id="per-max-term"
            name="maxTermMonths"
            type="number"
            step="1"
            min="1"
            required
            defaultValue={rule.maxTermMonths}
          />
        </div>
        <div className="field">
          <label htmlFor="per-max-postkeys">% máximo pós-chaves *</label>
          <input
            id="per-max-postkeys"
            name="maxPostKeysPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            defaultValue={rule.maxPostKeysPercent}
          />
        </div>
      </div>

      <h3 style={{ marginTop: "1rem" }}>Quem analisa propostas pendentes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {ALL_LEVELS.map((level) => (
          <label key={level} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
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

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Regras salvas.</p> : null}

      <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? "Salvando..." : "Salvar regras"}
      </button>
    </form>
  );
}

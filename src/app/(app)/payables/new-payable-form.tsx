"use client";

import { useActionState } from "react";
import { createPayableAction, type FormState } from "./actions";

const initialState: FormState = {};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "CONSTRUCTION", label: "Construtora" },
  { value: "LAND", label: "Terreno" },
  { value: "PROJECTS", label: "Projetos" },
  { value: "APPROVALS", label: "Aprovações" },
  { value: "NOTARY", label: "Cartório" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AGENCY", label: "Agência" },
  { value: "MEDIA", label: "Mídia" },
  { value: "SALES_BOOTH", label: "Estande de vendas" },
  { value: "SALES_BOOTH_MAINTENANCE", label: "Manutenção do estande" },
  { value: "SALES_TEAM", label: "Equipe comercial" },
  { value: "BROKERAGE", label: "Corretagem" },
  { value: "FEES", label: "Taxas" },
  { value: "TAXES", label: "Impostos" },
  { value: "LEGAL", label: "Jurídico" },
  { value: "ACCOUNTING", label: "Contabilidade" },
  { value: "INSURANCE", label: "Seguros" },
  { value: "BANK_FEES", label: "Despesas bancárias" },
  { value: "UTILITIES", label: "Concessionárias" },
  { value: "ADMINISTRATION", label: "Administração" },
  { value: "CANCELLATION_REFUND", label: "Devolução de distrato" },
  { value: "OTHER", label: "Despesas diversas" },
];

type Option = { id: string; label: string };

export function NewPayableForm({
  developments,
  spes,
  suppliers,
  costCenters,
}: {
  developments: Option[];
  spes: Option[];
  suppliers: Option[];
  costCenters: Option[];
}) {
  const [state, formAction, pending] = useActionState(createPayableAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 380 }}
    >
      <label htmlFor="description">Descrição</label>
      <input id="description" name="description" required />

      <label htmlFor="category">Categoria</label>
      <select id="category" name="category" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="developmentId">Empreendimento</label>
      <select id="developmentId" name="developmentId" defaultValue="">
        <option value="">Organização (nenhum específico)</option>
        {developments.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="speId">SPE</label>
      <select id="speId" name="speId" defaultValue="">
        <option value="">—</option>
        {spes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="supplierId">Fornecedor</label>
      <select id="supplierId" name="supplierId" defaultValue="">
        <option value="">—</option>
        {suppliers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="costCenterId">Centro de custo</label>
      <select id="costCenterId" name="costCenterId" defaultValue="">
        <option value="">—</option>
        {costCenters.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="competenceDate">Competência</label>
          <input id="competenceDate" name="competenceDate" type="date" required />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="dueDate">Vencimento</label>
          <input id="dueDate" name="dueDate" type="date" required />
        </div>
      </div>

      <label htmlFor="amount">Valor (R$)</label>
      <input id="amount" name="amount" type="number" step="0.01" required />

      <label htmlFor="paymentMethod">Forma de pagamento</label>
      <input id="paymentMethod" name="paymentMethod" placeholder="PIX, boleto, TED..." />

      <label htmlFor="fiscalDocument">Documento fiscal</label>
      <input id="fiscalDocument" name="fiscalDocument" placeholder="Número da nota fiscal" />

      <label htmlFor="notes">Observações</label>
      <textarea id="notes" name="notes" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Lançar conta a pagar"}
      </button>
    </form>
  );
}

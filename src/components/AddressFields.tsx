"use client";

import { useRef, useState } from "react";
import { formatCep } from "@/lib/br-validation";

export type AddressDefaultValues = {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

/**
 * Seção de endereço reutilizável: CEP (com autocompletar via ViaCEP) +
 * Logradouro/Número/Complemento/Bairro/Cidade/UF. Os nomes dos campos
 * (name=) são fixos (zipCode, street, number, complement, neighborhood,
 * city, state) para casar com o padrão já usado em Clientes — quem usa
 * este componente só precisa ler esses names do FormData do formulário
 * onde ele estiver.
 */
export function AddressFields({
  defaultValues,
  legacyNote,
  idPrefix = "",
  numberRequired = false,
}: {
  defaultValues?: AddressDefaultValues;
  legacyNote?: string | null;
  /** Prefixo para os ids/htmlFor dos campos — necessário quando mais de um AddressFields pode estar montado ao mesmo tempo na página (ids duplicados quebram getElementById e a associação label/input). O name= dos campos no FormData continua fixo (zipCode, street...). */
  idPrefix?: string;
  /** Exige "Número" (docs/RELATORIO_TESTDRIVE.md, achado 4) — endereço sem número é incompleto pra contrato. Default false pra não afetar usos onde o endereço inteiro é opcional (SPE/terreno/permutante). */
  numberRequired?: boolean;
}) {
  const cepInputRef = useRef<HTMLInputElement>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const neighborhoodInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);

  async function handleCepBlur() {
    const cep = (cepInputRef.current?.value ?? "").replace(/\D/g, "");
    if (cepInputRef.current) cepInputRef.current.value = formatCep(cep);
    if (cep.length !== 8) return;

    setCepStatus("Buscando...");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) {
        setCepStatus("CEP não encontrado — preencha o endereço manualmente.");
        return;
      }
      if (streetInputRef.current) streetInputRef.current.value = data.logradouro ?? "";
      if (neighborhoodInputRef.current) neighborhoodInputRef.current.value = data.bairro ?? "";
      if (cityInputRef.current) cityInputRef.current.value = data.localidade ?? "";
      if (stateInputRef.current) stateInputRef.current.value = data.uf ?? "";
      setCepStatus(null);
    } catch {
      setCepStatus("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
    }
  }

  return (
    <div>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Endereço</div>
      {legacyNote ? <p style={{ fontSize: "12px", color: "var(--inc-text-soft)", marginBottom: "8px" }}>{legacyNote}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">CEP</span>
          <input
            id={`${idPrefix}zipCode`}
            name="zipCode"
            className="inc-input"
            ref={cepInputRef}
            placeholder="00000-000"
            defaultValue={defaultValues?.zipCode ? formatCep(defaultValues.zipCode) : ""}
            onBlur={handleCepBlur}
          />
          {cepStatus ? <span style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>{cepStatus}</span> : null}
        </label>
        <label className="inc-field" style={{ gridColumn: "span 2" }}>
          <span className="inc-label">Logradouro</span>
          <input id={`${idPrefix}street`} name="street" className="inc-input" ref={streetInputRef} defaultValue={defaultValues?.street ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Número{numberRequired ? " *" : ""}</span>
          <input
            id={`${idPrefix}number`}
            name="number"
            className="inc-input"
            required={numberRequired}
            defaultValue={defaultValues?.number ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Complemento</span>
          <input id={`${idPrefix}complement`} name="complement" className="inc-input" defaultValue={defaultValues?.complement ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Bairro</span>
          <input
            id={`${idPrefix}neighborhood`}
            name="neighborhood"
            className="inc-input"
            ref={neighborhoodInputRef}
            defaultValue={defaultValues?.neighborhood ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Cidade</span>
          <input id={`${idPrefix}city`} name="city" className="inc-input" ref={cityInputRef} defaultValue={defaultValues?.city ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">UF</span>
          <input
            id={`${idPrefix}state`}
            name="state"
            className="inc-input"
            ref={stateInputRef}
            maxLength={2}
            style={{ textTransform: "uppercase" }}
            defaultValue={defaultValues?.state ?? ""}
          />
        </label>
      </div>
    </div>
  );
}

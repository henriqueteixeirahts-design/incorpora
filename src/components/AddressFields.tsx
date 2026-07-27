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
}: {
  defaultValues?: AddressDefaultValues;
  legacyNote?: string | null;
  /** Prefixo para os ids/htmlFor dos campos — necessário quando mais de um AddressFields pode estar montado ao mesmo tempo na página (ids duplicados quebram getElementById e a associação label/input). O name= dos campos no FormData continua fixo (zipCode, street...). */
  idPrefix?: string;
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
      if (streetInputRef.current && !streetInputRef.current.value) streetInputRef.current.value = data.logradouro ?? "";
      if (neighborhoodInputRef.current) neighborhoodInputRef.current.value = data.bairro ?? "";
      if (cityInputRef.current) cityInputRef.current.value = data.localidade ?? "";
      if (stateInputRef.current) stateInputRef.current.value = data.uf ?? "";
      setCepStatus(null);
    } catch {
      setCepStatus("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
    }
  }

  return (
    <div className="field-section">
      <h3>Endereço</h3>
      {legacyNote ? <p className="field-hint">{legacyNote}</p> : null}
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}zipCode`}>CEP</label>
          <input
            id={`${idPrefix}zipCode`}
            name="zipCode"
            ref={cepInputRef}
            placeholder="00000-000"
            defaultValue={defaultValues?.zipCode ? formatCep(defaultValues.zipCode) : ""}
            onBlur={handleCepBlur}
          />
          {cepStatus ? <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>{cepStatus}</span> : null}
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor={`${idPrefix}street`}>Logradouro</label>
          <input id={`${idPrefix}street`} name="street" ref={streetInputRef} defaultValue={defaultValues?.street ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}number`}>Número</label>
          <input id={`${idPrefix}number`} name="number" defaultValue={defaultValues?.number ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}complement`}>Complemento</label>
          <input id={`${idPrefix}complement`} name="complement" defaultValue={defaultValues?.complement ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}neighborhood`}>Bairro</label>
          <input
            id={`${idPrefix}neighborhood`}
            name="neighborhood"
            ref={neighborhoodInputRef}
            defaultValue={defaultValues?.neighborhood ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}city`}>Cidade</label>
          <input id={`${idPrefix}city`} name="city" ref={cityInputRef} defaultValue={defaultValues?.city ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}state`}>UF</label>
          <input
            id={`${idPrefix}state`}
            name="state"
            ref={stateInputRef}
            maxLength={2}
            style={{ textTransform: "uppercase" }}
            defaultValue={defaultValues?.state ?? ""}
          />
        </div>
      </div>
    </div>
  );
}

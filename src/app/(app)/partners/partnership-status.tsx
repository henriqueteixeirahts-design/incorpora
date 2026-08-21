"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { formatDateTimeBR } from "@/lib/format";
import { getPartnershipStatusAction, signPartnershipAction, revokePartnershipAction } from "./actions";

type Status = { status: "DRAFT" | "SIGNED"; agreementId: string; signedAt: Date | null } | null;

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5 — status da parceria +
 * upload do documento assinado. Carrega sob demanda quando o modal de
 * edição do corretor/imobiliária abre (mesmo padrão do editor de split).
 */
export function PartnershipStatus({ partnerType, id }: { partnerType: "AGENCY" | "AUTONOMOUS_BROKER"; id: string }) {
  const [state, setState] = useState<Status | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPartnershipStatusAction(partnerType, id).then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setState({ status: result.status, agreementId: result.agreementId, signedAt: result.signedAt });
    });
    return () => {
      cancelled = true;
    };
  }, [partnerType, id]);

  function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || state === "loading" || !state) return;
    const formData = new FormData();
    formData.set("file", files[0]);
    setError(null);
    startTransition(async () => {
      const result = await signPartnershipAction(state.agreementId, formData);
      if (result.error) setError(result.error);
      else setState({ ...state, status: "SIGNED", signedAt: new Date() });
    });
  }

  function handleRevoke() {
    if (state === "loading" || !state) return;
    if (!confirm("Reverter esta parceria pra rascunho (remove o documento assinado)?")) return;
    setError(null);
    startTransition(async () => {
      const result = await revokePartnershipAction(state.agreementId);
      if (result.error) setError(result.error);
      else setState({ ...state, status: "DRAFT", signedAt: null });
    });
  }

  return (
    <div>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>
        Parceria (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 5)
      </div>
      {state === "loading" ? (
        <p style={{ fontSize: "13px", color: "var(--inc-text-soft)" }}>Carregando...</p>
      ) : !state ? (
        <p className="error-text">{error ?? "Falha ao carregar."}</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span className={`inc-pill inc-pill--${state.status === "SIGNED" ? "ok" : "warn"}`}>
            {state.status === "SIGNED" ? `Assinada em ${formatDateTimeBR(state.signedAt!)}` : "Rascunho — sem assinatura"}
          </span>
          {state.status === "DRAFT" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <button
                type="button"
                className="inc-btn inc-btn--secondary"
                style={{ padding: "4px 10px", fontSize: "12px" }}
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {isPending ? "Enviando..." : "Anexar assinada (PDF)"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="inc-btn inc-btn--secondary"
              style={{ padding: "4px 10px", fontSize: "12px" }}
              disabled={isPending}
              onClick={handleRevoke}
            >
              Reverter
            </button>
          )}
        </div>
      )}
      {error && state !== "loading" ? <p className="error-text" style={{ marginTop: "6px" }}>{error}</p> : null}
      <p style={{ fontSize: "11.5px", color: "var(--inc-text-soft)", marginTop: "6px" }}>
        Sem parceria assinada, o contrato de compra e venda das vendas em que este parceiro recebe comissão
        não pode ser gerado (a venda pode fechar normalmente).
      </p>
    </div>
  );
}

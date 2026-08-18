"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

const GRANULARITY_OPTIONS: { value: string; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "daily", label: "Diária" },
];

export function CashFlowFiltersForm({
  developments,
  spes,
  current,
}: {
  developments: Option[];
  spes: Option[];
  current: { developmentId: string; speId: string; granularity: string };
}) {
  const router = useRouter();
  const [developmentId, setDevelopmentId] = useState(current.developmentId);
  const [speId, setSpeId] = useState(current.speId);
  const [granularity, setGranularity] = useState(current.granularity);

  function apply(nextDevelopmentId: string, nextSpeId: string, nextGranularity: string) {
    const qs = new URLSearchParams();
    if (nextDevelopmentId) qs.set("developmentId", nextDevelopmentId);
    if (nextSpeId) qs.set("speId", nextSpeId);
    if (nextGranularity !== "monthly") qs.set("granularity", nextGranularity);
    router.push(`/cash-flow${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <div style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        {GRANULARITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={granularity === option.value ? "" : "secondary"}
            onClick={() => {
              setGranularity(option.value);
              apply(developmentId, speId, option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="cf-spe" style={{ display: "block", fontSize: "0.8rem" }}>
          SPE
        </label>
        <select
          id="cf-spe"
          value={speId}
          onChange={(e) => {
            const value = e.target.value;
            setSpeId(value);
            setDevelopmentId("");
            apply("", value, granularity);
          }}
        >
          <option value="">Consolidado (organização)</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cf-development" style={{ display: "block", fontSize: "0.8rem" }}>
          Empreendimento
        </label>
        <select
          id="cf-development"
          value={developmentId}
          onChange={(e) => {
            const value = e.target.value;
            setDevelopmentId(value);
            setSpeId("");
            apply(value, "", granularity);
          }}
        >
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

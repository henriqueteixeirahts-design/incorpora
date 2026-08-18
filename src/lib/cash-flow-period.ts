// Chaves de período do fluxo de caixa (Fase B, Parte 4.4) — funções puras,
// sem acesso a banco, testáveis isoladamente (mesma convenção de
// src/lib/index-correction.ts e afins).

export type CashFlowGranularity = "monthly" | "weekly" | "daily";

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Semana ISO 8601 (segunda a domingo, semana 1 = a que contém a 1ª quinta-feira do ano). */
export function weekKey(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dayNum + 3); // quinta-feira desta semana
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function periodKey(date: Date, granularity: CashFlowGranularity) {
  if (granularity === "monthly") return monthKey(date);
  if (granularity === "weekly") return weekKey(date);
  return dayKey(date);
}

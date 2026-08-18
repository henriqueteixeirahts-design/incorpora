import { describe, expect, it } from "vitest";
import { monthKey, dayKey, weekKey, periodKey } from "./cash-flow-period";

describe("monthKey", () => {
  it("formata ano-mês com zero à esquerda", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 10, 1))).toBe("2026-11");
  });
});

describe("dayKey", () => {
  it("formata ano-mês-dia com zero à esquerda", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("weekKey (ISO 8601)", () => {
  it("1º de janeiro de 2026 (quinta-feira) cai na semana 1 de 2026", () => {
    expect(weekKey(new Date(2026, 0, 1))).toBe("2026-W01");
  });

  it("dias da mesma semana ISO (segunda a domingo) caem na mesma chave", () => {
    // 2026-08-17 é uma segunda-feira.
    const monday = weekKey(new Date(2026, 7, 17));
    const sunday = weekKey(new Date(2026, 7, 23));
    expect(monday).toBe(sunday);
  });

  it("virada de semana muda a chave", () => {
    const sunday = weekKey(new Date(2026, 7, 23));
    const nextMonday = weekKey(new Date(2026, 7, 24));
    expect(sunday).not.toBe(nextMonday);
  });

  it("31 de dezembro pode cair na semana 1 do ano seguinte (regra ISO)", () => {
    // 2025-12-31 é uma quarta-feira, semana que contém 1º de janeiro de 2026 (quinta) — semana 1 de 2026.
    expect(weekKey(new Date(2025, 11, 31))).toBe("2026-W01");
  });
});

describe("periodKey", () => {
  it("delega pra função certa conforme a granularidade", () => {
    const date = new Date(2026, 7, 17);
    expect(periodKey(date, "monthly")).toBe(monthKey(date));
    expect(periodKey(date, "weekly")).toBe(weekKey(date));
    expect(periodKey(date, "daily")).toBe(dayKey(date));
  });
});

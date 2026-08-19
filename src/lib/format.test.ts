import { describe, expect, it } from "vitest";
import { formatCalendarDateBR, formatCurrencyBRL, formatDateBR, formatDateTimeBR, formatPercent, parseCalendarDate } from "./format";

describe("formatCurrencyBRL", () => {
  it("formata com separador de milhar e duas casas decimais", () => {
    expect(formatCurrencyBRL(704000)).toBe("R$ 704.000,00");
    expect(formatCurrencyBRL(1234.5)).toBe("R$ 1.234,50");
  });
});

describe("formatPercent", () => {
  it("formata percentual com casas decimais configuráveis", () => {
    expect(formatPercent(62.5)).toBe("62,5%");
    expect(formatPercent(100, 0)).toBe("100%");
  });
});

describe("formatDateBR / formatDateTimeBR — fuso fixo em America/Sao_Paulo (docs/RELATORIO_TESTDRIVE.md achado 19)", () => {
  it("mostra a data correta mesmo quando o instante cai em outro dia em UTC", () => {
    // 2026-01-01 02:00 UTC = 2025-12-31 23:00 em Brasília (UTC-3) — sem o
    // fuso fixo, um ambiente rodando em UTC mostraria "01/01/2026".
    const instant = new Date("2026-01-01T02:00:00Z");
    expect(formatDateBR(instant)).toBe("31/12/2025");
  });

  it("mostra a hora local de Brasília, não a hora UTC do servidor", () => {
    const instant = new Date("2026-06-15T18:30:00Z");
    // Junho não tem horário de verão no Brasil (extinto em 2019) — UTC-3 fixo.
    expect(formatDateTimeBR(instant)).toBe("15/06/2026, 15:30");
  });

  it("aceita string ISO além de Date", () => {
    expect(formatDateBR("2026-03-10T12:00:00Z")).toBe(formatDateBR(new Date("2026-03-10T12:00:00Z")));
  });
});

describe("parseCalendarDate / formatCalendarDateBR — datas de calendário (input type=date), sem deslocar um dia por fuso", () => {
  it("um vencimento de 15/03 sempre exibe 15/03, em qualquer fuso", () => {
    const dueDate = parseCalendarDate("2026-03-15");
    expect(formatCalendarDateBR(dueDate)).toBe("15/03/2026");
  });

  it("a construção por componentes locais (o bug antigo) desviava o dia; a string ISO não", () => {
    // new Date(ano, mes, dia) sofre do fuso do runtime — new Date("AAAA-MM-DD") não.
    const viaComponents = new Date(2026, 2, 15); // comportamento antigo, dependente de fuso
    const viaParseCalendarDate = parseCalendarDate("2026-03-15");
    // Em fuso America/Sao_Paulo (o do ambiente de teste), os dois batem hoje —
    // o ponto é que só o segundo é garantido em qualquer fuso de servidor.
    expect(formatCalendarDateBR(viaParseCalendarDate)).toBe("15/03/2026");
    expect(viaComponents.getDate()).toBe(15);
  });

  it("aceita mês de referência (AAAA-MM) sem dia", () => {
    const referenceMonth = parseCalendarDate("2026-03");
    expect(formatCalendarDateBR(referenceMonth, { month: "short", year: "numeric" })).toContain("2026");
  });
});

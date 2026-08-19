const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCurrencyBRL(value: number): string {
  return currencyFormatter.format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits })}%`;
}

// Fuso fixo em vez de deixar o runtime decidir (docs/RELATORIO_TESTDRIVE.md,
// achado 19): sem `timeZone` explícito, `toLocaleString`/`toLocaleDateString`
// usam o fuso do SISTEMA que roda o código — em Server Component na Vercel
// isso é UTC, não o horário de Brasília, e o horário exibido saía errado.
// Fixo em vez de derivar do relógio do usuário porque a TSH opera só em
// horário de Brasília, em qualquer ambiente (server ou client).
const TIME_ZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateBR(date: Date | string): string {
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTimeBR(date: Date | string): string {
  return dateTimeFormatter.format(typeof date === "string" ? new Date(date) : date);
}

// Datas "de calendário" (vencimento, data de assinatura de cessão/distrato,
// mês de referência de índice — um DIA escolhido num <input type="date">, não
// um instante) são outra categoria: nascem de string "AAAA-MM-DD"/"AAAA-MM"
// sem hora. `new Date("AAAA-MM-DD")` já interpreta isso como meia-noite UTC
// (comportamento do próprio JS) — seguro em qualquer fuso de servidor. O
// bug real estava em código que tentava "evitar fuso" construindo a data por
// componentes locais (`new Date(ano, mes, dia)`), que na verdade introduz a
// dependência de fuso que a string ISO já não tinha. `parseCalendarDate`
// documenta a forma segura; a exibição usa UTC explícito pra nunca desviar
// um dia por causa do fuso de quem está vendo a tela.
const calendarDateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function parseCalendarDate(value: string): Date {
  return new Date(value.length <= 7 ? `${value}-01` : value);
}

export function formatCalendarDateBR(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const parsed = typeof date === "string" ? parseCalendarDate(date) : date;
  return options ? parsed.toLocaleDateString("pt-BR", { ...options, timeZone: "UTC" }) : calendarDateFormatter.format(parsed);
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCurrencyBRL(value: number): string {
  return currencyFormatter.format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits })}%`;
}

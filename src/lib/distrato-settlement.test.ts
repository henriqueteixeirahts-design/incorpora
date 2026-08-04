import { describe, expect, it } from "vitest";
import { calculateDistratoSettlement, maxRetentionPercent } from "./distrato-settlement";

describe("calculateDistratoSettlement", () => {
  it("retém o percentual configurado sobre o total pago, sem deduções", () => {
    const result = calculateDistratoSettlement({ totalPaid: 80000, retentionPercent: 25 });
    expect(result.totalPaid).toBe(80000);
    expect(result.retentionAmount).toBe(20000);
    expect(result.brokerageDeductionAmount).toBe(0);
    expect(result.occupancyFeeAmount).toBe(0);
    expect(result.refundAmount).toBe(60000);
  });

  it("aplica o teto de 50% com patrimônio de afetação", () => {
    const result = calculateDistratoSettlement({ totalPaid: 100000, retentionPercent: 50 });
    expect(result.retentionAmount).toBe(50000);
    expect(result.refundAmount).toBe(50000);
  });

  it("deduz comissão de corretagem e taxa de fruição do valor a devolver", () => {
    const result = calculateDistratoSettlement({
      totalPaid: 100000,
      retentionPercent: 25,
      brokerageDeductionAmount: 6000,
      occupancyFeeAmount: 4000,
    });
    // 100000 - 25000 (retenção) - 6000 (corretagem) - 4000 (fruição) = 65000
    expect(result.retentionAmount).toBe(25000);
    expect(result.refundAmount).toBe(65000);
  });

  it("nunca devolve valor negativo — deduções que superam o saldo zeram o refund, não geram cobrança", () => {
    const result = calculateDistratoSettlement({
      totalPaid: 10000,
      retentionPercent: 25,
      brokerageDeductionAmount: 6000,
      occupancyFeeAmount: 5000,
    });
    // 10000 - 2500 - 6000 - 5000 = -3500 -> zerado
    expect(result.retentionAmount).toBe(2500);
    expect(result.refundAmount).toBe(0);
  });

  it("arredonda pra centavos em valores com dízima", () => {
    const result = calculateDistratoSettlement({ totalPaid: 33333.33, retentionPercent: 25 });
    expect(result.retentionAmount).toBe(8333.33);
    expect(result.refundAmount).toBe(25000);
  });
});

describe("maxRetentionPercent", () => {
  it("25% sem patrimônio de afetação, 50% com", () => {
    expect(maxRetentionPercent(false)).toBe(25);
    expect(maxRetentionPercent(true)).toBe(50);
  });
});

import { describe, expect, it } from "vitest";
import { resolveCollectionStage, DEFAULT_COLLECTION_STEPS } from "@/lib/collection-stage";

describe("resolveCollectionStage", () => {
  it("antes de qualquer etapa (nem o D-5 chegou): sem etapa atual, próxima é a primeira", () => {
    const { currentStep, nextStep } = resolveCollectionStage(DEFAULT_COLLECTION_STEPS, -10);
    expect(currentStep).toBeNull();
    expect(nextStep?.actionLabel).toBe("Lembrete amigável");
  });

  it("no D-5 exato: etapa atual é o lembrete, próxima é o 1º contato de atraso", () => {
    const { currentStep, nextStep } = resolveCollectionStage(DEFAULT_COLLECTION_STEPS, -5);
    expect(currentStep?.actionLabel).toBe("Lembrete amigável");
    expect(nextStep?.actionLabel).toBe("1º contato de atraso");
  });

  it("entre D+3 e D+15: etapa atual é o 1º contato, próxima é o contato firme", () => {
    const { currentStep, nextStep } = resolveCollectionStage(DEFAULT_COLLECTION_STEPS, 10);
    expect(currentStep?.actionLabel).toBe("1º contato de atraso");
    expect(nextStep?.actionLabel).toBe("Contato firme + proposta de renegociação");
  });

  it("depois da última etapa (D+60): etapa atual é o jurídico, sem próxima etapa configurada", () => {
    const { currentStep, nextStep } = resolveCollectionStage(DEFAULT_COLLECTION_STEPS, 120);
    expect(currentStep?.actionLabel).toBe("Encaminhamento jurídico");
    expect(nextStep).toBeNull();
  });

  it("funciona com uma régua customizada fora de ordem de inserção", () => {
    const steps = [
      { sequence: 1, offsetDays: 30, actionLabel: "Notificação" },
      { sequence: 2, offsetDays: 0, actionLabel: "No vencimento" },
    ];
    const { currentStep, nextStep } = resolveCollectionStage(steps, 5);
    expect(currentStep?.actionLabel).toBe("No vencimento");
    expect(nextStep?.actionLabel).toBe("Notificação");
  });
});

// Régua de cobrança (Fase B, Parte 3.2) — cálculo puro de "em qual etapa
// o cliente está e qual a próxima ação sugerida", a partir dos dias em
// atraso e da lista de etapas configurada (ou o default). Sem I/O — quem
// busca a regra e os dias em atraso no banco é a camada de servidor
// (src/server/collection-rules.ts / src/server/aging.ts).

export type CollectionStep = { sequence: number; offsetDays: number; actionLabel: string };

export const DEFAULT_COLLECTION_STEPS: CollectionStep[] = [
  { sequence: 1, offsetDays: -5, actionLabel: "Lembrete amigável" },
  { sequence: 2, offsetDays: 3, actionLabel: "1º contato de atraso" },
  { sequence: 3, offsetDays: 15, actionLabel: "Contato firme + proposta de renegociação" },
  { sequence: 4, offsetDays: 30, actionLabel: "Notificação formal" },
  { sequence: 5, offsetDays: 60, actionLabel: "Encaminhamento jurídico" },
];

/** Etapa atual (a última cujo prazo já foi atingido) e próxima ação sugerida, a partir dos dias em atraso. */
export function resolveCollectionStage(steps: CollectionStep[], daysOverdue: number) {
  const sorted = [...steps].sort((a, b) => a.offsetDays - b.offsetDays);
  let currentStep: CollectionStep | null = null;
  let nextStep: CollectionStep | null = null;

  for (const step of sorted) {
    if (step.offsetDays <= daysOverdue) {
      currentStep = step;
    } else if (!nextStep) {
      nextStep = step;
    }
  }

  return { currentStep, nextStep };
}

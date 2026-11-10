# Varredura: campos do schema sem tela e `isActive` sem caminho de desativação

> 2026-11-10, sprint noturna (Bloco 4). Pendência antiga do STATUS ("campo existe no schema, nunca exposto em tela" — apareceu 3 vezes em fases diferentes). **Só registro: decidir o que expor é decisão de produto; nada foi implementado.**
> Método: script sobre `prisma/schema.prisma` — para cada campo escalar/enum de cada modelo (fora id, datas automáticas, `organizationId`, autoria e FKs), procurar o nome do campo em `src/app` e `src/components`. Limite do método: busca por nome; um nome comum usado em outra tela (ex.: `status`) esconde o campo. A lista abaixo é o piso, não o teto.

## 1. `isActive` sem nenhum caminho de escrita

Checagem por modelo: alguma chamada `<modelo>.create/update/upsert` em `src/server` escreve `isActive`?

| Resultado |
|---|
| Organization: escrita de isActive em src/server → NENHUMA |
| User: escrita de isActive em src/server → NENHUMA |
| SpecialPurposeEntity: escrita de isActive em src/server → NENHUMA |
| Development: escrita de isActive em src/server → NENHUMA |
| ConstructionPhase: escrita de isActive em src/server → construction.ts:create, construction.ts:update |
| RealEstateAgency: escrita de isActive em src/server → NENHUMA |
| Broker: escrita de isActive em src/server → NENHUMA |
| SalesTable: escrita de isActive em src/server → NENHUMA |
| IndexRule: escrita de isActive em src/server → NENHUMA |
| Supplier: escrita de isActive em src/server → NENHUMA |
| CostCenter: escrita de isActive em src/server → NENHUMA |
| ScheduledReport: escrita de isActive em src/server → scheduled-reports.ts:update |

**10 modelos têm `isActive` que nasce `true` e nunca muda**: `Organization`, `User`, `SpecialPurposeEntity`, `Development`, `RealEstateAgency`, `Broker`, `SalesTable`, `IndexRule`, `Supplier`, `CostCenter`. Só `ConstructionPhase` e `ScheduledReport` têm desativação. Antes de expor o botão em qualquer um, decidir o que acontece com os vínculos ativos (ex.: SPE com empreendimentos, corretor com reservas abertas, índice usado por contrato) — mesmo cuidado já anotado no STATUS para SPE/imobiliária/corretor.

## 2. Campos sem nenhuma menção em telas (53)

### 2a. Nem a camada de servidor usa (15) — candidatos a campo morto

| Modelo | Campo | Tipo |
|---|---|---|
| `Organization` | `planTier` | String |
| `AuditEvent` | `ipAddress` | String |
| `DocumentTemplate` | `effectiveDate` | DateTime |
| `Notification` | `readAt` | DateTime |
| `JobRun` | `alertSuppressed` | Boolean — **falso positivo**: usado pela Edge Function do alerta (`supabase/functions/`, fora de `src/`) |
| `ConstructionPhase` | `actualStart` | DateTime |
| `ConstructionPhase` | `actualEnd` | DateTime |
| `Unit` | `commonArea` | Decimal |
| `Unit` | `sunOrientation` | String |
| `Unit` | `buildableArea` | Decimal |
| `Unit` | `constructionRestrictions` | String |
| `Unit` | `topography` | String |
| `Unit` | `locationInCondo` | String |
| `Unit` | `mapCoordinates` | String |
| `Unit` | `hasOwnRegistration` | Boolean |

### 2b. Usados em `src/server`, sem tela (38) — calculados/internos ou não expostos

| Modelo | Campo | Tipo |
|---|---|---|
| `SpeInvestorContributionForecast` | `cancelReason` | String |
| `SpeInvestorContribution` | `receiptFilePath` | String |
| `SpeInvestorLoanCalculation` | `totalAmortized` | Decimal |
| `ExchangeApurationPeriod` | `deductionsInformedByUserId` | String |
| `ExchangeApurationPeriod` | `deductionsInformedAt` | DateTime |
| `ExchangeApurationPeriod` | `closedAt` | DateTime |
| `ExchangeRepasse` | `installmentPaymentId` | String |
| `AuditEvent` | `beforeData` | Json |
| `AuditEvent` | `afterData` | Json |
| `Document` | `mimeType` | String |
| `JobRun` | `alertSentAt` | DateTime |
| `ConstructionMeasurement` | `informedByUserId` | String |
| `Unit` | `idealFraction` | Decimal |
| `SalesTable` | `validUntil` | DateTime |
| `Reservation` | `cancelledAt` | DateTime |
| `Reservation` | `cancelReason` | String |
| `ReservationWaitlistEntry` | `convertedAt` | DateTime |
| `ReservationWaitlistEntry` | `cancelledAt` | DateTime |
| `Proposal` | `evaluationChecks` | Json |
| `ProposalApproval` | `approverUserId` | String |
| `ProposalApproval` | `decidedAt` | DateTime |
| `CommissionSplit` | `accruedAmount` | Decimal |
| `CommissionSplit` | `settledAmount` | Decimal |
| `RenegotiationAgreement` | `sequenceNumber` | Int |
| `RenegotiationApproval` | `approverUserId` | String |
| `RenegotiationApproval` | `decidedAt` | DateTime |
| `Contract` | `downPaymentCommissionExcess` | Decimal |
| `ContractAmendment` | `sequenceNumber` | Int |
| `ContractAssignment` | `sequenceNumber` | Int |
| `Installment` | `lastCalculatedAt` | DateTime |
| `Installment` | `correctionExempt` | Boolean |
| `Installment` | `externalCommissionPortion` | Decimal |
| `Installment` | `externalCommissionRecognized` | Decimal |
| `IndexRule` | `publicationDeadlineDay` | Int |
| `FinancialCalculation` | `competenceMonth` | DateTime |
| `FinancialCalculation` | `baseValue` | Decimal |
| `FinancialCalculation` | `indexFactor` | Decimal |
| `FinancialCalculation` | `interestFactor` | Decimal |

Boa parte de 2b é dado calculado pelo motor ou de controle interno (ex.: fatores e valores de `FinancialCalculation`, `JobRun`), que não precisa de tela; o que parece dado de negócio digitável está nas aprovações (`ProposalApproval`, `RenegotiationApproval`) e em `Reservation`/`ReservationWaitlistEntry`.

**Destaque de 2a**: 8 campos de `Unit` (lote/terreno: área edificável, área comum, orientação solar, restrições, topografia, localização no condomínio, coordenadas, matrícula própria) existem no schema e em nenhum lugar do código — mesmo padrão da "área da unidade" da Sprint V1. Pergunta de produto: expor no cadastro de unidade (loteamento/condomínio) ou remover do schema.

Script da varredura: refazer com `python3` sobre o schema (ver o histórico deste arquivo no git); rodar de novo depois de cada fase.

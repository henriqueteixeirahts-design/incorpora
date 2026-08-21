-- docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 3 (chamada de capital). Aditiva.
CREATE TABLE "spe_capital_calls" (
    "id" UUID NOT NULL,
    "forecastId" UUID NOT NULL,
    "deadlineDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "documentPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spe_capital_calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spe_capital_calls_forecastId_key" ON "spe_capital_calls"("forecastId");

ALTER TABLE "spe_capital_calls" ADD CONSTRAINT "spe_capital_calls_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "spe_investor_contribution_forecasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

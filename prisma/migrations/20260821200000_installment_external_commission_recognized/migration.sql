-- docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 5 — contador de quanto da
-- fatia de comissão externa de uma parcela já foi reconhecido/distribuído
-- (evita reconstruir isso a partir de pagamentos parciais). Aditiva.
ALTER TABLE "installments" ADD COLUMN "externalCommissionRecognized" DECIMAL(14,2) NOT NULL DEFAULT 0;

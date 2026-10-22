-- V6 da auditoria de atualização (V6a, aprovada em 2026-10-22): confere se a
-- linha mais recente de FinancialCalculation de cada parcela em aberto bate
-- com o valor guardado na própria parcela (Installment.correctedValue /
-- lastCalculatedAt). A V3 confere só o valor guardado; esta verificação
-- fecha a lacuna entre o valor guardado e a memória de cálculo. Só acrescenta
-- um valor ao enum — nenhuma mudança de grant.
ALTER TYPE "AuditCheckCode" ADD VALUE 'V6_HISTORY_CONSISTENCY';

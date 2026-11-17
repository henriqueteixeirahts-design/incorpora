# Especificação — Confiabilidade: Jobs Preparados, Auditoria de Atualização e Tempo Real (Incorpora)

Três decisões de arquitetura registradas pelo dono do produto:

1. **Fila de jobs: preparar agora, contratar depois.** Sem custo recorrente durante o período de testes de uso; a arquitetura nasce pronta para a troca ser uma mudança de configuração, não uma reescrita.
2. **Auditoria de atualização (double-check):** verificação independente de que índices e carteira foram atualizados corretamente. Falha silenciosa aqui = dinheiro deixado na mesa (parcela cobrada sem a correção do mês). Precisa de vigilância ativa, não de confiança cega no cron.
3. **Inadimplência em tempo real:** a posição de atraso da carteira é sempre calculada ao vivo, nunca dependente de um processamento noturno que pode ter falhado.

---

## PARTE 1 — Camada de Jobs Preparada (sem custo agora)

### 1.1 O princípio: separar "o que fazer" de "quem dispara"

Todo trabalho em segundo plano do sistema passa a ser escrito como um **job nomeado e autônomo** — uma função com contrato padrão:

```
Job = {
  nome: "expirar-reservas",
  executar(params, contexto) → { sucesso, resumo, erros },
  idempotente: true   // rodar duas vezes não pode causar dano
}
```

Regras dos jobs:
- **Idempotência obrigatória:** re-executar um job já executado não duplica efeito (ex.: corrigir parcela já corrigida no mês não corrige de novo). Isso torna o retry sempre seguro.
- **Registro de execução:** toda execução grava em uma tabela `JobRun` (job, início, fim, status, resumo do que fez, erro se houver, organização) — é a matéria-prima da auditoria (Parte 2) e do futuro painel.
- **Por organização:** todo job itera as organizações ativas (preparação multi-tenant já especificada).

### 1.2 O disparador de hoje (custo zero)

Enquanto não houver o serviço de fila, os jobs são disparados por:
- **Vercel Cron** (os agendados: correção mensal, índices semanais, futura régua diária) — cada rota de cron vira só um "chamador" do job, sem lógica própria
- **Disparo por evento, inline:** eventos que precisam de ação imediata (ex.: reserva criada agenda sua expiração) usam a técnica atual aprimorada — a verificação preguiçosa continua, mas **acoplada ao registro `JobRun`** para a auditoria enxergar o que rodou
- **Disparo manual:** tela interna (Configurações → Sistema → Jobs) listando os jobs com botão "Executar agora" e o histórico de execuções — serve de painel mínimo e de válvula de escape operacional ("o cron falhou? roda na mão em 1 clique")

### 1.3 A troca futura (quando a operação real começar)

Contratar o serviço de fila (Inngest/Trigger.dev ou pg-boss — avaliar na hora) significa apenas trocar o *disparador*: os jobs já existem, já são idempotentes, já registram execução. Migração estimada em dias, não semanas. **Gatilho da troca:** início da operação real com clientes/cobrança de verdade, ou o primeiro caso em que a varredura preguiçosa causar prejuízo operacional visível — o que vier primeiro.

---

## PARTE 2 — Auditoria de Atualização (o double-check)

### 2.1 O princípio: quem verifica não é quem executa

O motor de correção calcula; a auditoria **confere por caminho independente**. Nunca confiar que "o cron rodou, então está certo" — verificar o *estado resultante* dos dados contra o estado esperado.

### 2.2 As verificações (executadas diariamente + sob demanda)

| # | Verificação | Pergunta que responde | Alarme quando |
|---|---|---|---|
| V1 | **Frescor dos índices** | O índice de cada regra em uso (INCC, IPCA, IGP-M...) tem valor lançado para o mês de competência esperado? | Índice faltando após o dia D do mês (configurável por índice — cada um tem calendário de publicação próprio) |
| V2 | **Cobertura da correção** | Toda parcela em aberto de contrato com correção ativa teve recálculo no ciclo vigente? (varre as parcelas, não o log do cron) | Qualquer parcela "órfã" sem recálculo no ciclo |
| V3 | **Consistência da memória** | O último valor corrigido de cada parcela bate com o recálculo refeito agora, de forma independente? (amostragem diária de N parcelas + verificação completa mensal) | Divergência de 1 centavo que seja |
| V4 | **Execução dos jobs** | Todos os jobs agendados do período têm `JobRun` de sucesso? | Job sem execução ou com falha não re-executada |
| V5 | **Divergência de fonte** | O valor do índice armazenado bate com a fonte oficial (re-consulta à API do BC)? | Divergência entre o gravado e o oficial (pega tanto erro de gravação quanto revisão do índice pelo próprio BC — que acontece) |

### 2.3 Onde o resultado aparece — impossível de ignorar

- **Selo de saúde no dashboard** (todos os perfis internos de gestão): 🟢 "Carteira íntegra — verificada hoje às 06:00" / 🔴 "ATENÇÃO: 3 verificações falharam" com link pro detalhe
- **Tela de auditoria** (Configurações → Sistema → Auditoria de atualização): histórico das verificações, detalhe de cada falha (qual parcela, qual índice, valores esperado × encontrado), botão de re-verificação
- **Relatório mensal de integridade** gerado automaticamente e arquivado: "no mês X, 100% das parcelas corrigidas, 0 divergências" — o documento que protege a TSH numa disputa com cliente sobre valor de parcela ("o sistema calculou certo e há prova independente disso")
- Quando a integração de comunicação existir (Fase 2): falha vermelha também notifica por e-mail o responsável

### 2.4 Regra de bloqueio prudente

Se V1 falhar (índice do mês ausente) após a data-limite: o sistema **sinaliza em toda tela que exiba valor corrigido** ("valores calculados com índice de [mês anterior] — índice de [mês] pendente") em vez de exibir número silenciosamente desatualizado. Transparência no lugar de erro invisível.

---

## PARTE 3 — Inadimplência em Tempo Real

### 3.1 O princípio: atraso é cálculo, não status gravado

A condição "vencida/em atraso" de uma parcela **nunca é um campo atualizado por rotina noturna** — é derivada no momento da consulta: `vencimento < hoje e não paga`. O valor corrigido com multa/mora idem: calculado ao vivo pela memória do motor (que já funciona assim). Consequência: o painel de inadimplência, o aging e o extrato estão certos **sempre**, mesmo que todo cron do mundo tenha falhado — a auditoria da Parte 2 protege a *correção monetária*; o *status de atraso* não depende de rotina nenhuma.

### 3.2 O que "tempo real" significa por fase

| Agora (recebimento manual) | Com integração bancária (Fase 2) |
|---|---|
| Atraso: tempo real absoluto (derivado da data) | Igual |
| Baixa de pagamento: reflete no instante do lançamento manual | Baixa automática via webhook do banco (boleto/Pix compensado → parcela baixa sozinha, minutos após o pagamento) |
| Risco residual: parcela paga mas ainda não lançada aparece como vencida | Risco eliminado — a lacuna entre "cliente pagou" e "sistema sabe" desaparece |

Ou seja: a arquitetura de tempo real está pronta desde já; a integração bancária da Fase 2 não muda o modelo, só **fecha a última lacuna** (a detecção automática do pagamento). Nenhum retrabalho.

### 3.3 Performance (para manter o tempo real rápido)

- Índices de banco nas colunas de vencimento/status de pagamento (verificar na implementação)
- Agregados do dashboard (totais de aging) podem usar cache curto (minutos) com invalidação em evento de recebimento — o detalhe por parcela permanece sempre ao vivo
- Teste de carga leve quando a carteira real crescer (marcador para o futuro, não para agora)

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Encaixe |
|---|---|---|
| 1 | Contrato de Job + tabela `JobRun` + migração dos 2 crons existentes para o padrão | Junto com as Fundações (pilares 1-3 do `ESPEC_MULTITENANT_FUNDACOES.md`) — mesma janela |
| 2 | Tela de Jobs (histórico + executar agora) | Idem |
| 3 | Auditoria: V1-V5 + selo no dashboard + tela de detalhe | Logo após — é pré-requisito de confiança para a operação de testes |
| 4 | Relatório mensal de integridade | Com o motor de templates (Fase A) |
| 5 | Revisão de "tempo real" da inadimplência (confirmar derivação ao vivo + índices de banco) | Na Fase B (carteira), como item de verificação |
| 6 | Contratação do serviço de fila + troca do disparador | Gatilho: início da operação real — decisão futura, fora de escopo agora |

**Nota para o desenvolvedor:** as verificações V2/V3/V5 são deliberadamente redundantes com o motor de correção — essa redundância é o requisito, não desperdício. Implementá-las por caminho de código independente do motor (não reutilizar a mesma função que calculou para conferir a si mesma).

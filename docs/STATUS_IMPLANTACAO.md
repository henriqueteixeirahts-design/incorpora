# Status de Implantação — Incorpora (TSH Incorporadora)

> Este documento deve ser atualizado pelo Claude Code ao final de cada sprint concluída, antes de iniciar a próxima. Objetivo: permitir auditoria do progresso por alguém não-técnico, sem precisar acompanhar o desenvolvimento sprint a sprint.

**Última atualização:** Sprint 6-7 concluída

---

## 1. O que está funcional e testado (por sprint)

### Sprint 0 — Fundação técnica
✅ Concluída
- Login, permissões (roles), estrutura Organização → SPE, auditoria (`DevelopmentEvent`) funcionando.

### Sprint 1-2 — Produto e disponibilidade
✅ Concluída
- Cadastro de empreendimento, unidades, vínculo principal/acessória e mapa de disponibilidade testados.

### Sprint 3-4 — Comercial
✅ Concluída e testada de ponta a ponta
- Fluxo validado: reserva → proposta com desconto de 6% → aprovação em 3 níveis (acima do limite de 5%) → venda → comissão automática do corretor (4%) + split manual do coordenador, com valores conferidos.
- Módulos entregues: CRM comercial (clientes, corretores, imobiliárias), tabelas de venda, reservas com expiração, propostas versionáveis com simulador de fluxo, aprovação por alçada, conversão em venda, comissões com split.

### Sprint 5 — Contratos
✅ Concluída e testada de ponta a ponta
- Fluxo validado: reserva → proposta → venda → minuta gerada → enviada para assinatura → confirmada → carteira criada com valor e vencimento corretos.
- Módulos entregues: contratos com numeração sequencial (`CT-2026-0001`) e ciclo `DRAFT → AWAITING_SIGNATURE → SIGNED`, minuta renderizada sob demanda com dados automáticos, criação automática da carteira a partir do fluxo simulado na proposta.

### Sprint 6-7 — Carteira e indexadores
✅ Concluída e testada com script dedicado (12 conferências automáticas)
- Fluxo validado: cadastro de índice INCC com valores mensais (1%, 1%, 1,5%) → configuração da regra de correção do contrato (índice + 0,5% de juros contratuais compostos + 2% de multa + 1% de mora ao mês) → parcela corrigida em 3 meses bateu exatamente com o cálculo manual (R$ 300.000 → R$ 315.303,09) → mesma parcela testada com 40 dias de atraso: multa e mora calculadas e conferidas centavo a centavo → parcela apareceu na lista de inadimplência → recebimento parcial (`PARTIALLY_PAID`) seguido de quitação (`PAID`) → parcela paga não é mais recalculada → antecipação simulada de uma parcela futura com 5% de desconto conferida (valor presente = atualizado − desconto).
- Módulos entregues: catálogo de índices (INCC/IPCA/IGP-M/taxa fixa) com lançamento mensal manual, regra de correção por contrato (índice + juros contratuais + multa/mora), memória de cálculo auditável (cada recálculo gera um registro novo, nunca sobrescreve), recebimentos manuais com baixa parcial/total, lista de inadimplência com recálculo automático das parcelas vencidas, simulador de antecipação (não baixa nada, só demonstra).
- **Retrabalho pontual (mesma sprint):** correção em duas fases (obra + pós-Habite-se), detalhado na seção 2. Testado com 5 cenários na função pura (sem Habite-se, Habite-se futuro, Habite-se no meio do período, contrato assinado após o Habite-se, multa/mora sobre as duas fases combinadas) mais um teste de integração completo via banco: contrato com INCC na fase de obra e IPCA + juros simples na fase pós-Habite-se, valores conferidos e as duas fases visíveis na memória de cálculo.

### Sprint 8 — Financeiro básico
⏳ Não iniciada

### Sprint 9 — Relatórios executivos
⏳ Não iniciada

### Sprint 10 — Estabilização e implantação
⏳ Não iniciada

---

## 2. Decisões que se afastaram do PRD/arquitetura original

| Decisão | O que diz o PRD/arquitetura | O que foi implementado | Motivo | Precisa revisão? |
|---|---|---|---|---|
| Alçadas de aprovação de desconto | Valores citados como exemplo | Até 2% gerente comercial; 2-5% +diretor; acima de 5% +sócios | Usado o exemplo do PRD como padrão inicial | Confirmado pela TSH — manter |
| Expiração de reserva e correção de carteira | Não especificado o mecanismo / PRD prevê rotina de correção contínua | Varredura "preguiçosa" (recálculo sob demanda, ao consultar a tela) em vez de worker assíncrono — agora usada também para recalcular parcelas vencidas antes de exibir a lista de inadimplência | Ainda não existe processamento em background no sistema | Sim — decisão adiada de novo na Sprint 6-7 por falta de infraestrutura de fila; reavaliar antes da Sprint 10 (estabilização), já que sem rotina automática ninguém é avisado de uma parcela vencendo sem que alguém abra a tela |
| Correção em duas fases (obra e pós-Habite-se) | PRD seção 12 prevê fases de correção dentro do mesmo contrato (ex.: INCC durante a obra, IPCA + juros após a entrega) | Implementado com gatilho pela **data do Habite-se** (campo novo no empreendimento, diferente da data de entrega ao cliente). A regra da fase de obra fica no contrato (pode variar por negociação); a regra pós-Habite-se fica **no empreendimento** e vale para todos os contratos dele — confirmado pela TSH que não é configurável por contrato individual | Decisão confirmada pela TSH em 2026-07-24, resolvida ainda dentro da Sprint 6-7 como retrabalho pontual | Não — decisão fechada e testada (ver seção 1) |

---

## 3. Pendências técnicas conhecidas

| Pendência | Onde impacta | Sprint sugerida para resolver |
|---|---|---|
| Upload real de arquivo do contrato assinado (hoje é só campo de referência) | Contratos | Quando Supabase Storage for configurado — antes da Sprint 10 |
| Minuta sem motor de template (dados corretos, mas sem geração de documento formatado) | Contratos | Antes da Sprint 10, ou fase 2 |
| Ausência de worker assíncrono | Reservas, e agora também recálculo de carteira/inadimplência — tudo roda "sob demanda" ao abrir a tela, não sozinho todo dia | Continua em aberto; avaliar antes da Sprint 10. Sem isso, ninguém recebe aviso automático de parcela vencendo — alguém precisa abrir a tela de inadimplência para os cálculos rodarem |
| Índices sem integração automática com fonte oficial (Banco Central/IBGE) | Correção de carteira | Fase 2 (fora do escopo da V1 original) — cadastro manual mensal é suficiente por ora, mas depende de disciplina do Financeiro |

---

## 4. Riscos identificados antes da próxima sprint (Sprint 8 — Financeiro básico)

| Risco | Por quê importa | Como pretendemos mitigar |
|---|---|---|
| Categorização de despesas inconsistente | O PRD lista categorias específicas (construtora, terreno, projetos, marketing, corretagem, impostos...). Se o campo for texto livre, cada usuário escreve diferente e o fluxo de caixa por categoria fica inutilizável. | Modelar categoria como lista fechada (igual fizemos com tipo de unidade/status), não texto livre. |
| Rateio entre empreendimentos e SPEs | Uma despesa (ex.: contabilidade da holding) pode precisar ser dividida entre mais de um empreendimento/SPE — o PRD menciona "rateio" explicitamente. | Definir com a TSH se, para os 2 empreendimentos-piloto, existe esse cenário agora ou se pode ficar para depois — evita construir uma tela de rateio complexa sem necessidade real. |
| Fluxo de caixa precisa combinar contas a pagar (novo) com a carteira a receber (já existe) | Se os dois modelos não conversarem bem, a projeção de caixa fica errada — e é exatamente esse número que a diretoria vai olhar primeiro. | Construir o fluxo de caixa como uma consulta que soma as duas fontes (parcelas em aberto da carteira + contas a pagar em aberto), sem duplicar dados, e conferir o total com um exemplo manual antes de fechar a sprint. |
| Sem integração bancária ainda | Contas a pagar e recebimentos continuam sendo lançados manualmente — risco de atraso no lançamento afetar a confiabilidade do fluxo de caixa. | Fora do escopo da V1 por decisão do PRD (Fase 17); mitigação é apenas disciplina operacional da equipe financeira, não técnica. |

---

## Como manter este documento

Ao final de cada sprint, o Claude Code deve:
1. Marcar a sprint como ✅ concluída na seção 1, com o fluxo real testado e um exemplo de valores conferidos.
2. Adicionar à seção 2 qualquer decisão que tenha se afastado do PRD/arquitetura, mesmo que pareça pequena.
3. Adicionar à seção 3 qualquer atalho, simplificação temporária ou funcionalidade adiada.
4. Preencher a seção 4 com riscos específicos da próxima sprint, antes de começar a implementá-la.

# Especificação — FASE B: Ciclo do Dinheiro (Carteira/Recebíveis + Financeiro)

Refinamento dos módulos de Carteira/Recebíveis e Financeiro (Contas a pagar / Fluxo de caixa) do Incorpora. O motor de cálculo da carteira (correção em duas fases, multa, mora, memória auditável) já é sólido — esta fase refina a **interface e a operação** em cima dele, e fecha as pendências do financeiro.

Baseado em pesquisa dos padrões de mercado de gestão de recebíveis imobiliários (aging list, régua de cobrança por faixas de atraso, renegociação estruturada, conciliação centralizada).

Pré-requisitos existentes: motor de correção/multa/mora testado (Sprint 6-7), recebimento manual com baixa parcial/total, tela de inadimplência, contas a pagar com fluxo Lançada→Conciliada (Sprint 8), cron de recálculo automático, padrão de UI aprovado.

**Nota de escopo:** esta fase prepara mas NÃO inclui a integração bancária (boleto/Pix automático, conciliação por webhook) — isso permanece na Fase 2 do roadmap. Tudo aqui funciona com lançamento manual, mas estruturado pra quando a integração chegar.

---

## PARTE 1 — Extrato do Cliente

### 1.1 Conceito

Visão única e completa da posição financeira de um cliente/contrato — o documento que o cliente pede e a equipe hoje montaria à mão. Base do futuro Portal do Cliente (Fase 2): a mesma tela, com permissão de cliente, vira o extrato que ele acessa sozinho.

### 1.2 Conteúdo

**Cabeçalho:** cliente, contrato, empreendimento/unidade, status geral (Em dia / Em atraso / Renegociado / Quitado), resumo: valor contratado, total pago (corrigido), saldo devedor atual (corrigido na data de referência), % quitado.

**Tabela de parcelas (todas):**
| Coluna | Detalhe |
|---|---|
| Nº / tipo | entrada, mensal, balão, chaves |
| Vencimento | |
| Valor original | nominal do contrato |
| Valor corrigido | na data de referência (ou na data do pagamento, se paga) |
| Situação | Paga / Em aberto / Vencida / Renegociada (com link pro acordo) |
| Pagamento | data + valor pago + forma |
| Detalhe do cálculo | expansível: índice aplicado mês a mês, juros, multa, mora — puxa a memória de cálculo existente |

**Ações na tela:** registrar recebimento (já existe), simular antecipação (já existe), **simular quitação total na data X**, gerar PDF do extrato (documento formatado pra enviar ao cliente — usa o motor de templates da Fase A com um modelo "Extrato/Demonstrativo").

### 1.3 Posição consolidada por cliente

Cliente com mais de um contrato: visão agregada (todos os contratos, saldo total, situação geral) + navegação pro extrato de cada um.

---

## PARTE 2 — Renegociação de Parcelas

### 2.1 Conceito

Acordo estruturado sobre parcelas em aberto/vencidas — diferente do aditivo da Fase A (que redesenha o fluxo futuro inteiro): a renegociação trata dívida vencida/acumulada, tipicamente reparcelando-a.

### 2.2 Fluxo

1. No extrato, selecionar as parcelas a renegociar (vencidas e/ou a vencer)
2. O sistema apresenta o **valor consolidado corrigido** (com multa/mora até a data do acordo)
3. Montar o acordo: desconto sobre encargos (parametrizável — ex.: até X% de desconto sobre multa/mora sem aprovação; acima, alçada), entrada do acordo, novo parcelamento (quantidade, valor, vencimentos, com ou sem correção futura)
4. Validação por alçada: mesma infraestrutura de aprovação existente; limites configuráveis por empreendimento (desconto máximo sobre encargos, prazo máximo do reparcelamento)
5. Acordo aprovado → gera documento pelo motor de templates (modelo "Termo de Renegociação"/aditivo) → parcelas originais marcadas **Renegociadas** (nunca apagadas — trilha completa), novas parcelas criadas vinculadas ao acordo
6. Acordo descumprido (parcela do acordo vence sem pagamento por N dias, configurável): sistema sinaliza "Acordo quebrado" — opcionalmente reativa condições originais (parametrizável, depende da cláusula do termo)

### 2.3 Auditoria

Todo acordo registra: quem propôs, quem aprovou, condições, documento gerado, parcelas de origem e de destino. Relatório de renegociações no período (volume, desconto médio concedido, taxa de cumprimento dos acordos).

---

## PARTE 3 — Painel de Cobrança (Aging + Régua Manual Assistida)

### 3.1 Aging da carteira

Painel que agrupa os títulos vencidos por faixa de atraso — a ferramenta padrão de gestão de inadimplência:

```
A vencer (30d)  |  1–15d  |  16–30d  |  31–60d  |  61–90d  |  +90d
  R$ 480 mil    | R$ 85mil| R$ 120mil| R$ 60mil |  R$ 30mil| R$ 95mil
   32 parcelas  |  6 clts |   9 clts |  4 clts  |   2 clts |  3 clts
```

- Clique na faixa → lista de clientes/parcelas daquela faixa, com valor corrigido atual
- Filtros: empreendimento, SPE, faixa de valor
- Evolução da inadimplência no tempo (gráfico simples: % da carteira vencida, mês a mês)

### 3.2 Régua de cobrança — etapa manual assistida (antes da automação da Fase 2)

Configuração por empreendimento das **etapas da régua** (faixas de atraso × ação sugerida):

| Faixa | Ação sugerida (exemplo default) |
|---|---|
| D-5 (antes do vencimento) | Lembrete amigável |
| D+3 | 1º contato de atraso |
| D+15 | Contato firme + proposta de renegociação |
| D+30 | Notificação formal |
| D+60 | Encaminhamento jurídico |

Nesta fase, a régua é **assistida, não automática**: o painel mostra, por cliente em atraso, **em qual etapa da régua ele está e qual a próxima ação sugerida**; o usuário registra o contato feito (data, canal, resumo, próximo passo) — criando o **histórico de cobrança** por cliente. Quando a integração de comunicação chegar (Fase 2: e-mail/WhatsApp automáticos), a mesma régua configurada passa a disparar sozinha — a estrutura é a mesma.

Histórico de cobrança visível no extrato do cliente (aba/seção própria).

---

## PARTE 4 — Financeiro Refinado

### 4.1 Contas a pagar no padrão novo de UI

- Lista com filtros (fornecedor, empreendimento, SPE, centro de custo, categoria, status, período, valor) + ordenação + paginação + exportação
- Modal com abas (referência Obra Prima já levantada): **Dados / Itens / Pagamento / Anexos**
- **Anexo de documento fiscal** (NF, boleto, recibo) na conta a pagar — reaproveita a infraestrutura de anexos; campo nº do documento fiscal
- Fluxo de aprovação existente (Lançada → Conferida → Aprovada → Programada → Paga → Conciliada) com UI melhor: ações claras por status, quem aprovou cada etapa visível, painel "minhas pendências de aprovação" pra quem tem alçada

### 4.2 Rateio de despesa entre empreendimentos — pendência antiga, resolve aqui

- Uma conta a pagar pode ser **rateada** entre N destinos (empreendimentos e/ou organização), por % ou valor fixo por destino — soma deve fechar 100%/valor total
- Modelos de rateio salvos (ex.: "Administrativo 50/30/20") pra reuso
- Todos os relatórios (fluxo de caixa, despesas por empreendimento, resultado) passam a considerar a fração rateada de cada destino — nunca o valor cheio duplicado
- Migração: contas existentes (destino único) continuam válidas como rateio de 100% num destino só

### 4.3 Contas a receber avulsas

Hoje todo recebível nasce de venda (carteira). Incluir lançamento de **recebível avulso** (ex.: taxa de cessão, aluguel de espaço, reembolso, rendimento) com: origem, cliente/pagador, categoria, empreendimento/SPE, vencimento, valor — entra no fluxo de caixa como entrada prevista/realizada. Mantém separado da carteira de vendas (não mistura com o motor de correção).

### 4.4 Fluxo de caixa refinado

- Visão mensal existente + **visão semanal e diária** (curto prazo operacional)
- Colunas: previsto × realizado × diferença; saldo acumulado projetado
- Composição: carteira a receber (corrigida) + recebíveis avulsos − contas a pagar (com rateio aplicado)
- Filtro por SPE / empreendimento / consolidado organização
- **Saldo inicial bancário por conta** (lançado manualmente por enquanto; a conciliação automática da Fase 2 alimentará sozinha): permite que o projetado parta do saldo real
- Exportação (xlsx) do fluxo detalhado

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Extrato do cliente (tela + PDF via template) | Maior valor imediato; base do futuro Portal do Cliente |
| 2 | Aging da carteira + histórico de cobrança (régua assistida) | Painel de gestão da inadimplência |
| 3 | Renegociação de parcelas | Mexe em carteira: testar cálculo do consolidado contra manual, como na Sprint 6-7 |
| 4 | Contas a pagar no padrão novo + anexo de NF | |
| 5 | Rateio de despesa entre empreendimentos | Regressão nos relatórios: nada pode somar duplicado |
| 6 | Recebíveis avulsos | |
| 7 | Fluxo de caixa refinado (visões, saldo inicial, exportação) | Depois de 5 e 6, que mudam sua composição |

Processo padrão: implementar → testar → mostrar → aprovar → seguir. Etapas 3 e 5 tocam dinheiro/relatórios: verificação matemática obrigatória contra cálculo manual.

## Parâmetros configuráveis (por empreendimento, salvo indicado)

- Desconto máximo sobre encargos em renegociação sem alçada; limites por faixa de alçada
- Prazo máximo de reparcelamento em acordo
- Dias para considerar "acordo quebrado" e comportamento (reativar condições originais: sim/não)
- Etapas e prazos da régua de cobrança
- Modelos de rateio (organização)
- Categorias de recebível avulso (organização)

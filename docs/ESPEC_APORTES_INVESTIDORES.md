# Especificação — Aportes de Investidores e Contas a Receber Consolidado (Incorpora / TSH Incorporadora)

Cobre o ciclo financeiro do investidor (aporte previsto × realizado, chamada de capital, devolução/distribuição, extrato) e consolida a visão de **Contas a Receber** da SPE, que passa a ter três origens: carteira de vendas (existente), recebíveis avulsos (Fase B) e **aportes de investidores** (este documento).

Contexto TSH: aportes entram **conforme necessidade/disponibilidade** (sem cronograma fixo contratual), mas a gestão precisa de **previsto × realizado** — a previsão nasce do planejamento de caixa, não de um calendário rígido. Chamada de capital formal **e** combinação informal coexistem: o sistema suporta os dois.

Conecta-se a: aba Investidores da SPE (`ESPEC_CADASTRO_SPE.md`), fluxo de caixa e contas bancárias (Fase B), motor de templates (Fase A), dashboard (Fase C), futuro painel do investidor (Fase 2 do roadmap).

---

## PARTE 1 — Estrutura do Investimento

### 1.1 Vínculo investidor ↔ SPE (já existe na aba Investidores — estender)

Estender o cadastro existente com o bloco financeiro:

| Campo | Tipo | Observação |
|---|---|---|
| Capital comprometido total (R$) | número | O quanto o investidor se comprometeu a aportar no total (pode ser aberto — "sem teto definido") |
| Modalidade | já existe (equity/mútuo/permuta...) | Mútuo pode ter juros — ver 1.2 |
| % participação no resultado | já existe | |
| Conta bancária de devolução do investidor | banco/agência/conta/Pix | Para onde vão as distribuições |

### 1.2 Condições de remuneração (por vínculo, conforme modalidade)

- **Equity:** participa do resultado (% já cadastrado) — distribuição na Parte 4
- **Mútuo:** principal + juros — taxa (% a.m./a.a.), correção opcional por índice (catálogo existente), carência, prazo. O sistema calcula o saldo devedor do mútuo (principal aportado + juros acumulados − devoluções) com memória de cálculo auditável, mesma filosofia da carteira
- Configurável por vínculo — um mesmo investidor pode ter equity numa SPE e mútuo em outra

---

## PARTE 2 — Aportes: Previsto × Realizado

### 2.1 Previsão de aportes

- Lançamento de **aportes previstos** por vínculo investidor↔SPE: valor + data prevista + origem da previsão (planejamento de caixa / acordo pontual / chamada de capital)
- Sem cronograma rígido: previsões são editáveis/canceláveis (com auditoria) — refletem o planejamento vivo, não um contrato
- A previsão alimenta o **fluxo de caixa projetado** como entrada futura (categoria "Aporte de investidor")
- Painel por SPE: total comprometido × total previsto × total realizado × % integralizado

### 2.2 Chamada de capital (formal — opcional por aporte)

- A partir de uma previsão (ou direto): "Gerar chamada de capital" → documento pelo motor de templates (modelo "Chamada de Capital": SPE, investidor, valor, prazo, dados bancários da SPE, finalidade) + registro com status: **Emitida → Atendida (total/parcial) → Vencida**
- Prazo de atendimento monitorado: chamada vencida sem aporte aparece em destaque no painel
- Aportes informais (sem chamada): registrados direto na Parte 2.3, opcionalmente vinculados a uma previsão

### 2.3 Registro do aporte realizado

| Campo | Obrigatório |
|---|---|
| Investidor / SPE | ✅ |
| Valor | ✅ |
| Data do crédito | ✅ |
| Conta bancária da SPE que recebeu | ✅ (vínculo com o cadastro central de contas — rastreio bancário) |
| Forma (TED/Pix/outro) | — |
| Vínculo com previsão e/ou chamada | — (aporte pode ser espontâneo) |
| Comprovante | anexo |

- Aporte realizado **baixa** a previsão vinculada (total/parcial — saldo remanescente continua previsto)
- Entra no fluxo de caixa **realizado** e no extrato do investidor
- Auditoria completa (quem registrou, quando)

---

## PARTE 3 — Devoluções e Distribuições (a saída)

- **Distribuição de resultado (equity):** lançamento por investidor (valor, data, competência/período a que se refere, conta de destino) — nesta fase o valor é informado manualmente (o cálculo automático de distribuição por % é o módulo de investidores da Fase 2 do roadmap; aqui registra-se o movimento)
- **Amortização/quitação de mútuo:** pagamento abate do saldo devedor calculado (principal+juros) — memória de cálculo registra a imputação (juros primeiro, depois principal — padrão, configurável)
- Ambos geram **conta a pagar** (categoria "Devolução a investidor" / "Distribuição de resultado"), passando pelo fluxo de aprovação normal do financeiro
- Aparecem no fluxo de caixa (saída prevista quando aprovada/programada; realizada quando paga)

---

## PARTE 4 — Extrato do Investidor

Tela consolidada por vínculo investidor↔SPE (padrão dos extratos de cliente/permutante):

- Resumo: comprometido, aportado (total), devolvido/distribuído, posição líquida; para mútuo: saldo devedor atualizado com memória
- Linha do tempo: previsões, chamadas (com status), aportes, devoluções — tudo em ordem cronológica
- Exportável em PDF (modelo "Extrato do Investidor" no motor de templates) — prestação de contas
- **Preparação Fase 2:** este extrato é exatamente o que o painel do investidor exibirá no portal — construído uma vez

Visão consolidada da SPE: todos os investidores, totais, % integralizado geral — e visão da organização (todas as SPEs).

---

## PARTE 5 — Contas a Receber Consolidado

Nova visão (menu Financeiro): **todas as entradas previstas e realizadas da SPE/organização em um lugar**, com origem identificada:

| Origem | Fonte |
|---|---|
| Carteira de vendas | existente (parcelas corrigidas) |
| Recebíveis avulsos | Fase B |
| Aportes de investidores | este documento |

- Filtros: origem, SPE, empreendimento, período, status (previsto/realizado/vencido)
- Totalizadores por origem e geral
- É a contraparte do Contas a Pagar — juntos alimentam o fluxo de caixa, que passa a discriminar as entradas por origem (venda × aporte × avulso) em vez de um bloco único
- **Regra de ouro dos relatórios:** aporte NÃO é receita — é funding. Relatórios de resultado (receita − despesa) não somam aportes; o fluxo de caixa sim (é entrada de caixa). Dashboards separam explicitamente "recebido de clientes" de "aportado por investidores"

---

## PARTE 6 — Impactos nos módulos (checklist)

| Módulo | Impacto |
|---|---|
| Fluxo de caixa | Entradas discriminadas por origem; aportes previstos/realizados; devoluções como saída |
| Contas a pagar | Categorias novas: devolução a investidor, distribuição de resultado |
| Dashboard (Fase C) | Bloco financeiro ganha: total aportado no período, % integralizado por SPE, aportes previstos próximos 90 dias; exposição de caixa considera aportes previstos como funding |
| Contas bancárias | Todo aporte/devolução vinculado a conta do cadastro central — base pra conciliação da Fase 2 |
| Motor de templates | Modelos: chamada de capital, extrato do investidor, recibo de aporte |
| SPE (aba Investidores) | Ganha os campos da Parte 1 e link pro extrato |

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Extensão do vínculo investidor↔SPE (comprometido, condições, conta de devolução) | |
| 2 | Aportes: previsão + registro realizado + baixa | Já entrega o previsto × realizado |
| 3 | Chamada de capital (documento + status + monitoramento) | Depende do motor de templates (Fase A) pro documento; sem ele, registrar sem PDF |
| 4 | Devoluções/distribuições + integração contas a pagar | |
| 5 | Motor de mútuo (juros/correção com memória) | Teste matemático obrigatório contra cálculo manual, rigor da Sprint 6-7 |
| 6 | Extrato do investidor + PDF | |
| 7 | Contas a Receber consolidado + fluxo de caixa discriminado por origem | Regressão: relatórios de resultado NÃO podem somar aporte como receita |

## Posição na fila geral

As etapas 1-2 (estrutura + previsto×realizado) podem entrar logo após o cadastro de SPE (complementam a aba Investidores recém-construída). As demais se encaixam junto da Fase B (financeiro), onde já se mexe em fluxo de caixa e contas a pagar. Fila sugerida atualizada: SPE → **aportes etapas 1-2** → Comercial + permuta visual → Fase A → Fase B + **aportes etapas 3-7** → permuta financeira → Fase C.

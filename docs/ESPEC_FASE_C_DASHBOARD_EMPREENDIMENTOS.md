# Especificação — FASE C: Visão Gerencial (Dashboard/Relatórios + Cadastro de Empreendimentos)

Refinamento do dashboard, dos relatórios e do cadastro de empreendimentos do Incorpora. Fecha o ciclo das três fases: com o comercial (Fase A) e o financeiro (Fase B) refinados, esta fase transforma os dados em visão executiva — e enriquece o cadastro do empreendimento com o que alimenta essa visão (fases de obra, evolução física, documentação legal).

Baseado em pesquisa dos KPIs padrão do setor (VGV, VSO, inadimplência da carteira, TIR/ROI, exposição de caixa — os indicadores que os stakeholders do setor acompanham) e nos painéis gerenciais dos sistemas de referência.

---

## PARTE 1 — Dashboard Executivo

### 1.1 Estrutura

Substitui o dashboard atual (contadores simples). Organizado em: **visão consolidada da organização** (padrão ao abrir) + **visão por empreendimento** (filtro no topo). Período de referência selecionável (mês atual, trimestre, 12 meses, personalizado).

### 1.2 Blocos do dashboard consolidado

**Bloco Comercial**
| Indicador | Definição |
|---|---|
| VGV total / vendido / disponível | Valor geral de vendas dos empreendimentos ativos |
| **VSO do período** | Vendas Sobre Oferta: unidades vendidas ÷ unidades ofertadas no período × 100 — o indicador de velocidade de vendas padrão do setor |
| Curva de vendas | Gráfico mensal: unidades vendidas + VGV vendido, últimos 12 meses |
| Ticket médio | Por empreendimento e consolidado |
| Funil comercial | Reservas ativas → propostas em análise → vendas no mês |
| Ranking de canais | Vendas por imobiliária/corretor no período |
| Distratos | Quantidade e valor no período; índice distrato/venda |

**Bloco Carteira**
| Indicador | Definição |
|---|---|
| Carteira total a receber (corrigida) | |
| Recebido no mês vs previsto | |
| **Inadimplência** | % da carteira vencida + valor; evolução mensal (gráfico) |
| Aging resumido | Mini-visão das faixas de atraso (link pro painel completo da Fase B) |
| Renegociações | Volume e taxa de cumprimento dos acordos |

**Bloco Financeiro**
| Indicador | Definição |
|---|---|
| Fluxo de caixa projetado | Gráfico: entradas − saídas + saldo acumulado, próximos 6 meses |
| Contas a pagar da semana/mês | |
| Resultado por empreendimento | Receita recebida − despesas pagas (regime de caixa), acumulado |
| **Exposição de caixa por empreendimento** | Ponto de maior necessidade de caixa projetada — o número que define funding |

**Bloco Obra** (alimentado pela Parte 3)
| Indicador | Definição |
|---|---|
| Evolução física por empreendimento | % concluído (última medição lançada) |
| Físico × Vendas | Curva comparada: % obra × % vendido — atraso relativo entre as duas é sinal de gestão |
| Marcos próximos | Habite-se previsto, entrega prevista |

### 1.3 Comportamento

- Todo número é clicável → leva ao relatório/tela de origem (drill-down)
- Cards com comparativo vs período anterior (▲▼ %)
- Visão por empreendimento: mesmos blocos filtrados + espelho de vendas resumido
- Permissões: papéis veem apenas os blocos compatíveis (ex.: corretor não vê financeiro; investidor vê só o resumo do empreendimento dele — preparação pro painel do investidor da Fase 2)

---

## PARTE 2 — Central de Relatórios

### 2.1 Estrutura

Tela única "Relatórios" com os relatórios organizados por grupo, cada um com: filtros próprios, visualização em tela (tabela no padrão de UI novo), **exportação xlsx e PDF** (PDF via motor de templates — cabeçalho com logo TSH, data de emissão, filtros aplicados).

### 2.2 Relatórios por grupo

**Comercial**
1. Mapa de vendas por empreendimento (unidades × status × valores)
2. Vendas por período (com canal, corretor, tabela usada, desconto aplicado)
3. Propostas do período (aprovadas/em análise/reprovadas — com motivo)
4. Reservas ativas e histórico
5. Comissões (por corretor/imobiliária, status de liberação/pagamento)
6. Distratos do período (com valores de retenção/devolução)

**Carteira**
7. Posição da carteira (por empreendimento/SPE, aberto × recebido × vencido)
8. Extrato consolidado de recebimentos do período
9. Inadimplência detalhada (aging por cliente, com histórico de cobrança)
10. Renegociações (acordos, condições, cumprimento)

**Financeiro**
11. Contas a pagar por período/fornecedor/centro de custo/empreendimento (com rateio)
12. Fluxo de caixa detalhado (previsto × realizado, por semana/mês)
13. Resultado por empreendimento (caixa)
14. Resumo executivo do empreendimento (o "relatório do investidor" existente, enriquecido com evolução de obra)

### 2.3 Relatórios agendados (preparação Fase 2)

Estrutura de agendamento (relatório + filtros + periodicidade + destinatários) criada agora, com geração manual ("Gerar agora"); o disparo automático por e-mail chega com a integração de comunicação da Fase 2.

---

## PARTE 3 — Cadastro de Empreendimentos Enriquecido

Aplicar o padrão de UI (modal/página com abas) e adicionar o conteúdo que hoje não existe:

### Aba 1 — Dados (existente, refinada)
Nome, SPE vinculada, tipo, endereço completo (padrão ViaCEP), datas-chave: lançamento, início de obra, **Habite-se previsto e real** (o real já existe — gatilho da correção), entrega prevista e real, tolerância contratual (default 180 dias — Lei 13.786/18). Auditoria padrão.

### Aba 2 — Registro e documentação legal
- **Registro de Incorporação (RI):** número, cartório, data — dado obrigatório em contrato de venda na planta (variável do motor de templates)
- Matrícula(s)-mãe do empreendimento (link com a aba Terrenos da SPE)
- Alvarás e licenças (construção, ambiental) com data de validade
- Anexos categorizados (memorial de incorporação, convenção de condomínio, NBR do memorial descritivo, seguro obra)
- Patrimônio de afetação (reflexo do que está na SPE — leitura, com link)

### Aba 3 — Fases e cronograma da obra
- Fases configuráveis (ex.: Fundação, Estrutura, Alvenaria, Instalações, Acabamento, Paisagismo — livres, com % de peso no total, somando 100%)
- Por fase: previsto (início/fim) × realizado
- **Medição de evolução física:** lançamento periódico (mensal) do % concluído por fase → o sistema calcula o % geral ponderado. Histórico completo das medições (data, quem lançou, observação, fotos opcionais como anexo)
- É o dado que alimenta o bloco Obra do dashboard e o relatório do investidor. Lançamento manual — integração com sistema de obra (ObrIA?) fica fora de escopo, mas o modelo de dados não deve impedi-la no futuro

### Aba 4 — Comercial (consolidação das configurações já especificadas)
Reúne num lugar só as configurações comerciais do empreendimento já definidas nas especs anteriores: parâmetros de reserva, disponibilização por imobiliária, parâmetros do motor de propostas (VPL, tolerâncias, limites), regra de correção (obra/pós-Habite-se), % retenção em distrato, regra de liberação de comissão. **Não recriar** — apenas centralizar o acesso ao que as outras especs definirem.

### Aba 5 — Unidades (existente, mantida)
Link para a gestão de unidades e espelho de vendas.

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Dependência |
|---|---|---|
| 1 | Cadastro de empreendimentos: abas Dados + Registro/documentação | — |
| 2 | Fases e cronograma + medição de evolução física | 1 |
| 3 | Dashboard executivo (blocos Comercial, Carteira, Financeiro) | Fases A/B implementadas (senão os números não existem) |
| 4 | Bloco Obra no dashboard (físico × vendas) | 2 |
| 5 | Central de relatórios (grupos + exportação xlsx/PDF) | 3 |
| 6 | Estrutura de relatórios agendados (geração manual) | 5 |

**Nota de dependência:** as etapas 3–6 pressupõem os dados das Fases A e B. Se esta fase for executada antes delas, implementar apenas 1–2 e voltar para 3–6 depois.

## Parâmetros configuráveis

- Fases de obra e pesos (por empreendimento)
- Metas comerciais opcionais (VSO alvo, vendas/mês) — se lançadas, o dashboard mostra real × meta
- Grupos/destinatários de relatórios agendados (organização)

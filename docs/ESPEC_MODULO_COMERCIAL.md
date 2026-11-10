# Especificação — Módulo Comercial Avançado (Incorpora / TSH Incorporadora)

Cobre: espelho de vendas visual (vertical e loteamento), regras de reserva, disponibilização por imobiliária, tabelas de venda padrão, destino da entrada (SPE vs corretor) e módulo de avaliação automática de propostas.

Baseado em pesquisa dos padrões de mercado (Sienge, ERP UAU/Globaltec, CV CRM, App Facilita — o "Espelho de Vendas"/"Mapa de Disponibilidade" é funcionalidade central em todos) e em critérios financeiros padrão de análise de fluxo (VPL/taxa de desconto).

---

## PARTE 1 — Espelho de Vendas (Mapa de Disponibilidade Visual)

### 1.1 Conceito

Tela visual que apresenta todas as unidades do empreendimento com status por cor, atualização em tempo real, e ação de reserva direto no mapa. É a ferramenta que elimina o principal problema operacional do mercado: reserva duplicada (dois corretores negociando a mesma unidade ao mesmo tempo).

### 1.2 Cores de status (padrão em todo o sistema)

| Status | Cor | Observação |
|---|---|---|
| Disponível | 🟢 Verde | Clicável → inicia reserva |
| Reservada | 🟡 Amarelo | Mostra corretor/validade da reserva ao passar o mouse |
| Em proposta | 🟠 Laranja | Proposta em análise/aprovação |
| Vendida | 🔴 Vermelho | |
| Bloqueada | ⚫ Cinza | Bloqueio administrativo (permuta, caução, jurídico, reserva técnica) |

Usar tons acessíveis (que funcionem também pra daltônicos — reforçar com ícone ou letra dentro da célula, não só cor).

### 1.3 Visualização VERTICAL (ex.: TSH Laguna)

Grade tipo "prédio": **linhas = pavimentos** (do último andar no topo ao térreo embaixo), **colunas = posição da unidade no andar** (finais 01–06).

```
27º  [PH1]  [PH2]  [PH3]
26º  [2601][2602][2603][2604][2605][2606]
25º  [2501][2502][2503][2504][2505][2506]
...
4º   [401] [402] [403] [404] [405] [406]
```

- Cada célula colorida pelo status, mostrando o número da unidade
- Clique na célula → painel lateral (ou popover) com: tipologia, área, vagas vinculadas, preço de tabela vigente, status detalhado, e botão de ação conforme o status (Reservar / Ver reserva / Ver venda)
- Filtros acima da grade: tipologia, status, faixa de preço
- Contadores no topo: total / disponíveis / reservadas / vendidas / bloqueadas + % vendido e VGV disponível

### 1.4 Visualização LOTEAMENTO (ex.: Lake House)

Duas visões, alternáveis:

**a) Grade por quadra** (implementar primeiro — não depende de arquivo de mapa):
Uma seção por quadra, lotes como células coloridas na mesma lógica do vertical.
```
QUADRA 01   [L01][L02][L03]...[L15]
QUADRA 02   [L01][L02]...[L23]
...
```

**b) Mapa real do loteamento** (segunda etapa):
- Upload da planta/implantação do loteamento (imagem ou SVG) em Configurações do empreendimento
- Sobre a imagem, demarcar cada lote como área clicável (polígono), vinculada à unidade no sistema — ferramenta de "mapear lote" arrastando/clicando sobre a planta
- O mapa colore cada polígono pelo status em tempo real, igual à grade
- Zoom e navegação na imagem
- Padrão de mercado: CV CRM e similares fazem exatamente isso (pin/área por lote sobre a planta cadastrada)

**Nota de escopo:** a visão (a) resolve 100% da operação; a (b) é a experiência premium para lançamentos. Implementar (a) primeiro, (b) como etapa separada.

### 1.5 Tempo real

Qualquer mudança de status (reserva criada, expirada, proposta aprovada, venda) reflete no espelho imediatamente para todos os usuários — sem precisar recarregar a página (polling curto ou websocket, decisão técnica do desenvolvedor).

---

## PARTE 2 — Regras de Reserva

Parametrizáveis **por empreendimento** (Configurações do empreendimento):

| Parâmetro | Tipo | Padrão sugerido |
|---|---|---|
| Prazo de validade da reserva | horas/dias | 48h |
| Máximo de reservas ativas por corretor (por empreendimento) | número | 3 |
| Máximo de reservas simultâneas por unidade | fixo: 1 | A reserva é exclusiva — nunca duas ativas na mesma unidade |
| Fila de espera por unidade reservada | sim/não | Sim — corretor entra na fila; se a reserva expirar/cair, o primeiro da fila é notificado e tem X horas de prioridade |
| Prioridade da fila (prazo pra converter) | horas | 24h |
| Renovação de reserva | permitida? quantas vezes? | 1 renovação, mediante aprovação do gerente comercial |
| Quem pode reservar | papéis | Corretor, Gerente comercial, Diretor |
| Reserva exige cliente identificado? | sim/não | Sim (nome + CPF mínimo) — evita "estocar" unidade sem lead real |

**Comportamentos:**
- Expiração automática libera a unidade e notifica o corretor (e o primeiro da fila, se houver)
- Toda reserva registra: corretor, imobiliária, cliente, data/hora, validade — trilha de auditoria completa
- Gerente comercial pode cancelar reserva manualmente (com motivo registrado)
- Conversão em proposta "congela" a reserva (não expira enquanto a proposta está em análise)

---

## PARTE 3 — Disponibilização de Unidades por Imobiliária

Controle de **quais unidades cada imobiliária pode ver e reservar**:

- **Padrão do empreendimento:** todas as unidades disponíveis para todas as imobiliárias ativas (modo aberto), OU modo restrito (só o que for explicitamente liberado)
- **Liberação por lote de unidades:** selecionar unidades (ou andares/quadras inteiros) e liberar para uma ou mais imobiliárias, com vigência opcional (de/até) — padrão de lançamento por fases
- **Exclusividade temporária:** marcar um conjunto de unidades como exclusivo de uma imobiliária por período (comum em parcerias de lançamento)
- No espelho de vendas, o corretor de uma imobiliária **só vê como disponíveis** as unidades liberadas para a imobiliária dele; as demais aparecem como indisponíveis (sem revelar status real — evita constrangimento comercial)
- Auditoria: quem liberou o quê, pra quem, quando

---

## PARTE 4 — Tabelas de Venda Padrão

Evolução do módulo de tabelas existente (Sprint 3-4 do V1):

### 4.1 Estrutura da tabela padrão

Por empreendimento, com vigência (de/até) e status (Ativa/Inativa). Componentes do fluxo:

| Componente | Parâmetros |
|---|---|
| Entrada (ato) | % do valor ou valor fixo; nº de parcelas da entrada (1–N); vencimentos |
| Parcelas mensais | quantidade, valor ou %, primeiro vencimento |
| Balões/intermediárias | quantidade, periodicidade (semestral/anual/customizada), valor ou % |
| Parcela de chaves/financiamento | % ou valor, vinculada à entrega |
| Correção | herda a regra do empreendimento (INCC até Habite-se → índice pós-entrega), já implementada |
| Desconto máximo permitido | % — acima disso entra no fluxo de alçada existente |
| Comissão | % total e regra de split (já existente) |

### 4.2 Destino da entrada — NOVO

Campo na tabela de venda (e sobrescrevível por venda, com permissão):

**"Destino do valor de entrada":**
- ( ) Conta da SPE — entrada compõe o fluxo normal da carteira
- ( ) Pagamento direto ao corretor/imobiliária (a entrada É a comissão) — prática de mercado onde o ato fica com o corretor como comissão

**Implicações no sistema (importante para o financeiro):**
- Se "direto ao corretor": a(s) parcela(s) de entrada NÃO entram na carteira de recebíveis da SPE; são registradas como "comissão recebida diretamente pelo corretor", abatendo da comissão total devida. Se a entrada for menor que a comissão total, o saldo permanece a pagar pela SPE; se for maior, o excedente é lançado como crédito à SPE
- O contrato e o extrato do cliente mostram o valor pago normalmente (o cliente pagou, independente do destino)
- Relatórios de carteira e VGV devem tratar corretamente os dois cenários (não somar como receita da SPE o que foi direto pro corretor)

---

## PARTE 5 — Módulo de Avaliação Automática de Propostas

### 5.1 Conceito

O corretor monta uma **contra-proposta de fluxo** para um cliente específico (entrada diferente, mais parcelas, valores diferentes, balões em outras datas) e o sistema **avalia automaticamente** contra a tabela padrão, respondendo na hora: **Aprovada automaticamente / Requer aprovação (alçada) / Recusada** — com justificativa numérica.

### 5.2 Motor de análise — parâmetros

O critério central é comparar o **valor presente (VPL)** do fluxo proposto contra o VPL do fluxo da tabela padrão para a mesma unidade, usando uma taxa de desconto configurada. Dinheiro no tempo: R$ 100 mil daqui a 5 anos vale menos que R$ 100 mil hoje.

**TODOS os parâmetros são configuráveis POR EMPREENDIMENTO** (tela de Configurações do próprio empreendimento, aba Comercial). Não há valores globais fixos — cada empreendimento tem sua política: um pode aceitar condições flexíveis, outro pode ter tolerância zero (sócios não aceitam desconto nenhum).

| Parâmetro | Descrição | Exemplo |
|---|---|---|
| Aceita proposta fora da tabela? | sim/não — se "não", só se vende pela tabela padrão; o simulador fica desabilitado ou tudo que desvia é reprovado direto | sim |
| Taxa de desconto (a.m. ou a.a.) | Custo de oportunidade do dinheiro da SPE (TMA). Referências possíveis: CDI, custo do financiamento da obra, meta de retorno | 1,0% a.m. |
| Tolerância de VPL para aprovação automática | Proposta com VPL ≥ (VPL tabela − X%) aprova sozinha. Tolerância 0% = tudo que desviar vai pra análise | 3% |
| Limite de deságio para análise | Entre a tolerância e este limite → vai pro gestor analisar; abaixo dele → reprovada automaticamente | 10% |
| Entrada mínima (%) | Proposta abaixo disso é REPROVADA automaticamente (limite duro) | 10% |
| Prazo máximo total (meses) | Fluxo além disso é REPROVADO automaticamente (limite duro) | 120 |
| % máximo pós-chaves | Acima disso é REPROVADO automaticamente (limite duro) | 30% |
| Quem analisa as propostas pendentes | papel/usuários com alçada de aprovação neste empreendimento | Gestor comercial |
| Exposição de caixa | (Avançado, opcional) verificar se o fluxo proposto mantém o caixa do empreendimento dentro da curva aceitável durante a obra | — |

**Resultado da análise — exatamente 3 status possíveis:**

| Status | Quando | O que acontece |
|---|---|---|
| ✅ **APROVADA** | Dentro da tolerância de VPL e de todos os limites do empreendimento | Vira proposta formal na hora, sem intervenção humana |
| 🟡 **AGUARDANDO ANÁLISE DO GESTOR COMERCIAL** | Fora da tolerância, mas dentro do limite de deságio e sem violar limites duros | Entra no **módulo de aprovação de propostas**, visível apenas para usuários com alçada configurada naquele empreendimento; a análise numérica completa acompanha a proposta |
| ❌ **REPROVADA** | Viola qualquer limite duro (entrada mínima, prazo máximo, % pós-chaves, deságio acima do limite, ou empreendimento não aceita fora da tabela) | Recusada na hora, com o motivo exato exibido ao corretor — nem entra na fila de análise |

Exemplos de saída ao corretor:

```
VPL tabela padrão:      R$ 612.400
VPL fluxo proposto:     R$ 597.900   (−2,4% | tolerância 3%)
Entrada:                12% ✓ (mín. 10%)
Prazo total:            96 meses ✓ (máx. 120)
→ ✅ APROVADA
```

```
VPL fluxo proposto:     −5,1% vs tabela (tolerância 3%, limite 10%)
→ 🟡 AGUARDANDO ANÁLISE DO GESTOR COMERCIAL
   Enviada para o módulo de aprovação.
```

```
Entrada proposta:       6% (mín. exigido: 10%)
→ ❌ REPROVADA — entrada abaixo do mínimo do empreendimento
```

**Módulo de aprovação de propostas:** fila das propostas em "Aguardando análise", visível só pra quem tem alçada no empreendimento. Cada item mostra o comparativo numérico completo (VPL tabela vs proposto, todos os checks), o histórico da negociação e as ações Aprovar / Reprovar (com motivo). Decisão notifica o corretor. Reaproveita a infraestrutura do fluxo de aprovação por alçada da Sprint 3-4.

### 5.3 Fluxo do corretor

1. No espelho, unidade reservada → "Simular proposta"
2. Parte da tabela padrão pré-carregada; edita entrada, parcelas, balões, valores
3. O sistema recalcula VPL e verificações em tempo real conforme edita (feedback imediato, antes de submeter)
4. Submete → aprovação automática vira proposta formal na hora; alçada segue o fluxo de aprovação já existente (Sprint 3-4), com a análise numérica anexada pra quem aprova decidir com dado
5. Toda simulação fica registrada (auditoria) — inclusive as não submetidas por N dias (histórico de negociação)

### 5.4 Reaproveitamento

- O simulador de fluxo da proposta já existe (Sprint 3-4) — este módulo o estende com o motor de VPL e as regras de aprovação automática
- O fluxo de alçada já existe — a novidade é a faixa automática (dentro da tolerância) e o critério por VPL em vez de só % de desconto nominal
- A correção por índices em duas fases já existe e deve ser considerada no cálculo do fluxo nominal antes do desconto a valor presente

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Dependências |
|---|---|---|
| 1 | Espelho de vendas vertical + cores/status + ação de reserva no mapa | — |
| 2 | Espelho loteamento em grade por quadra | 1 |
| 3 | Regras de reserva parametrizáveis + fila de espera | 1 |
| 4 | Disponibilização por imobiliária | 1, 3 |
| 5 | Tabelas de venda: destino da entrada (SPE vs corretor) + impactos no financeiro | — |
| 6 | Motor de avaliação de propostas (VPL + regras + aprovação automática) | 5 |
| 7 | Mapa real do loteamento (upload de planta + polígonos clicáveis) | 2 |

Cada etapa segue o processo padrão do projeto: implementar → testar (com verificação matemática no caso do motor de VPL, batendo contra cálculo manual como foi feito na carteira) → mostrar → aprovar → seguir.

## Nota sobre parametrização

Nenhum parâmetro financeiro é decisão global de projeto: **tudo é configurável por empreendimento** dentro do sistema (taxa de desconto, tolerância, limites duros, quem aprova, e até se o empreendimento aceita proposta fora da tabela). Os valores citados nos exemplos são apenas defaults sugeridos de preenchimento inicial — a TSH define os reais em cada empreendimento, direto na tela de configuração, sem depender de desenvolvimento.

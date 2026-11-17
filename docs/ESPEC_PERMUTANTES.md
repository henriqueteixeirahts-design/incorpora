# Especificação — Gestão de Permutantes (Incorpora / TSH Incorporadora)

Módulo de gestão de permuta de terreno: **permuta física** (terrenista recebe unidades do empreendimento) e **permuta financeira** (terrenista recebe percentual sobre vendas/recebimentos), com todos os parâmetros configuráveis por contrato de permuta.

Impacto em cascata nos módulos existentes/especificados: espelho de vendas, carteira, comissões, contas a pagar, fluxo de caixa, relatórios e dashboard. Este documento define o módulo e os pontos de integração.

Conecta-se a: aba Terrenos da SPE (`ESPEC_CADASTRO_SPE.md` — forma de aquisição "permuta"), aba Investidores (modalidade permuta), espelho de vendas (`ESPEC_MODULO_COMERCIAL.md`), distrato/carteira (`ESPEC_FASE_A/B`).

---

## PARTE 1 — Cadastro do Contrato de Permuta

### 1.1 Onde mora

Novo objeto **Contrato de Permuta**, vinculado a: empreendimento + terreno (da aba Terrenos da SPE) + permutante (cadastro de pessoa — reaproveita o padrão de Clientes: PF/PJ, CPF/CNPJ validado, contato obrigatório, endereço ViaCEP, auditoria).

Um empreendimento pode ter **múltiplos contratos de permuta** (mais de um terrenista, ou terrenista com parte física e parte financeira — nesse caso, dois contratos ou um contrato misto, ver 1.3).

### 1.2 Campos gerais do contrato

| Campo | Tipo | Obrigatório |
|---|---|---|
| Permutante | vínculo com cadastro de pessoa | ✅ |
| Empreendimento | vínculo | ✅ |
| Terreno(s) objeto da permuta | vínculo (aba Terrenos da SPE) | ✅ |
| Tipo | Física / Financeira / Mista | ✅ |
| Valor de avaliação do terreno | R$ | — |
| Data do contrato | data | ✅ |
| Documento do contrato | anexo (+ geração por modelo via motor de templates) | — |
| Observações | texto | — |
| Status | Ativo / Quitado / Encerrado | ✅ |

Auditoria padrão (criado/alterado por/quando).

### 1.3 Permuta mista

Contrato do tipo "Mista" combina as duas seções abaixo (unidades destacadas + % financeiro) no mesmo contrato — os parâmetros de cada parte são independentes.

---

## PARTE 2 — Permuta FÍSICA

### 2.1 Destaque de unidades

- No contrato de permuta: selecionar as unidades do empreendimento que pertencem ao permutante (a partir do espelho — só unidades ainda Disponíveis podem ser destacadas)
- Unidades destacadas ganham marcação **"Permutante: [nome]"** e um novo atributo de propriedade: `SPE` (padrão) ou `PERMUTANTE`

### 2.2 Opção de gestão comercial — por contrato

Campo no contrato: **"Gestão de vendas das unidades pelo sistema/incorporadora?"**

**(a) SIM — incorporadora gerencia a venda:**
- Unidades do permutante permanecem no espelho de vendas com **badge visual distinto** (ex.: canto marcado "P"), participando do fluxo comercial normal: reserva → proposta → venda → contrato → carteira
- **Taxa de administração/comercialização: configurável por contrato** — % sobre o valor da venda (ou sobre cada recebimento), retida pela SPE no repasse
- A receita dessas vendas **não é receita da SPE**: entra como **repasse ao permutante** — a carteira recebe do cliente normalmente, e cada recebimento gera automaticamente um valor a repassar = recebido − taxa de administração − retenção (ver 2.3)
- VGV/dashboards: unidades do permutante NÃO compõem o VGV da SPE; aparecem em indicador separado ("VGV permutante sob gestão"). Relatórios comerciais podem incluí-las com o marcador, mas relatórios financeiros da SPE só contam a taxa de administração como receita própria
- Comissão de corretagem sobre venda de unidade do permutante: parametrizar de quem sai (do permutante — descontada do repasse — ou da SPE)

**(b) NÃO — permutante vende por fora:**
- Unidades saem do funil comercial: status fixo **"Permutante — fora de gestão"** (cor própria no espelho, ex. roxo/lilás), não reserváveis, não compõem VGV nem estoque disponível
- A incorporadora pode registrar manualmente a informação de "vendida pelo permutante" (apenas informativo, para o mapa refletir a realidade do prédio — sem contrato/carteira no sistema)
- Conversível: o contrato pode mudar de (b) pra (a) — ou vice-versa para unidades ainda não vendidas — com auditoria

### 2.3 Retenção durante a obra (física sob gestão)

- Parâmetro do contrato: **% de retenção sobre cada repasse** durante a obra, como garantia
- Evento de liberação configurável: Habite-se / entrega / data fixa / medição de obra ≥ X%
- O sistema acumula o saldo retido por contrato e, no evento de liberação, gera o valor a pagar da liberação (contas a pagar)

---

## PARTE 3 — Permuta FINANCEIRA

### 3.1 Parâmetros do contrato (tudo configurável)

| Parâmetro | Opções |
|---|---|
| **Base de cálculo do %** | ( ) Sobre o **recebido** dos clientes (regime caixa) ( ) Sobre o **vendido** (VGV contratado — gera obrigação no ato da venda) — os dois modelos existem na TSH |
| % do permutante | número (ex.: 15%) |
| Incidência | Todas as unidades / unidades específicas / até atingir valor-teto (R$ X e encerra) |
| **Fluxo de repasse** | ( ) Conforme recebimento (espelhado no caixa) ( ) Consolidado mensal (apuração do mês, pago dia D) ( ) Por marcos (ex.: X% na venda de N% das unidades, Y% no Habite-se) |
| **Retenção durante a obra** | % retido de cada repasse + evento de liberação (Habite-se / entrega / data / medição ≥ X%) |
| Dedução de encargos | Configurar se o % incide sobre valor bruto ou líquido de (comissões / impostos / taxa de administração) — checkboxes |
| Correção do valor retido | Sim/não + índice (pode usar o catálogo de índices existente) |

### 3.2 Motor de apuração

- **Base "recebido":** a cada recebimento de carteira (das unidades na incidência), o sistema calcula a parcela do permutante (% × base líquida configurada), acumula na apuração do período conforme o fluxo de repasse, aplica retenção, e gera o valor a repassar
- **Base "vendido":** a cada venda contratada, gera a obrigação total do permutante sobre aquela venda; o cronograma de pagamento dessa obrigação segue o fluxo de repasse configurado (não necessariamente casado com o recebimento do cliente — risco de descasamento é decisão comercial do contrato, o sistema só reflete)
- Distrato de venda na incidência: estorno/ajuste da obrigação do permutante conforme a base (no "recebido", cessa e ajusta retenções; no "vendido", gera crédito/débito de acerto) — regra explícita na memória de apuração
- **Memória de apuração auditável** por período: mesma filosofia da carteira — cada apuração registra base, contas, deduções, retenção, valor final; nunca sobrescreve

### 3.3 Integração com o financeiro

- Cada repasse apurado → **conta a pagar** gerada automaticamente (fornecedor = permutante, categoria "Repasse de permuta", empreendimento vinculado) entrando no fluxo de aprovação normal do contas a pagar
- Saldo retido: passivo visível (relatório e extrato do permutante), liberação gera a conta a pagar correspondente no evento
- Fluxo de caixa projetado considera os repasses futuros previstos (saída projetada)

---

## PARTE 4 — Extrato do Permutante

Tela consolidada por contrato de permuta (análoga ao extrato do cliente da Fase B):

- **Física sob gestão:** unidades destacadas + status de cada uma; vendas realizadas; recebimentos dos clientes; taxa de administração retida; retenções; repasses efetuados; saldo a repassar
- **Financeira:** apurações por período (com memória), retenções acumuladas, repasses pagos, saldo
- Exportável em PDF (motor de templates — modelo "Demonstrativo do Permutante") — é o documento de prestação de contas ao terrenista
- Futuramente (Fase 2 do roadmap): esse extrato vira o painel do permutante no portal, mesmo padrão do investidor

---

## PARTE 5 — Impactos nos módulos existentes (checklist de integração)

| Módulo | Impacto |
|---|---|
| Espelho de vendas | Badge "P" nas unidades de permutante sob gestão; status/cor próprios para "fora de gestão"; filtro por propriedade (SPE/permutante) |
| Carteira | Recebimento de unidade de permutante dispara cálculo de repasse; relatórios de carteira separam receita própria × repasse |
| VGV/dashboard | VGV da SPE exclui unidades do permutante; indicador separado "VGV permutante"; exposição de caixa considera repasses projetados |
| Contas a pagar | Categoria "Repasse de permuta"; geração automática a partir das apurações |
| Distrato | Venda de unidade sob permuta distratada → ajuste automático na apuração do permutante |
| Relatório do investidor/empreendimento | Seção de permuta (obrigações, retenções, repasses) |
| Motor de templates | Modelos: contrato de permuta, demonstrativo do permutante |

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Cadastro do contrato de permuta + permutante (pessoa) | Base |
| 2 | Permuta física: destaque de unidades + modo "fora de gestão" no espelho | Visual primeiro, sem dinheiro |
| 3 | Permuta física sob gestão: repasse por recebimento + taxa de administração + retenção | Mexe em carteira/financeiro: teste matemático obrigatório contra cálculo manual |
| 4 | Permuta financeira: motor de apuração (as duas bases) + fluxos de repasse + retenção | Módulo mais complexo — mesmo rigor da Sprint 6-7 (asserções batendo centavo a centavo) |
| 5 | Extrato do permutante + PDF | |
| 6 | Integrações restantes do checklist (dashboard, distrato, relatórios) | Regressão completa ao final |

**Dependências:** etapas 3-4 dependem do extrato/carteira da Fase B e do motor de templates da Fase A para os demonstrativos. A etapa 2 pode ser feita junto com o espelho de vendas do `ESPEC_MODULO_COMERCIAL.md` (mesma tela).

## Posição na fila geral sugerida

Espelho de vendas (Comercial) → **etapas 1-2 daqui (parte visual da permuta, junto do espelho)** → Fase A → Fase B → **etapas 3-6 daqui (parte financeira da permuta)** → Fase C. Assim a permuta visual nasce junto com o espelho (evita retrabalho na mesma tela) e a permuta financeira chega quando carteira/templates já estiverem prontos.

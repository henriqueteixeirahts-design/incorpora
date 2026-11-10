# Especificação — FASE A: Ciclo da Venda (Contratos + Vendas/Comissões)

Refinamento dos módulos de Contratos e Vendas/Comissões do Incorpora, cobrindo o ciclo completo: venda fechada → contrato gerado → assinado → carteira criada → comissões pagas, mais os eventos posteriores do contrato (aditivo, cessão de direitos, distrato).

Baseado em pesquisa de mercado (padrões dos ERPs de incorporação: geração de minuta a partir de modelos pré-definidos, gestão do ciclo contratual, e as exigências da Lei do Distrato — Lei 13.786/18) e nas referências visuais do Obra Prima já levantadas.

Pré-requisitos já existentes no sistema: ciclo de contrato DRAFT → AWAITING_SIGNATURE → SIGNED (Sprint 5), upload de contrato assinado via Supabase Storage, carteira automática a partir da venda, comissões com split (Sprint 3-4), padrão de UI aprovado (modal com abas, lista com filtros).

---

## PARTE 1 — Motor de Templates de Documento

### 1.1 Conceito

Biblioteca de **modelos de documento** configuráveis (em Configurações → Documentos), com variáveis que o sistema preenche automaticamente com os dados da venda/contrato. Resolve a pendência aberta desde a Sprint 5 (hoje a minuta só preenche dados na tela, sem gerar documento formatado).

### 1.2 Tipos de modelo

| Tipo | Uso |
|---|---|
| Contrato de compra e venda / promessa | Documento principal da venda |
| Cessão de direitos | Transferência do contrato a outro comprador |
| Distrato | Rescisão com devolução conforme regras |
| Aditivo contratual | Alterações (renegociação de fluxo, mudança de unidade, prazo) |
| Procuração / declaração / outros | Livre |

Cada modelo: nome, tipo, empreendimento(s) aplicáveis (ou todos), versão, status (Ativo/Inativo), data de vigência. **Versões antigas nunca são apagadas** — contrato gerado guarda referência à versão exata usada (rastreabilidade jurídica).

### 1.3 Editor de modelo

- Editor de texto rico (ou upload de .docx modelo) com **variáveis** no formato `{{variavel}}`
- Catálogo de variáveis disponíveis exibido ao lado do editor, por grupo:
  - **Cliente:** `{{cliente.nome}}`, `{{cliente.cpf_cnpj}}`, `{{cliente.endereco_completo}}`, `{{cliente.estado_civil}}`, `{{cliente.nacionalidade}}`, `{{cliente.profissao}}`...
  - **SPE:** `{{spe.razao_social}}`, `{{spe.cnpj}}`, `{{spe.endereco}}`, `{{spe.representante}}`...
  - **Empreendimento:** `{{empreendimento.nome}}`, `{{empreendimento.endereco}}`, `{{empreendimento.matricula}}`, `{{empreendimento.registro_incorporacao}}`...
  - **Unidade:** `{{unidade.identificacao}}`, `{{unidade.area}}`, `{{unidade.vagas}}`, `{{unidade.fracao_ideal}}`...
  - **Venda/fluxo:** `{{venda.valor_total}}`, `{{venda.valor_extenso}}`, `{{fluxo.entrada}}`, `{{fluxo.parcelas_tabela}}` (tabela formatada do fluxo completo), `{{fluxo.indice_obra}}`, `{{fluxo.indice_pos_chaves}}`...
  - **Quadro-resumo:** `{{quadro_resumo}}` — bloco pronto exigido pela Lei 13.786/18 (preço, forma de pagamento, índice de correção, comissão de corretagem destacada, prazo de entrega com tolerância de 180 dias, penalidades)
- Pré-visualização com dados de uma venda real de teste

### 1.4 Geração do documento

- Na tela da venda: "Gerar documento" → escolhe o modelo → sistema preenche as variáveis → gera **PDF formatado** (e opcionalmente .docx editável para ajustes finos do jurídico antes da versão final)
- Documento gerado fica anexado ao contrato com: modelo usado + versão, quem gerou, quando
- Se algum dado obrigatório do modelo estiver vazio no cadastro (ex.: estado civil do cliente), avisar ANTES de gerar, listando o que falta — não gerar documento com lacunas `{{}}`

---

## PARTE 2 — Ciclo de Vida do Contrato (ampliado)

### 2.1 Status ampliados

```
RASCUNHO → EM ASSINATURA → ASSINADO → [VIGENTE]
                                        ├── ADITADO (aditivos anexos, continua vigente)
                                        ├── CEDIDO (cessão de direitos → novo titular)
                                        ├── QUITADO (carteira 100% recebida)
                                        └── DISTRATADO (rescindido)
```

### 2.2 Aditivo

- Criado a partir do contrato vigente: tipo (renegociação de fluxo / alteração de unidade / prazo / outro), documento gerado por modelo, numeração sequencial vinculada (`CT-2026-0001-AD01`)
- **Renegociação de fluxo:** ao assinar o aditivo, a carteira é reprogramada (parcelas futuras substituídas pelo novo fluxo; recebidas permanecem intactas; memória de cálculo preserva o histórico — nunca apagar parcelas pagas)
- Trilha completa: contrato mostra a lista de aditivos com datas e documentos

### 2.3 Cessão de direitos

- Fluxo: contrato vigente → "Ceder direitos" → seleciona novo cliente (cadastro completo com as validações padrão) → gera documento de cessão pelo modelo → assinaturas → titularidade transferida
- A carteira muda de titular a partir da data da cessão; extrato do cedente é encerrado com o histórico preservado; taxas de cessão (se houver) lançadas no financeiro
- Auditoria completa de quem era e quem passou a ser o titular

### 2.4 Distrato

Conforme Lei 13.786/18 (Lei do Distrato):

- Fluxo: contrato vigente → "Iniciar distrato" → o sistema calcula automaticamente o acerto:
  - Total pago pelo cliente (da carteira, valores corrigidos)
  - **Retenção da incorporadora:** % configurável por empreendimento (a lei permite até 25% do valor pago, ou até 50% quando o empreendimento tem patrimônio de afetação — parametrizar, não fixar)
  - Deduções adicionais configuráveis: comissão de corretagem, taxas de fruição/ocupação se houve entrega
  - **Valor a devolver** e prazo/forma de devolução (parcela única ou parcelado — campos livres pro acordo)
- Gera o documento de distrato pelo modelo, com o demonstrativo do acerto
- Ao concluir: unidade **volta a Disponível** no espelho de vendas, carteira encerrada (parcelas futuras canceladas, histórico preservado), comissões tratadas conforme regra (estorno configurável), devolução lançada como conta a pagar no financeiro
- Relatório de distratos no período (índice venda/distrato é métrica de mercado acompanhada pela Abrainc)

---

## PARTE 3 — Tela de Vendas refinada

### 3.1 Lista de vendas (padrão de UI novo)

Colunas: nº da venda, cliente, empreendimento, unidade, valor, data, status do contrato, status da carteira (em dia / inadimplente), corretor/imobiliária. Filtros por todos; exportação.

### 3.2 Detalhe da venda — **linha do tempo**

Visão cronológica única do processo inteiro (o "dossiê" da venda):

```
● Reserva criada          12/03 — corretor João (Imob. X)
● Proposta #2 aprovada    15/03 — automática (VPL −1,8%)
● Venda registrada        15/03
● Contrato gerado         16/03 — modelo "CCV Padrão v3"
● Enviado p/ assinatura   16/03
● Assinado                22/03 — PDF anexado
● Carteira criada         22/03 — 96 parcelas
● 1º recebimento          10/04 — R$ 45.000
● Aditivo AD01            10/08 — renegociação de fluxo
```

Cada evento clicável leva ao registro correspondente. Alimentada pelo `DevelopmentEvent` (já registra tudo — é exibição, não infraestrutura nova).

### 3.3 Abas do detalhe da venda

| Aba | Conteúdo |
|---|---|
| Resumo | Dados principais + linha do tempo |
| Fluxo de pagamento | Fluxo contratado + link pra carteira/extrato |
| Contrato | Status, documentos gerados/anexados, aditivos, ações (gerar documento, ceder, distratar) |
| Comissões | Detalhamento (ver Parte 4) |
| Documentos | Todos os anexos da venda (RG/CPF do cliente, comprovantes, etc.) |

---

## PARTE 4 — Comissões refinadas

### 4.1 Por venda (aba Comissões do detalhe)

- Demonstrativo: comissão total (% e R$), split completo (corretor, imobiliária, coordenador, gerente, campanha — já existente), destino da entrada quando "direto ao corretor" (abatimento demonstrado, integração com a espec do Módulo Comercial)
- Status por parcela de comissão: A liberar / Liberada / Paga — com regra de liberação configurável por empreendimento (ex.: libera na assinatura do contrato / no recebimento da entrada / % após N parcelas pagas — parametrizar)
- Estorno em caso de distrato conforme regra configurável

### 4.2 Extrato por corretor/imobiliária

- Tela consolidada: filtro por corretor ou imobiliária + período → todas as comissões (vendas, valores, status), totais a liberar/liberadas/pagas
- Exportável — é o demonstrativo que se envia ao parceiro
- Pagamento de comissão lançado integra com Contas a pagar (fornecedor = corretor/imobiliária), sem duplo lançamento manual

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Motor de templates (biblioteca de modelos + variáveis + geração de PDF) | Destrava a pendência mais antiga; começar com o modelo de contrato de compra e venda |
| 2 | Tela de vendas refinada (lista + detalhe com linha do tempo + abas) | Base visual pro resto |
| 3 | Comissões refinadas (regra de liberação + extrato por parceiro + integração contas a pagar) | |
| 4 | Aditivo (documento + reprogramação de carteira) | Testar a reprogramação com o rigor da carteira (cálculo manual) |
| 5 | Cessão de direitos | |
| 6 | Distrato (cálculo do acerto + devolução no financeiro + unidade liberada) | Retenção parametrizável por empreendimento; testar o cálculo contra exemplos manuais |

Processo padrão: implementar → testar → mostrar → aprovar → seguir. Etapas 4 e 6 mexem em carteira/dinheiro: exigem verificação matemática contra cálculo manual, como na Sprint 6-7.

## Parâmetros configuráveis (Configurações / por empreendimento)

- % de retenção no distrato (por empreendimento)
- Deduções adicionais do distrato (corretagem, fruição)
- Regra de liberação de comissão (por empreendimento)
- Regra de estorno de comissão em distrato
- Modelos de documento (biblioteca versionada, por empreendimento ou geral)

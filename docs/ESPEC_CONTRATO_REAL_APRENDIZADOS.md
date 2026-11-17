# Especificacao — Aprendizados do Contrato Real (Atelier Opus) para o Incorpora

Extraido da analise de um contrato real de incorporacao (Atelier Opus / Opus Incorporadora), usado como referencia de mercado para validar e refinar o Incorpora. Reune os pontos que NAO sao de comissao (esses estao em ESPEC_CORRETOR_COMISSIONAMENTO.md) e que representam praticas reais a incorporar ou conferir no sistema.

Cada item indica se e CONFIRMA (o sistema ja faz, so validar), REFINA (existe mas precisa de ajuste) ou NOVO (implementar).

---

## 1. Taxa de cessao ESCALONADA por tempo [REFINA]
No contrato Opus (Clausula Especial 2), a taxa de cessao (transferencia de titularidade) e escalonada pelo tempo desde a compra:
- 3% nos primeiros 12 meses
- 2% do 13o ao 24o mes
- 1% a partir do 25o mes
- ISENCAO para 1a transferencia a parentes de 1o/2o grau ou socios da PJ compradora, desde que adimplente e unidade nao quitada.

Alem disso, o contrato tem uma taxa de transferencia geral (Cap. X, 10.1): 3% + anuencia da vendedora + direito de preferencia + comprovacao de ITBI.

Situacao no Incorpora: a cessao de direitos existe (Fase A) e a taxa de cessao virou recebivel avulso (Fase B). FALTA: tornar a taxa ESCALONADA POR FAIXA DE TEMPO (configuravel por empreendimento OU regra geral) e as REGRAS DE ISENCAO (parentesco 1o/2o grau, socios). Implementar como tabela de faixas (meses -> %) + regras de isencao marcaveis na cessao.

## 2. Series de parcelas com tipo, % de participacao e rotulo de correcao [REFINA]
O contrato estrutura o pagamento em SERIES, cada uma com: tipo (Sinal / Unica / Mensal / Semestral / Financiamento), quantidade, valor unitario, valor total, % DE PARTICIPACAO no preco, 1o vencimento, e regra de correcao (Fixas vs Reajustaveis).

Exemplo real (preco R$ 2.308.196,07):
- Sinal 1x, Unica 1x (Fixas)
- Sinal 2x (Reajustaveis)
- Mensal 42x (Reajustaveis)
- Semestral 7x (Reajustaveis)
- Unica 1x (balao intermediario)
- Financiamento 1x (58,14% do preco)

Situacao no Incorpora: o fluxo de proposta/carteira suporta parcelas e correcao em duas fases. CONFERIR/REFINAR: (a) o conceito de SERIE nomeada por tipo (Sinal/Unica/Mensal/Semestral/Balao/Financiamento); (b) o "% de participacao" de cada serie no preco (exibido no contrato); (c) o rotulo por serie de FIXA (nao corrige) vs REAJUSTAVEL (corrige) — ha parcelas fixas e reajustaveis no mesmo contrato.

## 3. Quadro-resumo Lei 13.786/2018 [CONFIRMA + REFINA]
O contrato tem um QUADRO RESUMO no inicio (exigencia da Lei 13.786), consolidando: partes, empreendimento (com registro/matricula e patrimonio de afetacao), unidade (area total/privativa/comum/fracao), preco, forma de pagamento (series), correcao/juros, prazo de conclusao + tolerancia, efeitos de atraso, direito de arrependimento, efeitos da resolucao por inadimplemento, intermediacao.

Situacao: o motor de templates (Fase A) gera contrato; a Fase B tem correcao em duas fases. REFINAR: garantir que o template de contrato TSH tenha a estrutura de QUADRO RESUMO da Lei 13.786 com todos esses campos como variaveis, e que os dados existam no cadastro (ver item 8 — area privativa etc.).

## 4. Correcao em duas fases — parametros reais [CONFIRMA]
Confirma exatamente o motor da Fase B:
- Ate o Habite-se: INCC-DI/FGV, base 2 meses antes da assinatura.
- Apos o Habite-se: IGP-M/FGV (base 2 meses antes do habite-se) + juros 1% a.m., Tabela Price.
- Data-base de correcao definida (ex.: 01/03/2024).
- Indices substitutivos previstos (se extinto INCC/IGP-M -> CUB H8-2N ou IGP-DI).
- Atraso na publicacao do indice: usa o ultimo publicado, com acerto posterior (isso valida a auditoria de atualizacao da fase de Confiabilidade).

Situacao: o sistema ja faz correcao em duas fases. CONFERIR: (a) indices substitutivos configuraveis; (b) data-base explicita por contrato; (c) "usa ultimo indice publicado + acerto" ja coberto pela auditoria.

## 5. Prazo de obra, tolerancia e efeitos de atraso [NOVO/REFINA]
- Prazo de conclusao (data) + tolerancia de 180 dias (prerrogativa da vendedora, sem penalidade).
- Conclusao = expedicao do Habite-se.
- Extrapolado prazo+tolerancia, comprador adimplente pode: (a) resolver com restituicao integral + multa 2%; ou (b) manter e receber multa de 1% a.m. sobre valor pago, pro rata die.

Situacao: o Incorpora tem a data de Habite-se (dispara a 2a fase de correcao). NOVO: registrar prazo de obra + tolerancia por empreendimento, e as regras de efeito de atraso (para futuros calculos/relatorios e para o quadro resumo). Pode ser so informativo/quadro-resumo por ora; o calculo automatico de multa por atraso da obra e evolucao futura.

## 6. Efeitos da resolucao por inadimplemento (distrato) [CONFIRMA]
Confirma o motor de distrato (Fase A):
- Restituicao das quantias pagas, MENOS: (a) integralidade da comissao de corretagem; (b) pena de 50% (patrimonio de afetacao, art. 67-A Lei 4.591/64).
- Se unidade ja disponibilizada: descontos adicionais (impostos, 0,5% a.m. de fruicao, etc.).

Situacao: o distrato (Fase A) ja usa retencao configuravel respeitando patrimonio de afetacao (ate 50%). CONFERIR: o desconto da comissao no distrato e SO da comissao que integra o preco (interna); a externa nao entra (ver ESPEC_CORRETOR_COMISSIONAMENTO). REFINAR: os descontos adicionais de "unidade ja disponibilizada" (fruicao 0,5% a.m., impostos) como itens configuraveis do distrato.

## 7. Direito de arrependimento (7 dias) [NOVO]
Se a venda e celebrada FORA da sede (stand de vendas): direito de arrependimento em 7 dias corridos, com devolucao integral (incluindo comissao). Notificacao por carta registrada; restituicao em 30 dias.

Situacao: NAO existe no Incorpora. NOVO (baixa prioridade, mas registrar): um marcador na venda "celebrada em stand/fora da sede?" que, se sim, habilita janela de arrependimento de 7 dias com fluxo de devolucao integral distinto do distrato. Pode ser fase futura.

## 8. Dados da unidade que o contrato exige [REFINA — conecta com achado 22 do test drive]
O contrato lista, por unidade: valor, localizacao (pavimento), AREA TOTAL, AREA PRIVATIVA, AREA COMUM, FRACAO IDEAL.

Situacao: o achado 22 do test drive mostrou que unidade.area nao resolvia no gerador. REFINAR: garantir que a unidade tenha area total, area privativa, area comum e fracao ideal como campos, e que resolvam nas variaveis do template. A fracao ideal (%) e usada em rateio de condominio e no quadro resumo.

## 9. Quadros/clausulas que o template de contrato TSH deve prever [REFINA]
Do contrato Opus, blocos que o template deve suportar como variaveis/secoes:
- Quadro resumo (Lei 13.786)
- Partes (vendedora SPE + comprador, com representante legal)
- Empreendimento (matricula, circunscricao, memorial de incorporacao, patrimonio de afetacao)
- Unidade (areas, fracao)
- Preco e series de pagamento (com % de participacao e correcao por serie)
- Correcao monetaria e juros (2 fases, indices substitutivos, data-base)
- Prazo de obra e tolerancia
- Direito de arrependimento
- Efeitos da resolucao (distrato)
- Intermediacao imobiliaria (quadro de comissao — ver spec de comissionamento)
- Cessao de creditos/securitizacao (a vendedora pode ceder recebiveis)
- Mandatos, escritura, alienacao fiduciaria, foro/arbitragem
- Clausulas especiais (ex.: quitacao de parcela via credito de rescisao de outra unidade)
- Taxa de cessao escalonada

## 10. Patrimonio de afetacao [CONFIRMA]
O contrato confirma o empreendimento sob regime de patrimonio de afetacao (averbado na matricula), o que permite a pena de 50% no distrato. Isso valida a amarracao ja existente: cadastro de SPE (Terreno/Contabil RET) -> distrato le a afetacao para o teto de retencao.

---

## Prioridade de implementacao (sugerida)
| Prioridade | Itens |
|---|---|
| Alta (dinheiro / conforme test drive) | 8 (dados da unidade / area), 1 (taxa de cessao escalonada), 2 (series de parcelas com % e fixa/reajustavel) |
| Media (contrato completo) | 3 e 9 (quadro resumo + secoes do template), 6 (refino distrato), 4 (indices substitutivos/data-base) |
| Baixa / futuro | 5 (efeitos de atraso de obra calculados), 7 (direito de arrependimento) |

## Observacao
Este contrato e de OUTRA incorporadora (Opus), usado so como referencia de mercado — o texto juridico do template TSH deve ser o da TSH (revisado pelo juridico), nao copia do Opus. O valor aqui e a ESTRUTURA e as PRATICAS (series, escalonamento, quadro resumo, campos), nao o texto literal.

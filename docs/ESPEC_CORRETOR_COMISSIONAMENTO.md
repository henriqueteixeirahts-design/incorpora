# Especificacao — Corretor, Imobiliaria e Comissionamento (TSH / Incorpora)

Modelo definitivo validado com o product owner e conferido contra um contrato real de incorporacao (Atelier Opus). Detalha o cadastro de corretor, a hierarquia da imobiliaria, os contratos de parceria e as DUAS NATUREZAS DE COMISSAO que coexistem em quase toda venda.

IMPORTANTE — isto REVISA a comissao da Fase A: hoje a Fase A trata toda comissao como conta a pagar da incorporadora. No modelo novo, so a comissao INTERNA vira conta a pagar; a comissao de INTERMEDIACAO EXTERNA e calculo + exibicao + ranking, SEM movimentacao financeira, e altera como a carteira nasce. Reaproveitar a infra de contas a pagar existente apenas para a comissao interna.

---

## PARTE 1 — Cadastro de Corretor

### 1.1 Natureza: PF sempre + faturamento a parte
Corretor sempre cadastrado como Pessoa Fisica (nome, CPF, contato — padrao do cadastro de cliente: validacao CPF, ViaCEP, auditoria). Mais um bloco de DADOS DE FATURAMENTO para pagamento:
- Tipo de recebimento: PF (o proprio CPF) ou PJ
- Razao social / CNPJ (validado) se PJ
- Dados bancarios / Pix
- "Faturar em nome de terceiro?" — o corretor pode indicar uma PJ que nao e dele para receber

Motivo: o cadastro e a pessoa, mas o pagamento normalmente sai para a PJ do corretor (ou uma que ele indique).

### 1.2 Tipo de corretor
- AUTONOMO: recebe 100% da comissao de intermediacao. Sem split.
- VINCULADO a imobiliaria: segue o split da imobiliaria (Parte 3). Tem papel (Corretor ou Gerente comercial) e, se corretor, vinculo a um gerente direto (opcional).

### 1.3 Hierarquia da imobiliaria
```
IMOBILIARIA
 ├── Gerente Regional (fixo — recebe em toda venda)
 ├── Gerente de Produto (fixo — recebe em toda venda)
 ├── Gerente Comercial A ── Corretor Joao, Corretor Maria
 └── Gerente Comercial B ── Corretor Pedro
```
Todos — corretores e gerentes — sao pessoas cadastradas (PF + faturamento proprio). Cada fatia do split vira pagamento rastreavel para a PJ certa.

---

## PARTE 2 — Cadastro de Imobiliaria
Dados cadastrais (razao social, CNPJ validado, contato, endereco, faturamento) + lista de vinculados e hierarquia + a regra de split (Parte 3, fixa/global da imobiliaria).

---

## PARTE 3 — Motor de Split (comissao de intermediacao externa)

### 3.1 Comissao total de intermediacao
% sobre o valor da venda, definido por empreendimento. E o "bolo" da intermediacao externa, dividido 100% entre os beneficiarios.

### 3.2 Regra de split da imobiliaria (fixa/global)
Lista de fatias somando 100%. Cada fatia:
- Percentual
- Tipo: FIXO (pessoa especifica: imobiliaria, gerente regional, gerente de produto — recebe em toda venda) ou DINAMICO (papel: "corretor da venda" ou "gerente direto do corretor" — resolvido na hora)

Exemplo:
| Fatia | % | Tipo | Destinatario |
|---|---|---|---|
| Corretor | 20% | DINAMICO | corretor da venda |
| Gerente direto | 10% | DINAMICO | gerente do corretor |
| Gerente de produto | 5% | FIXO | pessoa X |
| Gerente regional | 5% | FIXO | pessoa Y |
| Imobiliaria | 60% | FIXO | a imobiliaria |
| Total | 100% | | |

Validacao: soma = 100% (bloquear salvar se diferente).

### 3.3 Resolucao ao fechar a venda
1. Comissao total = % do empreendimento x valor da venda.
2. Carrega a regra da imobiliaria do corretor.
3. Cada fatia: FIXO -> pessoa cadastrada; DINAMICO "corretor" -> quem vendeu; DINAMICO "gerente direto" -> gerente do corretor.
4. CASO-LIMITE: fatia "gerente direto" mas corretor SEM gerente -> a fatia soma na do corretor.
5. Autonomo: fatia unica de 100% para ele.

---

## PARTE 4 — AS DUAS NATUREZAS DE COMISSAO (coracao do modelo)

Em quase toda venda da TSH coexistem duas comissoes de naturezas distintas.

### NATUREZA 1 — Intermediacao externa (quem trouxe o cliente)
- Paga pelo COMPRADOR, direto, FORA DO PRECO.
- Consome as PRIMEIRAS PARCELAS do cliente, marcadas "destinadas ao corretor": a 1a parcela vai pro corretor; se menor que a comissao, continua nas seguintes; se a parcela e maior que o saldo de comissao, FRACIONA (parte corretor, resto SPE).
- INVISIVEL ao financeiro/receita da SPE, ao extrato e portal do cliente, e ao distrato (nao entra no calculo nem no demonstrativo).
- As parcelas "destinadas ao corretor" aparecem na visao INTERNA (incorporadora) marcadas, mas NAO aparecem no portal do cliente.
- Segue o split da Parte 3.
- O sistema CALCULA, EXIBE como quadro informativo no contrato do cliente (com CNPJ/valor/forma de cada intermediario — Lei 13.786), e RANQUEIA (ranking corretor/imobiliaria/gerente). NAO movimenta financeiramente.
- Regime caixa: cada beneficiario recebe conforme o cliente paga a parcela correspondente.
- No distrato: o que o corretor ja recebeu NAO volta, nao entra no acerto.

### NATUREZA 2 — Gerente comercial interno da TSH
- Paga pela INCORPORADORA (TSH), do caixa dela, INTEGRA O PRECO / e despesa comercial da SPE.
- % sobre o valor da venda, recebido pelo gerente comercial interno.
- VIRA CONTA A PAGAR da incorporadora (reaproveita o modelo da Fase A — correto para este caso).
- Regime caixa: recebe quando o cliente paga cada parcela.
- So o gerente comercial interno recebe (sem split interno).
- Configuravel: recebe em TODA venda do empreendimento OU so nas que participou.
- Entra no distrato como a comissao que "integra o preco" (descontada da devolucao, conforme Lei 13.786 / modelo do contrato Opus).

### Coexistencia
As duas rodam na mesma venda: a externa (parcelas do cliente, invisivel, sem movimentacao) + a interna (despesa da SPE, conta a pagar). O motor de comissao deve calcular e registrar ambas.

---

## PARTE 5 — Contratos de Parceria
- Dois tipos de template: contrato com IMOBILIARIA (cobre os corretores vinculados) e contrato com CORRETOR AUTONOMO. Editaveis, com variaveis das fatias/comissao.
- Geracao automatica pelo motor de templates (Fase A).
- TRAVA: a venda pode ser fechada, mas o CONTRATO DE COMPRA E VENDA NAO E GERADO se a parceria correspondente (imobiliaria para vinculados; corretor para autonomos) nao estiver assinada. (A trava e na geracao do contrato, nao no pagamento — porque a comissao externa nao e paga pela incorporadora.)

---

## PARTE 6 — Quadro informativo de comissao no contrato
No contrato do cliente, um quadro de intermediacao (padrao Lei 13.786, como no contrato Opus):
| CRECI | Intermediador | CNPJ | Valor | Forma (a vista/a prazo) |
Listando cada beneficiario da intermediacao externa. A comissao interna (gerente TSH) aparece se/conforme a pratica (no Opus, a paga pela vendedora aparece como "integra o preco").

---

## Casos de teste obrigatorios (rigor de dinheiro)
1. Autonomo -> 100% da intermediacao para a PJ dele.
2. Split 20/10/5/5/60, corretor COM gerente -> 5 destinatarios, soma = comissao total, centavo a centavo.
3. Mesmo split, corretor SEM gerente -> fatia do gerente (10%) soma no corretor (30%); 4 destinatarios.
4. Consumo de parcelas: comissao externa > 1a parcela -> consome 1a inteira + fraciona a 2a; a SPE so recebe o excedente da 2a em diante; primeiras parcelas marcadas e fora da receita da SPE.
5. Comissao interna: % da venda vira conta a pagar do gerente interno, regime caixa (paga conforme o cliente paga), respeitando o "toda venda vs so participou".
6. Distrato: comissao externa nao entra no calculo; comissao interna (integra preco) descontada da devolucao; nada do corretor externo devolvido.
7. Trava: venda fechada sem parceria assinada -> nao gera contrato de compra e venda.
8. Isolamento por organizacao.

## Decisoes do product owner (registro)
- Corretor PF + faturamento PJ (dele ou terceiro). ✔
- Autonomo 100%; vinculado segue split da imobiliaria (fixo/global). ✔
- Fatias fixas (regional/produto/imobiliaria) e dinamicas (corretor/gerente direto). ✔
- Corretor sem gerente -> fatia do gerente vai pro corretor. ✔
- Comissao total varia por empreendimento. ✔
- Intermediacao externa: paga pelo comprador, consome primeiras parcelas, invisivel ao cliente/SPE/distrato, sem movimentacao — so calculo/exibicao/ranking. ✔
- Comissao interna do gerente TSH: paga pela incorporadora, % da venda, conta a pagar, regime caixa, configuravel (toda venda vs so participou). ✔
- Parceria nao assinada trava a GERACAO DO CONTRATO de venda (nao o pagamento). ✔
- Distrato: comissao externa fora; interna descontada; corretor nao devolve. ✔

## Posicao na fila
Evolucao da Fase A (revisa a comissao). Encaixa na retomada das funcionalidades. Como mexe em dinheiro e na forma como a carteira nasce, segue o rigor de teste da carteira. Toca o mesmo cadastro (Imobiliarias/Corretores) da fase de navegacao+perfis — avaliar fazer proximas/juntas.

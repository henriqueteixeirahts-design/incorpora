# Relatório de Test Drive em Produção — Incorpora (VERSÃO COMPLETA — 23 achados)

Substitui a versão anterior no disco. Registra os dois test drives feitos em produção (incorpora-six.vercel.app), com o ciclo completo validado e todos os achados numerados de 1 a 23.

## Resultado geral
**O núcleo do sistema funciona de ponta a ponta com dado real.** No segundo test drive (após a correção dos P0 da proposta, commit 2001e05), foi possível percorrer o ciclo inteiro: cadastro/seleção de cliente -> reserva -> proposta (modal novo) -> aprovação -> conversão em venda (V-2026-0001, unidade 2501) -> geração de contrato -> PDF gerado, subido ao Supabase Storage e aberto. A pendência de upload de documento em produção, aberta desde a Fase B etapa 1, esta RESOLVIDA e confirmada.

Itens marcados [VALIDACAO POSITIVA] nao requerem acao. Itens marcados [JA CORRIGIDO 2001e05] foram resolvidos na correcao dos P0 da proposta; ficam registrados para historico e testes de regressao.

---

## Cadastro de Cliente
1. CPF invalido so valida ao salvar - deveria validar no blur do campo (feedback imediato).
2. E-mail invalido so valida ao salvar - idem, validacao tardia.
3. CEP: ao TROCAR um CEP ja preenchido, nao refaz a busca automatica - mantem o endereco do CEP anterior. O autocomplete (ViaCEP) so dispara na primeira digitacao, nao em mudanca.
4. Campo "Numero" do endereco nao e obrigatorio - deveria ser (endereco completo para contrato).

## Reserva / Simular Proposta (espelho de vendas)
5. REGRA GERAL DE UX: nenhum cadastro deve ser feito inline empurrando a tela pra baixo - deve abrir em modal OU painel lateral (painel lateral aprovado depois - ambos aceitos).
6. A tela de simular proposta estava no visual antigo no test drive #1 (esperado; entra na reforma visual).
7. Ao simular proposta, nao apareciam valor da unidade nem tabela de precos vigente pre-carregados (spec 5.3). [JA CORRIGIDO 2001e05] - modal novo mostra valor de tabela, valor da venda e fluxo pre-carregado.
8. Campos de preco sem separador de milhar/decimais - formatacao de moeda faltando. SISTEMICO (Sprint V1).
9. Proposta REPROVADA ainda mostrava botao "Enviar para aprovacao" - reprovada e fim de linha. [JA CORRIGIDO 2001e05, F1].

## Simular Proposta - problemas estruturais (test drive #1, JA CORRIGIDOS em 2001e05)
10. Tela de nova proposta nao tinha campo direto de entrada; fluxo escondido atras de "Contra-proposta de fluxo (opcional)" recolhido -> sistema assumia entrada 0% e sempre reprovava. [CORRIGIDO] - fluxo sempre visivel.
11. Tela confusa, sem referencia de valor/tabela/fluxo padrao. [CORRIGIDO] - modal mostra tudo.
12. (= 9) Botao "Enviar para aprovacao" em proposta reprovada. [CORRIGIDO].
13. ERRO DE BANCO ao criar proposta: numeric field overflow - campo "Entrada (%)" recebeu 80000 (usuario achou que era R$). Sem validacao de range, mandou 80000% ao banco. [CORRIGIDO] - validacao de range + erro tratado + R$ ao lado do % pra desfazer a ambiguidade.
14. Campos de fluxo em % sem mostrar o R$ correspondente e sem validar soma 100%. [CORRIGIDO] - R$ ao lado ao vivo + validacao de 100% + auto-ajuste de Chaves.
15. Proposta com 100% de entrada reprovada por "pos-chaves 80%" - caia no default da tabela. [CORRIGIDO] - repro virou teste; 100% de entrada agora da pos-chaves 0%.
16. Mensagem tecnica do Prisma vazando pro usuario. [CORRIGIDO] - ValidationError amigavel.

## [VALIDACAO POSITIVA] Motor de VPL
Confirmado em producao nos dois test drives: calcula VPL, aplica limites (entrada minima, prazo, % pos-chaves), roteia os 3 status corretamente. Exemplos ao vivo: entrada 20%/100 parcelas -> Reprovada (desagio -28,87%); entrada 30%/30 parcelas -> Aguardando analise (desagio -8,88%, dentro do limite de 10%); reprovacao por entrada 0% < minimo. Sem acao - esta correto.

## Fluxo de aprovacao de proposta
17. Nomenclatura confusa: "Avaliacao de propostas" no submenu leva a tela de CONFIGURACAO dos parametros do motor (taxa, tolerancias, limites), nao a lista de propostas pendentes. Renomear (ex.: "Parametros de avaliacao" / "Regras de proposta") e ter um lugar claro onde propostas "Aguardando analise" aparecem para o gestor decidir.
18. Tela de aprovacao so tem "aprovar/reprovar" - nao ha opcao de o gestor fazer CONTRA-PROPOSTA (ajustar o fluxo e devolver). Avaliar contra ESPEC_MODULO_COMERCIAL.md se contra-proposta do gestor estava previsto; implementar se sim, ou registrar a decisao de manter so aprovar/reprovar.

## [MARCO] Primeira venda ponta a ponta
V-2026-0001 (unidade 2501) fechada em producao: reserva -> proposta -> enviada -> aprovada -> convertida em venda. O caminho que travava no test drive #1 esta 100%.

## Linha do tempo da venda
19. HORARIOS ERRADOS na linha do tempo - provavel bug de FUSO HORARIO (mesma categoria de bugs de data ja vista em cessao e outras etapas). Vale um FIX CENTRAL de timezone aplicado em todo o sistema, com teste que fixe o comportamento.
20. Cada evento da linha do tempo deveria mostrar o NOME DO USUARIO que executou a acao (quem reservou, aprovou, converteu). Hoje so mostra acao + data. O AuditEvent/DevelopmentEvent ja grava o autor - falta EXIBIR.

## Geracao de documento / PDF
21. No primeiro teste, "Nenhum modelo ativo para este empreendimento" - o motor de templates existe mas NAO HAVIA modelo de contrato cadastrado em producao. Por isso o PDF nunca fora testado end-to-end: nao havia o que gerar. NAO era bug de Storage; era falta de dado de configuracao. Acao: SEEDAR uma biblioteca-padrao de modelos por organizacao (contrato, distrato, cessao, extrato), clonavel - o Pilar 4 do ESPEC_MULTITENANT_FUNDACOES.md ja previa. Uma incorporadora nova precisa gerar contrato no dia 1 sem cadastrar do zero. Seedar retroativo para a organizacao TSH.
22. A unidade 2501 tem "80 m2" visivel no painel do espelho, mas o gerador reportou unidade.area vazio. O dado existe em algum lugar (o espelho mostra), mas nao no campo que o template le. Investigar: area nao persistida no seed das unidades, OU a variavel do template aponta pra campo diferente. Corrigir para que a variavel de area resolva. Verificar/preencher a area nas unidades reais de TSH Laguna e Lake House.

## [VALIDACAO POSITIVA] Bloqueio por variavel faltante
Ao gerar com modelo usando a variavel de area e a unidade sem area, o sistema bloqueou com "Faltam dados no cadastro pra gerar: unidade.area" - exatamente como a spec da Fase A previa (nao gerar documento com lacunas). Comportamento correto.

## [VALIDACAO POSITIVA] PDF confirmado em producao
Apos ajustar o modelo, o documento GEROU, subiu ao Supabase Storage, apareceu na aba "Documentos" da venda com opcao de baixar, e ABRIU em nova aba corretamente. Pendencia da Fase B RESOLVIDA. Todos os fluxos de documento (contrato, distrato, cessao, extrato) tem o alicerce de Storage confirmado.

## Achado transversal
23. REGRA GERAL de auditoria: toda acao deve EXIBIR quem criou + data/hora, e quem alterou por ultimo + data/hora (se houve alteracao). Falta em: documentos gerados ("gerado por" ausente no CT-2026-0001), linha do tempo (achado 20), e cadastros em geral. Criterio de aceite transversal.

---

## Duas regras transversais estabelecidas pelo product owner
- R1 - SEM FORMULARIO INLINE. Cadastro/edicao em modal OU painel lateral (o painel lateral do espelho foi aprovado - ambos aceitos; escolher conforme o contexto). Nunca formulario empurrando a tela pra baixo.
- R2 - AUDITORIA UNIVERSAL EXIBIDA. Autor + data de criacao e de ultima alteracao visiveis em toda tela de acao.

## Correspondencia com o plano de sprints
Os numeros deste relatorio correspondem as referencias em PLANO_SPRINTS_VISUAL_CORRECOES.md:
- Sprint V1: achados 8, 14 (moeda), 19 (fuso), 21 (seed de modelo), 22 (area)
- Sprint V2: achados 17, 18 (aprovacao/nomenclatura), R1
- Sprint V3: achados 1, 2, 3, 4 (cadastro cliente), colunas trocadas + "APARTMENT" (empreendimentos)
- Sprint V4: achados 20, 23 (autor/auditoria em vendas/documentos)
- Sprint V5: varredura transversal (R1, R2, moeda, fuso, enums)

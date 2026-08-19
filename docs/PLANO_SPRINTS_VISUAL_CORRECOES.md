# Plano de Sprints — Correções (Test Drive) + Reforma Visual

Consolida os achados do test drive em produção com a continuação da reforma visual (handoff em `docs/visual/design_handoff_incorpora/`). Organizado em **sprints longas e autônomas** — cada uma é um bloco fechado que o Claude Code executa de ponta a ponta sozinho, só reportando ao final.

## Princípio de execução
Cada tela que for reformada visualmente já recebe, na mesma passada, as correções de test drive que pertencem a ela (não mexer duas vezes na mesma tela). Correções sistêmicas (moeda, seed de modelo) são feitas uma vez, de forma central.

## Duas regras transversais (critério de aceite de TODA tela tocada)
1. **Sem formulário inline.** Nenhum cadastro/edição empurrando o conteúdo da tela pra baixo. Use **modal** (janela) ou **painel lateral** (como o do espelho de vendas) — os dois são aceitos. Escolher o que faz sentido: painel lateral quando nasce de uma seleção/espelho; modal para cadastros independentes.
2. **Auditoria universal exibida.** Toda ação registra e **exibe** na interface: quem criou + data/hora, e quem alterou por último + data/hora (se houve alteração). O `AuditEvent`/`DevelopmentEvent` já capturam o autor por baixo — o trabalho é **exibir** consistentemente (documentos, linhas do tempo, cadastros).

Padrão de qualidade de sempre: `tsc`/eslint/testes/build verdes; cálculos financeiros testados contra cálculo manual; todo bug corrigido ganha um teste que o reproduz; migrations aditivas; confirmar CI verde antes de fechar cada sprint; atualizar `STATUS_IMPLANTACAO.md`.

---

## SPRINT V1 — Fundamentos sistêmicos (fazer primeiro, destrava o resto)

Correções globais que afetam o sistema inteiro — melhor resolver de uma vez antes de tocar tela por tela.

1. **Formatação de moeda centralizada (achados 8, 14).** Criar/consolidar um helper único de formatação `pt-BR` (R$ #.###,##) e aplicar em TODA exibição de valor monetário do sistema — listas, cards, KPIs, extratos, fluxo de caixa, propostas, tudo. Nenhum valor monetário deve aparecer sem separador de milhar e centavos.
2. **Correção central de fuso horário (achado 19).** Há um bug recorrente de datas/horários exibindo valor errado (visto na cessão, na linha do tempo da venda, e em etapas anteriores). Investigar a causa raiz (provável UTC vs. horário local na formatação) e corrigir de forma central, com um helper de formatação de data/hora, aplicado em todo o sistema. Criar teste que fixe o comportamento.
3. **Seed de modelo-padrão de documento por organização (achado 21).** Toda organização deve nascer com uma biblioteca-padrão clonável de modelos (contrato de compra e venda, distrato, cessão, extrato) — o Pilar 4 do `ESPEC_MULTITENANT_FUNDACOES.md` já previa isso. Uma incorporadora nova precisa conseguir gerar contrato no dia 1 sem cadastrar do zero. Seedar para a organização TSH existente também (retroativo). Os modelos-padrão usam apenas variáveis seguras/sempre-presentes por padrão, para não bloquear geração por dado faltante.
4. **Investigar o campo área da unidade (achado 22).** O espelho mostra "80 m²" mas o gerador de documento diz que `unidade.area` está vazio. Descobrir se a área não foi persistida no seed das unidades ou se a variável do template aponta para o campo errado, e corrigir — de modo que `{{unidade.area}}` resolva corretamente. Verificar/preencher a área nas unidades reais do TSH Laguna e Lake House.

**Fim da sprint:** relatório do que mudou globalmente + confirmação de que uma venda existente consegue gerar contrato com todas as variáveis resolvidas.

---

## SPRINT V2 — Fluxo comercial: telas + correções + visual

O bloco comercial é o mais crítico (é o que fecha venda). Reformar visualmente (handoff) e aplicar as correções pertinentes de uma vez.

**Telas:** Comercial (lista de reservas/propostas), Avaliação de propostas, aprovação de propostas, tela de reserva, e o que mais do fluxo comercial ainda estiver no visual antigo.

**Correções embutidas:**
5. **Nomenclatura + fluxo de aprovação (achados 17, 18).** Renomear "Avaliação de propostas" (que hoje é a tela de CONFIGURAÇÃO dos parâmetros) para algo como "Parâmetros de avaliação" / "Regras de proposta". Criar/clarificar um lugar dedicado onde as propostas "Aguardando análise do gestor" aparecem para o gestor decidir — um painel de aprovações claro. Avaliar contra a spec (`ESPEC_MODULO_COMERCIAL.md`) se o gestor deve poder fazer **contra-proposta** (ajustar o fluxo e devolver) além de aprovar/reprovar; se a spec previr, implementar; se não, deixar aprovar/reprovar e registrar a decisão.
6. **Migrar formulários inline do fluxo comercial para modal/painel** (regra transversal 1). A criação de reserva na tela Comercial e qualquer outro formulário inline ali devem virar modal ou painel.
7. Aplicar o **handoff visual** em todas essas telas (tokens, tipografia, componentes, ícones).

**Fim da sprint:** relatório + CI verde. As correções P0 da proposta já foram feitas antes; esta sprint cuida do entorno (aprovação, nomenclatura, visual).

---

## SPRINT V3 — Cadastros: telas + correções + visual

Todos os cadastros que ainda estão no visual antigo, com as correções de cadastro embutidas.

**Telas:** Clientes (lista já reformada, revisar detalhe/modal), Imobiliárias/Corretores, Fornecedores/Centros de custo, e a **lista de Empreendimentos**.

**Correções embutidas:**
8. **Cadastro de cliente (achados 1, 2, 3, 4):** validação de CPF e e-mail no `blur` (feedback imediato, não só ao salvar); CEP refaz o autocomplete sempre que muda (não só na primeira vez); campo "Número" do endereço obrigatório.
9. **Lista de empreendimentos:** corrigir as **colunas trocadas** (Cidade mostra SPE, SPE mostra contagem de unidades — já registrado no handoff). Rótulos corretos: Nome, Tipo, SPE, Cidade, Unidades.
10. **"APARTMENT" cru:** traduzir o enum de tipo de unidade para PT-BR ("Apartamento", etc.) onde aparece na interface.
11. Aplicar o **handoff visual** + garantir que todo cadastro é modal/painel (regra 1) e exibe auditoria (regra 2).

**Fim da sprint:** relatório + CI verde.

---

## SPRINT V4 — Vendas, contratos e financeiro: telas + correções + visual

**Telas:** detalhe da venda (Resumo/Fluxo/Contrato/Comissões/Documentos), Vendas (lista), Contas a pagar, Recebíveis avulsos, Fluxo de caixa, Comissões, Inadimplência, carteira/extrato.

**Correções embutidas:**
12. **Linha do tempo da venda (achado 20 + regra 2):** exibir o **nome do usuário** que executou cada evento (reservou, aprovou, converteu), além da data/hora já corrigida na Sprint V1.
13. **Documentos gerados (regra 2):** exibir "gerado por [usuário]" além de "gerado em [data]".
14. Aplicar o **handoff visual** em todas essas telas.

**Fim da sprint:** relatório + CI verde.

---

## SPRINT V5 — Telas restantes + varredura final

**Telas:** SPEs, Permutantes, Relatórios, Configurações, Dashboard (revisar), e qualquer tela que tenha ficado para trás.

15. Aplicar o **handoff visual** nas telas restantes.
16. **Varredura transversal final:** percorrer o sistema inteiro confirmando que (a) nenhum valor monetário aparece sem formatação, (b) nenhuma data aparece com fuso errado, (c) nenhum formulário é inline, (d) toda tela de ação exibe autor/data de criação e alteração, (e) nenhum enum aparece cru em inglês.
17. Conferir responsividade dentro do escopo definido (desktop, tema claro — sem mobile, decisão de produto registrada).

**Fim da sprint:** relatório final + CI verde + reforma visual e correções do test drive concluídas.

---

## Ordem e autonomia

Executar V1 → V2 → V3 → V4 → V5, em sprints longas e autônomas: o Claude Code faz o bloco inteiro sozinho (implementar, testar, migrar, commitar, confirmar CI) e só reporta ao final de cada sprint, quando aguarda aprovação para a próxima. Dentro de uma sprint, não precisa pedir aprovação a cada tela.

Achados que são **validações positivas** (motor de VPL, 3 status, validação de variáveis faltando, PDF/Storage confirmado) NÃO precisam de ação — estão corretos e confirmados em produção no test drive.

Depois das 5 sprints, o sistema estará com o visual completo aplicado e os achados do test drive resolvidos — e a fila de funcionalidades (Aportes 3-7, permuta financeira, Fase C, RLS + Portal do Cliente) é retomada.

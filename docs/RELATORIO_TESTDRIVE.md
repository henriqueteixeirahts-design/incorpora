# Relatório de Test Drive em Produção — Incorpora

Primeiro teste de uso real do sistema em produção (ambiente `incorpora-six.vercel.app`), feito manualmente pela interface, tentando percorrer o ciclo cadastrar cliente → reservar unidade → criar proposta → fechar venda → gerar contrato/PDF. **O fluxo travou na criação de proposta por bugs bloqueantes** — não foi possível chegar à venda nem testar a geração de PDF em produção (que segue sem confirmação end-to-end).

**Validação positiva importante:** o motor de avaliação de propostas por VPL **funciona corretamente em produção** — calcula o VPL, aplica as regras (entrada mínima, % pós-chaves) e reprova/aprova automaticamente com justificativa. O problema não é o cérebro financeiro; é a interface que impede o usuário de alimentá-lo corretamente.

Os achados abaixo estão priorizados: P0 = bloqueia o uso, P1 = furo funcional sério, P2 = qualidade/UX, P3 = cosmético. Sugiro atacar nessa ordem.

---

## P0 — Bloqueantes (impedem fechar uma venda)

**B1. Erro de banco cru exposto ao criar proposta (numeric field overflow).**
No campo "Entrada (%)" da contra-proposta de fluxo, digitar um número grande (usuário digitou `80000` interpretando como R$ 80.000, não como percentual) causa `Invalid prisma.proposal.create() invocation: Value out of range for the type: numeric field overflow`, exibido cru na tela. Correções necessárias: (a) validar o range do campo % (0–100) antes de enviar, com mensagem amigável; (b) tratar qualquer erro de servidor sem vazar a mensagem técnica do Prisma pro usuário; (c) ver B2 sobre a ambiguidade %/R$.

**B2. Não há caminho óbvio para montar uma proposta que passe.**
A tela de nova proposta não tem um campo claro de entrada. O parcelamento fica escondido atrás de "▶ Contra-proposta de fluxo (opcional)" recolhido — se o usuário não expandir e preencher, o sistema assume entrada 0% e **sempre reprova** por "entrada abaixo do mínimo (10%)". Um usuário real não descobre o caminho. A tela precisa deixar o fluxo de pagamento em primeiro plano, não opcional/escondido.

**B3. Cálculo de fluxo errado quando a contra-proposta não é preenchida.**
Proposta com 100% de entrada foi reprovada por "pós-chaves 80% acima do máximo (30%)". Com entrada de 100% não deveria sobrar 80% pós-chaves — indica que, sem a contra-proposta preenchida, o sistema cai num default (da tabela) que empurra 80% pra pós-chaves e ignora a entrada informada. Investigar a montagem do fluxo nominal a partir dos campos da tela.

---

## Decisão do product owner: **a tela de proposta será repensada do zero**, não remendada.

Redesenhar a criação/simulação de proposta como um **modal** (ver R1 abaixo), com:
- Campo de entrada claro, com opção de informar em **% OU em R$** (e mostrar o outro convertido ao lado).
- Todos os campos de fluxo (entrada, parcelas, balões/intermediárias, chaves) mostrando o **valor em R$ correspondente** ao lado do %, e uma **validação visível de que a soma fecha 100%** do valor da venda antes de permitir submeter.
- **Referências sempre visíveis**: valor da unidade, tabela de preços vigente, e o fluxo da tabela padrão **pré-carregado** (a spec 5.3 do `ESPEC_MODULO_COMERCIAL.md` já previa isso — "parte da tabela padrão pré-carregada"). O corretor edita a partir do padrão, não do zero.
- O resultado da avaliação (VPL, checks, status) atualizado **em tempo real** conforme edita, como a spec previa.

---

## P1 — Furos funcionais

**F1. Proposta reprovada ainda mostra "Enviar para aprovação".**
Reprovada é fim de linha — só o status "Aguardando análise do gestor" deveria ter o botão de enviar. Reprovada não pode ser submetida. (Reincidiu em todas as tentativas.)

**F2. Troca de CEP não refaz o autocomplete de endereço.**
No cadastro de cliente, ao **alterar** um CEP já preenchido, o endereço anterior permanece — o ViaCEP só dispara na primeira digitação, não em mudança. Deve refazer a busca sempre que o CEP mudar.

**F3. Campo "Número" do endereço não é obrigatório.**
Conforme a spec de endereço completo, número deveria ser obrigatório (endereço sem número é incompleto para contrato).

---

## P2 — Qualidade / UX

**Q1. Formatação de moeda ausente em todo o sistema (sistêmico).**
Valores aparecem sem separador de milhar e sem decimais (ex.: "R$ 704000" em vez de "R$ 704.000,00"). Num sistema financeiro isso é grave — dificulta leitura e induz erro. Aplicar formatação `pt-BR` (R$ #.###,##) em toda exibição de valor monetário do sistema.

**Q2. Validação de CPF e e-mail só ocorre ao salvar.**
Deveria validar no `blur` de cada campo (feedback imediato), não só ao submeter o formulário inteiro.

**Q3. Reserva permite selecionar usuário do sistema em vez de exigir cliente.**
Verificar: a reserva deveria vincular um **cliente** (comprador), não um usuário do sistema. Confirmar a regra da spec e ajustar se procede.

---

## R1 — Regra geral de UX estabelecida pelo product owner (vale pro sistema inteiro)

**Nenhum cadastro/formulário deve ser feito inline na tela empurrando o conteúdo pra baixo. TODO cadastro deve abrir em modal (janela/popup).**
Isso é o padrão já aprovado no handoff visual (modais 520/760px) e já aplicado em Clientes/SPE. As telas que ainda usam formulário inline (proposta, e outras que aparecerem) devem migrar pra modal nas rodadas de reforma visual. Registrar como critério de aceite de toda tela reformada daqui pra frente.

---

## Nota sobre o PDF (pendência que permanece)

O teste de geração de PDF em produção **continua sem confirmação** — não por falha de tentativa, mas porque todo caminho até o PDF (contrato, extrato) depende de uma venda fechada, e o fluxo de venda está bloqueado pelos itens P0. Assim que B1–B3 forem corrigidos e for possível fechar uma venda de teste, o teste de PDF em produção deve ser refeito (era o objetivo original deste test drive).

---

## Sugestão de ordem de execução

1. **P0 (B1, B2, B3)** — desbloqueia o fluxo de venda. Como a tela de proposta será redesenhada do zero (modal, ver decisão acima), B1–B3 podem ser resolvidos dentro desse redesenho em vez de remendos isolados.
2. **F1** (rápido) junto com o redesenho da proposta.
3. **Q1 (formatação de moeda)** — sistêmico, alto impacto visual, vale um helper central de formatação aplicado em todo o sistema.
4. **F2, F3, Q2** — ajustes do cadastro de cliente.
5. **R1** — aplicar como critério nas rodadas de reforma visual em andamento.
6. Refazer o teste de venda ponta a ponta + **PDF em produção**.

Rigor de sempre: cada correção que toca cálculo de proposta/fluxo precisa de teste contra cálculo manual; e o botão de submeter proposta reprovada + o overflow do % pedem casos de teste que reproduzam exatamente o que o test drive encontrou (proposta reprovada não deve ter caminho de envio; % fora de range deve ser barrado com mensagem amigável).

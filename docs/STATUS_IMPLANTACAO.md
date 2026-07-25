# Status de Implantação — Incorpora (TSH Incorporadora)

> Este documento deve ser atualizado pelo Claude Code ao final de cada sprint concluída, antes de iniciar a próxima. Objetivo: permitir auditoria do progresso por alguém não-técnico, sem precisar acompanhar o desenvolvimento sprint a sprint.

**Última atualização:** Sprint 9 concluída

---

## 1. O que está funcional e testado (por sprint)

### Sprint 0 — Fundação técnica
✅ Concluída
- Login, permissões (roles), estrutura Organização → SPE, auditoria (`DevelopmentEvent`) funcionando.

### Sprint 1-2 — Produto e disponibilidade
✅ Concluída
- Cadastro de empreendimento, unidades, vínculo principal/acessória e mapa de disponibilidade testados.

### Sprint 3-4 — Comercial
✅ Concluída e testada de ponta a ponta
- Fluxo validado: reserva → proposta com desconto de 6% → aprovação em 3 níveis (acima do limite de 5%) → venda → comissão automática do corretor (4%) + split manual do coordenador, com valores conferidos.
- Módulos entregues: CRM comercial (clientes, corretores, imobiliárias), tabelas de venda, reservas com expiração, propostas versionáveis com simulador de fluxo, aprovação por alçada, conversão em venda, comissões com split.

### Sprint 5 — Contratos
✅ Concluída e testada de ponta a ponta
- Fluxo validado: reserva → proposta → venda → minuta gerada → enviada para assinatura → confirmada → carteira criada com valor e vencimento corretos.
- Módulos entregues: contratos com numeração sequencial (`CT-2026-0001`) e ciclo `DRAFT → AWAITING_SIGNATURE → SIGNED`, minuta renderizada sob demanda com dados automáticos, criação automática da carteira a partir do fluxo simulado na proposta.

### Sprint 6-7 — Carteira e indexadores
✅ Concluída e testada com script dedicado (12 conferências automáticas)
- Fluxo validado: cadastro de índice INCC com valores mensais (1%, 1%, 1,5%) → configuração da regra de correção do contrato (índice + 0,5% de juros contratuais compostos + 2% de multa + 1% de mora ao mês) → parcela corrigida em 3 meses bateu exatamente com o cálculo manual (R$ 300.000 → R$ 315.303,09) → mesma parcela testada com 40 dias de atraso: multa e mora calculadas e conferidas centavo a centavo → parcela apareceu na lista de inadimplência → recebimento parcial (`PARTIALLY_PAID`) seguido de quitação (`PAID`) → parcela paga não é mais recalculada → antecipação simulada de uma parcela futura com 5% de desconto conferida (valor presente = atualizado − desconto).
- Módulos entregues: catálogo de índices (INCC/IPCA/IGP-M/taxa fixa) com lançamento mensal manual, regra de correção por contrato (índice + juros contratuais + multa/mora), memória de cálculo auditável (cada recálculo gera um registro novo, nunca sobrescreve), recebimentos manuais com baixa parcial/total, lista de inadimplência com recálculo automático das parcelas vencidas, simulador de antecipação (não baixa nada, só demonstra).
- **Retrabalho pontual (mesma sprint):** correção em duas fases (obra + pós-Habite-se), detalhado na seção 2. Testado com 5 cenários na função pura (sem Habite-se, Habite-se futuro, Habite-se no meio do período, contrato assinado após o Habite-se, multa/mora sobre as duas fases combinadas) mais um teste de integração completo via banco: contrato com INCC na fase de obra e IPCA + juros simples na fase pós-Habite-se, valores conferidos e as duas fases visíveis na memória de cálculo.

### Sprint 8 — Financeiro básico
✅ Concluída e testada com script dedicado (12 conferências automáticas)
- Fluxo validado: fornecedor e centro de custo cadastrados → conta a pagar lançada → avançada pelo fluxo completo Lançada → Conferida → Aprovada → Programada → Paga (com `paidAmount`/`paidAt` preenchidos automaticamente) → Conciliada → bloqueio confirmado de avançar depois de Conciliada e de cancelar conta já paga → segunda conta cancelada antes de pagar (corretamente excluída dos totais) → fluxo de caixa consolidando a conta paga (R$ 50.000 previsto e realizado no mesmo mês) sem duplicar dados com a carteira a receber.
- Módulos entregues: fornecedores, centros de custo (por empreendimento ou da organização), contas a pagar com categoria fechada (evita texto livre inconsistente) e fluxo de caixa combinando contas a pagar com a carteira a receber já existente.
- Também aplicado direto no ambiente real: deploy na Vercel conectado ao Supabase de produção, com usuário de teste "Administrador da plataforma" validado por você (Henrique) fazendo login real e navegando pelo sistema.

### Sprint 9 — Relatórios executivos
✅ Concluída e testada com script dedicado (18 conferências automáticas)
- Fluxo validado: empreendimento com 4 unidades de R$ 100.000 (VGV total R$ 400.000) → 1 unidade vendida com 5% de desconto (R$ 95.000), aprovada em 2 alçadas, contrato assinado → posição de estoque mostrando 1 vendida/3 disponíveis batendo com os valores certos → VGV vendido/disponível/% vendido/ticket médio conferidos → parcela recebida parcialmente (R$ 30.000 de R$ 95.000) refletindo em "carteira recebida" e "a receber" → conta a pagar quitada refletindo em "despesas pagas" → relatório do investidor consolidando tudo isso em uma página só.
- Módulos entregues: painel de relatórios (`/reports`) com posição de estoque e indicadores comerciais/financeiros consolidados da organização inteira, e relatório do investidor por empreendimento (`/reports/[id]`) combinando vendas, carteira, despesas e fluxo de caixa.
- **Bug corrigido durante a sprint:** a unidade nunca chegava ao status "Vendida" depois do contrato assinado — ficava presa em "Contrato em elaboração" desde a Sprint 5, porque a confirmação de assinatura nunca atualizava o status da unidade. Isso quebraria qualquer relatório de vendas/estoque. Corrigido e coberto pelo teste (unidade confirmada "Vendida" após a assinatura).

### Sprint 10 — Estabilização e implantação
⏳ Não iniciada

---

## 2. Decisões que se afastaram do PRD/arquitetura original

| Decisão | O que diz o PRD/arquitetura | O que foi implementado | Motivo | Precisa revisão? |
|---|---|---|---|---|
| Alçadas de aprovação de desconto | Valores citados como exemplo | Até 2% gerente comercial; 2-5% +diretor; acima de 5% +sócios | Usado o exemplo do PRD como padrão inicial | Confirmado pela TSH — manter |
| Expiração de reserva e correção de carteira | Não especificado o mecanismo / PRD prevê rotina de correção contínua | Varredura "preguiçosa" (recálculo sob demanda, ao consultar a tela) em vez de worker assíncrono — agora usada também para recalcular parcelas vencidas antes de exibir a lista de inadimplência | Ainda não existe processamento em background no sistema | Sim — decisão adiada de novo na Sprint 6-7 por falta de infraestrutura de fila; reavaliar antes da Sprint 10 (estabilização), já que sem rotina automática ninguém é avisado de uma parcela vencendo sem que alguém abra a tela |
| Correção em duas fases (obra e pós-Habite-se) | PRD seção 12 prevê fases de correção dentro do mesmo contrato (ex.: INCC durante a obra, IPCA + juros após a entrega) | Implementado com gatilho pela **data do Habite-se** (campo novo no empreendimento, diferente da data de entrega ao cliente). A regra da fase de obra fica no contrato (pode variar por negociação); a regra pós-Habite-se fica **no empreendimento** e vale para todos os contratos dele — confirmado pela TSH que não é configurável por contrato individual | Decisão confirmada pela TSH em 2026-07-24, resolvida ainda dentro da Sprint 6-7 como retrabalho pontual | Não — decisão fechada e testada (ver seção 1) |
| Sem rateio de despesa entre empreendimentos/SPEs | PRD menciona "rateio" no cadastro de conta a pagar | Cada conta a pagar pertence a no máximo um empreendimento (ou fica "da organização", sem empreendimento específico, quando é uma despesa da holding) | Risco identificado antes da Sprint 8; TSH não sinalizou necessidade imediata para os 2 empreendimentos-piloto, então a tela de rateio (dividir uma despesa entre vários empreendimentos) não foi construída | Sim — se surgir um caso real de despesa compartilhada, revisar antes de depender do relatório de despesas por empreendimento para decisões |
| Relatório do investidor sem módulo de participação/aporte | PRD seção 21 descreve painel do investidor com capital aportado, percentual de participação, distribuição de resultados | Implementado como resumo executivo do empreendimento (VGV, estoque, carteira, despesas, fluxo de caixa) — sem cadastro de quais investidores têm quanto de participação | A gestão de investidores (Fase 13 do PRD) nunca esteve no escopo do V1 (seção 28 do PRD não lista "gestão de investidores" nos módulos da primeira versão, só o relatório) | Sim — se a TSH precisar de extrato individual por investidor (não só o resumo do empreendimento), isso é um módulo novo, não um ajuste no relatório atual |

---

## 3. Pendências técnicas conhecidas

| Pendência | Onde impacta | Sprint sugerida para resolver |
|---|---|---|
| Upload real de arquivo do contrato assinado (hoje é só campo de referência) | Contratos | Quando Supabase Storage for configurado — antes da Sprint 10 |
| Minuta sem motor de template (dados corretos, mas sem geração de documento formatado) | Contratos | Antes da Sprint 10, ou fase 2 |
| Ausência de worker assíncrono | Reservas, e agora também recálculo de carteira/inadimplência — tudo roda "sob demanda" ao abrir a tela, não sozinho todo dia | Continua em aberto; avaliar antes da Sprint 10. Sem isso, ninguém recebe aviso automático de parcela vencendo — alguém precisa abrir a tela de inadimplência para os cálculos rodarem |
| Índices sem integração automática com fonte oficial (Banco Central/IBGE) | Correção de carteira | Fase 2 (fora do escopo da V1 original) — cadastro manual mensal é suficiente por ora, mas depende de disciplina do Financeiro |

---

## 4. Riscos identificados antes da próxima sprint (Sprint 10 — Estabilização e implantação)

| Risco | Por quê importa | Como pretendemos mitigar |
|---|---|---|
| Sistema nunca foi testado com dados reais dos empreendimentos-piloto | Todas as sprints até aqui foram validadas com dados sintéticos (scripts de teste), nunca com a estrutura real de unidades/tabelas/contratos da TSH. A estrutura real pode revelar campos faltando ou regras não previstas. | A Sprint 10 é justamente para isso — cadastrar os dois empreendimentos reais é o primeiro teste de verdade, antes de qualquer ajuste final. |
| Pendências técnicas acumuladas (seção 3) ainda em aberto | Upload real de contrato, worker assíncrono, motor de template — nenhuma é bloqueante isoladamente, mas juntas definem o que "pronto para produção" realmente significa. | Revisar a lista da seção 3 com a TSH antes de declarar a Sprint 10 concluída, decidindo explicitamente o que fica para depois e o que precisa fechar agora. |
| Ambiente de preview da Vercel aponta para o mesmo banco de produção | Combinado anteriormente (sem banco de staging separado) — qualquer deploy de preview (branch/PR) lê e escreve nos mesmos dados reais. | Aceitável enquanto for só a equipe interna testando; reavaliar se for abrir acesso a mais pessoas antes de separar um projeto Supabase de staging. |
| Usuários reais da TSH ainda não cadastrados (só o admin de teste) | Antes de ir para uso real, cada pessoa da equipe (financeiro, comercial, jurídico...) precisa do papel certo — hoje só existe um usuário de teste com acesso total. | Levantar com a TSH quem vai usar o sistema e em qual papel, e convidar cada um pela tela de Usuários antes de considerar a implantação concluída. |
| UX mínima (HTML simples, sem design system) | Aceitável para validar o fluxo de dados nas sprints anteriores, mas pode gerar atrito real quando a equipe operacional (não técnica) começar a usar no dia a dia. | Coletar feedback específico durante o teste com dados reais na Sprint 10 e decidir com a TSH se algum ajuste de UX é prioridade antes do uso contínuo, ou se fica para depois. |

---

## Como manter este documento

Ao final de cada sprint, o Claude Code deve:
1. Marcar a sprint como ✅ concluída na seção 1, com o fluxo real testado e um exemplo de valores conferidos.
2. Adicionar à seção 2 qualquer decisão que tenha se afastado do PRD/arquitetura, mesmo que pareça pequena.
3. Adicionar à seção 3 qualquer atalho, simplificação temporária ou funcionalidade adiada.
4. Preencher a seção 4 com riscos específicos da próxima sprint, antes de começar a implementá-la.

# Status de Implantação — Incorpora (TSH Incorporadora)

> Este documento deve ser atualizado pelo Claude Code ao final de cada sprint concluída, antes de iniciar a próxima. Objetivo: permitir auditoria do progresso por alguém não-técnico, sem precisar acompanhar o desenvolvimento sprint a sprint.

**Última atualização:** Sprint 5 concluída

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
⏳ Não iniciada

### Sprint 8 — Financeiro básico
⏳ Não iniciada

### Sprint 9 — Relatórios executivos
⏳ Não iniciada

### Sprint 10 — Estabilização e implantação
⏳ Não iniciada

---

## 2. Decisões que se afastaram do PRD/arquitetura original

| Decisão | O que diz o PRD/arquitetura | O que foi implementado | Motivo | Precisa revisão? |
|---|---|---|---|---|
| Alçadas de aprovação de desconto | Valores citados como exemplo | Até 2% gerente comercial; 2-5% +diretor; acima de 5% +sócios | Usado o exemplo do PRD como padrão inicial | Confirmado pela TSH — manter |
| Expiração de reserva | Não especificado o mecanismo | Varredura "preguiçosa" (verificação sob demanda) em vez de worker assíncrono | Ainda não existe processamento em background no sistema | Sim — avaliar necessidade de worker assíncrono real na Sprint 6-7 (correção diária de índices provavelmente vai exigir) |

---

## 3. Pendências técnicas conhecidas

| Pendência | Onde impacta | Sprint sugerida para resolver |
|---|---|---|
| Upload real de arquivo do contrato assinado (hoje é só campo de referência) | Contratos | Quando Supabase Storage for configurado — antes da Sprint 10 |
| Minuta sem motor de template (dados corretos, mas sem geração de documento formatado) | Contratos | Antes da Sprint 10, ou fase 2 |
| Ausência de worker assíncrono | Reservas (hoje), Carteira/indexadores (crítico a partir da Sprint 6-7) | Sprint 6-7 |

---

## 4. Riscos identificados antes da próxima sprint

*(preencher pelo Claude Code antes de iniciar a Sprint 6-7)*

---

## Como manter este documento

Ao final de cada sprint, o Claude Code deve:
1. Marcar a sprint como ✅ concluída na seção 1, com o fluxo real testado e um exemplo de valores conferidos.
2. Adicionar à seção 2 qualquer decisão que tenha se afastado do PRD/arquitetura, mesmo que pareça pequena.
3. Adicionar à seção 3 qualquer atalho, simplificação temporária ou funcionalidade adiada.
4. Preencher a seção 4 com riscos específicos da próxima sprint, antes de começar a implementá-la.

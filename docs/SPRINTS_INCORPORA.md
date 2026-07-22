# Plano de Sprints — Incorpora

Plataforma de gestão da incorporação imobiliária. Este documento define a ordem de implantação da V1, conforme escopo aprovado na seção 28 do documento de arquitetura. Cada sprint deve ser concluída, testada e validada antes de iniciar a próxima, respeitando as dependências indicadas.

---

## Sprint 0 — Fundação técnica

**Objetivo:** infraestrutura base do sistema.

- Setup do projeto: Next.js + TypeScript + Prisma + PostgreSQL/Supabase
- Repositório Git e deploy configurado na Vercel
- Schema inicial de banco com as ~45 entidades centrais (seção 25 do doc de arquitetura)
- Autenticação (Supabase Auth)
- Módulo de usuários e permissões (roles)
- Módulo de organizações e SPE
- `DevelopmentEvent` — evento central de auditoria/timeline

**Critério de conclusão:** login funcional, estrutura multiempresa (Organização → SPE) criável, todas as ações relevantes gerando registro de auditoria.

---

## Sprint 1-2 — Produto e disponibilidade

**Objetivo:** modelar o produto imobiliário. Módulo mais estrutural — os demais módulos dependem do modelo de unidade estar correto.

- Cadastro de empreendimentos
- Unidades verticais
- Lotes
- Vagas e escaninhos
- Vínculo de unidades (unidade principal + unidades acessórias)
- Documentos e plantas
- Mapa de disponibilidade

**Critério de conclusão:** é possível cadastrar um empreendimento completo (vertical ou loteamento), com todas as unidades e seus vínculos, e visualizar o mapa de disponibilidade atualizado.

---

## Sprint 3-4 — Comercial

**Objetivo:** fluxo de vendas, da tabela até a venda fechada.

- Tabelas de venda
- Simulador de fluxo de pagamento
- Reservas
- Propostas
- Fluxo de aprovação
- Conversão de proposta em venda
- Comissão

**Critério de conclusão:** uma unidade disponível pode passar por reserva → proposta → aprovação → venda, com cálculo de comissão.

---

## Sprint 5 — Contratos

**Objetivo:** formalização da venda.

- Dados contratuais
- Geração de minuta
- Upload de contrato assinado
- Status de assinatura (manual — sem assinatura eletrônica integrada na V1)
- Criação automática da carteira a partir da venda fechada

**Critério de conclusão:** uma venda gera contrato e, a partir da confirmação de assinatura, a carteira de recebíveis correspondente é criada automaticamente.

---

## Sprint 6-7 — Carteira e indexadores

**Objetivo:** gestão dos recebíveis. Módulo mais complexo do sistema — reservar tempo extra e validar regras de correção com atenção antes de fechar.

- Parcelas
- Recebimentos manuais
- Correção por índices
- Inadimplência
- Extrato por unidade/cliente
- Antecipação simulada

**Critério de conclusão:** a carteira gerada na Sprint 5 reflete corretamente parcelas corrigidas, recebimentos lançados e status de inadimplência.

---

## Sprint 8 — Financeiro básico

**Objetivo:** controle financeiro da incorporadora. Módulo desacoplado — pode rodar em paralelo com a Sprint 6-7 se houver mais de uma frente de trabalho.

- Contas a pagar
- Fornecedores
- Centros de custo
- Fluxo de caixa

**Critério de conclusão:** despesas lançadas por centro de custo refletem corretamente no fluxo de caixa.

---

## Sprint 9 — Relatórios executivos

**Objetivo:** visão consolidada da operação. Depende dos módulos anteriores com dados fluindo corretamente.

- Mapa de vendas
- Posição de estoque
- Carteira recebida
- Carteira a receber
- Inadimplência
- Contas a pagar
- Fluxo de caixa
- Relatório do investidor

**Critério de conclusão:** todos os relatórios da lista geram dados coerentes com o que foi cadastrado nas sprints anteriores.

---

## Sprint 10 — Estabilização e implantação

**Objetivo:** preparar o sistema para uso real.

- Testes de ponta a ponta
- Correção de bugs
- Ajustes de UX
- Preparação do ambiente para o teste de uso com os dois empreendimentos-piloto

**Critério de conclusão:** sistema pronto para receber dados reais dos empreendimentos-piloto.

---

## Fora de escopo da V1

Não implementar nas sprints acima (ver seções 29 e 30 do documento de arquitetura):

**Fase 2:** integração bancária completa, boleto automático, Pix, conciliação automática, assinatura eletrônica integrada, portal do cliente, régua automática de cobrança, cessão, distrato completo, renegociação avançada, relatórios automáticos, painéis dos investidores, integração contábil.

**Fase 3:** multiempresa comercial, SaaS, cobrança por plano, aplicativo do corretor, aplicativo do cliente, inteligência artificial, previsão de inadimplência, análise de viabilidade, integração com CRM de leads, integração com portais imobiliários, BI avançado, benchmarking entre empreendimentos.

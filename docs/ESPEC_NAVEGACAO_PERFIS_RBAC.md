# Especificação — Reestruturação de Navegação + Perfis de Usuário (RBAC) — Incorpora

Duas frentes relacionadas, propostas pelo product owner após avaliação geral do sistema em uso:
1. **Reorganização da navegação** — agrupar o menu (hoje uma lista plana de ~15 itens) em famílias por natureza (Cadastros, Financeiro, Gerencial, Configurações), separando o que é cadastro-base do que é operação do dia a dia.
2. **Perfis de usuário configuráveis (RBAC granular)** — permissões por módulo × ação (Incluir/Consultar/Editar/Excluir) × empreendimento, com papéis-padrão prontos e customizáveis.

**Sequenciamento:** esta fase entra **após** as sprints visuais (V1–V5) terminarem — assim o visual se aplica sobre a estrutura nova, sem retrabalho. A reorganização de navegação (Parte 1) deve preceder ou acompanhar os Perfis (Parte 2), pois os dois tocam a mesma superfície (menu + o que cada usuário vê).

Baseado em pesquisa do padrão RBAC multi-tenant (par ação/recurso agrupado em papéis; papéis por organização; princípio do menor privilégio; evitar "explosão de papéis" com papéis-padrão + customização). Conecta-se diretamente às Fundações multi-tenant já construídas (`src/server/scope.ts`, isolamento por organização) — este é o próximo nível de granularidade sobre aquela base.

---

## PARTE 1 — Reestruturação da Navegação

### 1.1 Problema atual
O menu lateral lista ~15 itens de naturezas diferentes no mesmo nível (cadastros-base, operação diária, configurações, financeiro, gerencial). Consequência observada no test drive: telas "estritamente gerenciais" (ex.: cadastro/edição de unidades, feito no início do empreendimento) ficam expostas como se fossem uso diário.

### 1.2 Nova estrutura de grupos (menu lateral com submenus)

**CADASTROS** (base do sistema — geralmente configurado no início, vira fundação do resto)
- Empreendimentos (cadastro do empreendimento em si)
- Unidades (a tela gerencial de cadastro/alteração de status das unidades — hoje exposta ao abrir o empreendimento; passa a viver aqui)
- Clientes
- Imobiliárias e Corretores
- Tabelas de venda
- Permutantes (+ vínculo das unidades do permutante, que alimenta o espelho — ver nota 1.4)
- SPEs
- Investidores

**FINANCEIRO** (operação financeira)
- Inadimplência
- Contas a pagar
- Recebíveis avulsos
- Fluxo de caixa

**GERENCIAL** (visão e parâmetros de decisão)
- Parâmetros de avaliação (o motor de VPL — hoje "Parâmetros de avaliação", movido para cá)
- (futuro: Dashboard executivo, Relatórios da Fase C encaixam aqui)

**CONFIGURAÇÕES** (regras parametrizáveis — todas "por empreendimento OU regra geral", ver 1.3)
- Regras de reserva
- Liberação de comissão
- Regra de distrato
- Régua de cobrança
- Renegociação de parcelas
- Documentos (modelos — já existe)
- Contas bancárias (já existe)
- Perfis de usuário (Parte 2)
- Usuários (Parte 2)
- Sistema / Jobs / Auditoria (já existe)

**OPERAÇÃO DIÁRIA** (o que fica no acesso rápido, fora de grupo ou em grupo próprio)
- Espelho de vendas
- Vendas
- Comercial (reservas, propostas, aprovações)
- Comissões
- Aprovações pendentes

**Nota:** o espelho de vendas e o fluxo comercial (reserva→proposta→venda) são o uso diário do corretor/gerente e devem permanecer de acesso fácil, não enterrados em Cadastros. O que muda é tirar os **cadastros-base** e as **configurações** do caminho diário.

### 1.3 Princípio transversal: "por empreendimento OU regra geral"
Toda tela de CONFIGURAÇÕES deve permitir definir:
- uma **regra geral** (padrão da organização, vale para todos os empreendimentos que não têm regra própria), e
- **regras por empreendimento** (sobrescrevem a geral para aquele empreendimento).

Já vale hoje para várias (parâmetros de avaliação, distrato); a spec exige tornar isso **consistente** em todas: regras de reserva, liberação de comissão, régua de cobrança, renegociação. UI padrão: seletor "Aplicar a: [Todos os empreendimentos / Empreendimento específico]" no topo de cada tela de configuração, com a lista de sobrescrições existentes.

### 1.4 Permuta dentro de Cadastros
O subgrupo Permuta passa para CADASTROS e mantém o vínculo das unidades do permutante que alimenta o espelho de vendas (marcação/status de unidade de permutante — já especificado em `ESPEC_PERMUTANTES.md`). O que muda é a localização no menu, não o comportamento.

### 1.5 Migração sem quebra
Reorganização é de navegação/rotas — os dados e as telas existem. Cuidar de: redirects das rotas antigas para as novas (ninguém com link salvo quebra), e que a reforma visual (V1–V5) já feita não seja desfeita. As telas continuam as mesmas; mudam de lugar no menu e ganham o agrupamento.

---

## PARTE 2 — Perfis de Usuário (RBAC granular)

### 2.1 Conceito
Substituir os papéis fixos do código por **perfis configuráveis por organização**. Cada perfil define, por **módulo** do sistema, quais **ações** o usuário pode executar, e a **quais empreendimentos** tem acesso.

### 2.2 Modelo de dados (o par ação/recurso, padrão RBAC)

**Módulos (recursos)** — a lista de áreas do sistema:
Empreendimentos, Unidades, Clientes, Imobiliárias/Corretores, Tabelas de venda, Permutantes, SPEs, Investidores, Espelho/Reservas, Propostas, Vendas, Contratos, Comissões, Carteira/Recebíveis, Inadimplência, Contas a pagar, Recebíveis avulsos, Fluxo de caixa, Aprovação de propostas, Relatórios, Configurações (cada sub-config pode ser um módulo), Usuários/Perfis.

**Ações** (por módulo): **Incluir, Consultar, Editar, Excluir**. Algumas áreas têm ações especiais além do CRUD (ex.: Propostas → "Aprovar"; Comissões → "Liberar"; Contas a pagar → "Aprovar pagamento") — modelar como ações adicionais do módulo quando fizer sentido.

**Escopo de empreendimento:** o perfil (ou a atribuição do usuário) define **a quais empreendimentos** o acesso se aplica — "Todos" ou lista específica. Um corretor pode ter acesso só ao empreendimento X.

**Estrutura:**
```
Perfil { id, organizationId, nome, descricao, permissoes[] }
Permissao { modulo, acoes: [INCLUIR|CONSULTAR|EDITAR|EXCLUIR|...] }
Usuário { ..., perfilId, empreendimentosAcesso: "TODOS" | [ids] }
```

### 2.3 Tela de cadastro de perfil (a matriz)
Uma matriz **módulo (linhas) × ação (colunas)** com checkboxes — o padrão que o product owner desenhou (referência: imagem no doc de avaliação). Marca-se, por módulo, Incluir/Consultar/Editar/Excluir. Atalhos: "marcar tudo", "marcar linha", "só leitura" (marca Consultar em tudo).

Exemplos de perfis-padrão a **seedar** por organização (customizáveis — evita a "explosão de papéis" e dá ponto de partida):
- **Administrador da plataforma:** tudo, todos os empreendimentos.
- **Diretor:** tudo exceto configurações sensíveis de sistema; todos os empreendimentos.
- **Gerente comercial:** Consultar em Empreendimentos/Unidades (não Inclui obra); tudo em Clientes/Reservas/Propostas/Vendas; Aprovar propostas; Consultar financeiro.
- **Corretor:** Incluir/Consultar/Editar Clientes; Incluir Reservas e Propostas; Consultar Espelho; **sem** acesso a financeiro, SPEs, configurações; empreendimentos limitados aos atribuídos.
- **Financeiro:** tudo em Contas a pagar/Recebíveis/Fluxo/Inadimplência; Consultar Vendas/Carteira; sem Comercial.
- **Auditor:** Consultar em tudo, Incluir/Editar/Excluir em nada.

### 2.4 Cadastro de usuário
No cadastro de usuário: selecionar o **perfil** e, ali, escolher **quais empreendimentos** o usuário acessa (Todos / seleção). Referência: imagem no doc de avaliação.

### 2.5 Aplicação (enforcement) — o ponto crítico
As permissões precisam ser aplicadas em **três camadas**, não só na UI:
1. **UI:** esconder/desabilitar botões e itens de menu que o perfil não permite (ex.: corretor não vê "Contas a pagar" no menu; não vê botão "Excluir" em cliente). Boa experiência.
2. **Servidor (obrigatório):** toda ação (server action / rota) valida a permissão do usuário **no servidor**, independente da UI — esconder botão não é segurança. Reaproveitar/estender o `AccessContext` e o helper `scope.ts` das Fundações: hoje ele garante isolamento por organização; passa a checar também módulo+ação+empreendimento.
3. **Dados (já existe):** o isolamento por organização (Fundações) e o RLS (quando ativado) continuam como a camada mais profunda.

**Filtro por empreendimento:** um usuário com acesso só ao empreendimento X não vê no espelho, nas vendas, na carteira, nos relatórios, nada de outros empreendimentos — filtrado no servidor.

### 2.6 Segurança e testes
- Testes de fronteira (no padrão do teste Org A × Org B já existente): um corretor não consegue, nem por chamada direta de API, excluir um cliente (sem permissão de Excluir), acessar contas a pagar (sem o módulo), nem ver empreendimento não atribuído. Resposta: "não autorizado"/"não encontrado", conforme o caso.
- Todo o conjunto entra na suíte permanente + CI.
- Não deixar nenhum usuário sem perfil (fallback seguro: sem perfil = sem acesso, nunca acesso total por omissão).
- Migração dos usuários atuais: mapear os papéis fixos de hoje para os perfis-padrão equivalentes, sem perda de acesso para quem já usa.

### 2.7 Escopo consciente (o que NÃO é agora)
- Não é ABAC (permissão por atributo/horário/localização) — RBAC com escopo de empreendimento cobre a necessidade; ABAC é complexidade desnecessária agora.
- Hierarquia de papéis (herança) — evitar por ora (fonte de "permission sprawl"); perfis planos são suficientes e mais fáceis de auditar.

---

## Sequência sugerida de implementação

| Etapa | Conteúdo |
|---|---|
| 1 | Reestruturação de navegação (Parte 1): grupos, submenus, mover telas, redirects, consistência "geral × empreendimento" nas configurações |
| 2 | Modelo de dados de RBAC (perfis, permissões, escopo de empreendimento) + seed dos perfis-padrão + migração dos usuários atuais |
| 3 | Enforcement no servidor (estender `AccessContext`/`scope.ts` para módulo+ação+empreendimento) + testes de fronteira |
| 4 | Tela de cadastro de perfil (matriz módulo × ação) + escopo de empreendimento no cadastro de usuário |
| 5 | Enforcement na UI (esconder/desabilitar por permissão) + filtro de empreendimento em todas as telas de dados |
| 6 | Varredura de segurança completa + regressão + CI |

Rigor de sempre. A etapa 3 (enforcement no servidor) é a mais crítica de segurança — mesmo padrão de cuidado das Fundações multi-tenant, com testes de fronteira antes de considerar pronto.

## Posição na fila geral
Após as sprints visuais V1–V5. Antes de retomar a fila de funcionalidades pesadas (Aportes 3–7, permuta financeira, Fase C, Portal), porque: (a) os Perfis tocam a estrutura de navegação e o `scope.ts` que todo o resto usa — melhor estabilizar antes de empilhar mais; (b) o Portal do Cliente (acesso externo) se beneficia de ter o RBAC maduro; (c) vender pra outra incorporadora exige perfis configuráveis desde o dia 1.

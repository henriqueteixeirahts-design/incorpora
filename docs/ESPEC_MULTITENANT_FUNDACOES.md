# Especificação — Fundações Multi-Tenant, Segurança e Testes (Incorpora)

**Decisão estratégica registrada:** o Incorpora será preparado para venda a outras incorporadoras (SaaS multi-tenant). Este documento define as **fundações** que devem ser implementadas ANTES de existir um segundo cliente — enquanto errar ainda é barato. Não adiciona funcionalidade visível ao usuário: adiciona garantias.

Três pilares: (1) isolamento por organização testado como fronteira de segurança, (2) segunda camada de defesa no banco (RLS), (3) suíte de testes permanente. Mais um checklist do que precisa deixar de ser "da TSH" para ser "da organização".

**Prioridade e encaixe na fila:** os pilares 1 e 3 devem entrar o quanto antes (idealmente logo após o fechamento do cadastro de SPE), porque cada módulo novo construído sem eles aumenta o custo de retrofit. O pilar 2 (RLS) pode vir logo em seguida, antes do Portal do Cliente obrigatoriamente.

---

## PILAR 1 — Isolamento por organização como fronteira de segurança

### 1.1 Estado atual e o gap

O schema já tem `Organization` no topo da hierarquia e as entidades principais têm `organizationId` (direto ou por cascata via SPE/empreendimento). Mas: (a) nunca existiu uma segunda organização real, então o isolamento nunca foi exercitado; (b) a filtragem por organização depende de cada função de servidor lembrar de filtrar — não há garantia estrutural.

### 1.2 Auditoria de escopo (primeira tarefa)

Varredura completa do schema e das funções de servidor respondendo, entidade por entidade:
1. Tem caminho claro até `organizationId` (direto ou por relação obrigatória)? Se não, corrigir o schema (migration aditiva)
2. Toda query de leitura/escrita filtra por organização? Listar as que não filtram e corrigir
3. IDs expostos em URL/params: alguém que troque o ID na URL consegue acessar registro de outra organização? (teste de referência insegura)

Entregável: tabela entidade × status no `STATUS_IMPLANTACAO.md` + correções aplicadas.

### 1.3 Guarda estrutural no código

Criar um helper central de acesso a dados que **exige** o contexto da organização (derivado da sessão do usuário, nunca de parâmetro do cliente) e o injeta em toda query — em vez de cada função montar seu próprio `where`. Padrão: nenhuma query Prisma "crua" nas funções de negócio para entidades com escopo de organização; tudo passa pelo helper. Funções existentes migradas gradualmente; TODO novo código nasce assim.

### 1.4 Teste de fronteira (permanente)

Criar no ambiente de teste **duas organizações** (Org A = clone mínimo da TSH, Org B = "Incorporadora Teste") e um teste automatizado que verifica, para cada módulo: usuário da Org B não vê, não lista, não edita, não exclui NADA da Org A — nem por listagem, nem por ID direto, nem por relatório/dashboard. Resposta para acesso indevido: "não encontrado" (nunca "sem permissão" — não confirmar existência). Este teste entra na suíte permanente (Pilar 3) e roda a cada mudança.

---

## PILAR 2 — RLS: a segunda tranca (Row Level Security no Postgres/Supabase)

### 2.1 Conceito

Hoje, se um bug de código esquecer um filtro, o banco entrega o dado. Com RLS ativado, **o próprio Postgres recusa** retornar linhas de outra organização, mesmo que a query peça — política declarada no banco, por tabela: `organizationId = organização_da_sessão`. É defesa em profundidade: o bug de código passa a ser um erro visível ("nenhum dado") em vez de um vazamento silencioso.

### 2.2 Implementação (cuidadosa, por fases)

1. A aplicação passa a definir a organização da sessão na conexão (`SET app.current_org = ...` via Prisma middleware/extensão) — sem mudar comportamento ainda
2. Ativar RLS tabela a tabela **em modo permissivo de teste** num branch/ambiente de staging do Supabase, rodando a suíte completa — qualquer teste que quebrar revela query sem contexto (bug latente encontrado de graça)
3. Ativar em produção por grupos de tabelas, com plano de rollback simples (desativar a política)
4. Exceções documentadas: tabelas globais (ex.: catálogo de índices oficiais do BC pode ser compartilhado entre organizações — decisão explícita, não esquecimento)

**Atenção técnica:** RLS com Prisma + connection pooling (porta 6543) exige o padrão de setar a variável por transação, não por conexão. Pesquisar o padrão recomendado vigente (Prisma client extensions + `$transaction`) antes de implementar — este documento fixa o requisito, não a técnica exata.

### 2.3 Prazo-limite

RLS ativo em produção é **pré-requisito do Portal do Cliente** (primeiro acesso externo). Na fila atual há tempo de sobra — mas fica registrado como bloqueador formal.

---

## PILAR 3 — Suíte de testes permanente

### 3.1 Do artesanal ao permanente

Os scripts de regressão por sprint (escreve → roda → apaga) funcionaram muito bem até aqui, mas morrem após cada entrega. A partir de agora: **os testes ficam no repositório e rodam automaticamente a cada commit/push** (CI — ex.: GitHub Actions, que é gratuito para o volume atual).

### 3.2 Estrutura

| Camada | O quê | Base |
|---|---|---|
| Unidade | Funções puras: validadores (CPF/CNPJ), motor de correção (duas fases), futuro VPL, futuro mútuo/permuta | Converter os scripts já escritos nas sprints — a lógica de asserção existe, é migrá-la para o runner |
| Integração | Funções de servidor contra banco de teste (Postgres via Docker, já usado): CRUD, regras (duplicidade, soma de sócios, bloqueios de exclusão) | Mesma conversão |
| Fronteira | O teste de isolamento Org A × Org B (Pilar 1.4) | Novo |
| Regressão de fluxo | O ciclo completo (reserva → venda → contrato → carteira → recebimento) que a Sprint 10 rodou uma vez — vira permanente | Converter |

Runner sugerido: Vitest (padrão do ecossistema, rápido, TS nativo) — decisão final do desenvolvedor, mas UM runner só.

### 3.3 Regras de operação

- Push com teste quebrando **não faz deploy** (a Vercel só publica se o CI passar)
- Todo bug encontrado daqui em diante ganha um teste que o reproduz antes da correção (o bug do badge de validade e o dos IDs duplicados do AddressFields são exemplos perfeitos do que essa prática teria pego antes)
- Módulo novo = testes novos na suíte, não script descartável
- Meta realista: não é 100% de cobertura — é cobrir **cálculo financeiro, isolamento e fluxos críticos** primeiro

---

## PILAR 4 — Checklist "da TSH" → "da organização"

O que hoje é fixo/assumido e precisa virar configurável por organização antes do segundo cliente (fazer conforme os módulos forem tocados — não precisa de força-tarefa):

| Item | Estado atual | Alvo |
|---|---|---|
| Nome/logo/identidade visual | TSH aplicada no código | Tema por organização (logo, cores) — a estrutura de tokens CSS já existe, virar dado da organização |
| Papéis e permissões | Seed fixo | Papéis-padrão clonados na criação da organização + customização própria |
| Categorias (documentos, despesas, chamados) | Seed fixo | Padrão global + adições por organização |
| Modelos de documento (motor de templates, Fase A) | — (a construir) | JÁ nascer por organização (com biblioteca-padrão clonável) |
| Numerações (contratos CT-ANO-XXXX) | Sequência única | Sequência por organização |
| Parâmetros por empreendimento | Já corretos (pertencem ao empreendimento) | ✔ nada a fazer — a filosofia atual já é a certa |
| Cron jobs (correção, índices) | Iteram organizações? verificar | Todo job itera todas as organizações ativas |
| Onboarding de organização nova | Cirurgia manual no banco | Fluxo: criar organização → papéis-padrão → admin convidado → configurações iniciais (pode ser tela interna de super-admin, não precisa ser self-service ainda) |
| Plano/cobrança/limites | — | Fase futura explícita — NÃO fazer agora |

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Suíte de testes: runner + CI + conversão dos testes de cálculo financeiro existentes | Destrava tudo; deploy passa a depender do CI |
| 2 | Auditoria de escopo (1.2) + correções + helper central (1.3) | |
| 3 | Teste de fronteira Org A × Org B na suíte (1.4) | A partir daqui, todo módulo novo é testado contra vazamento |
| 4 | RLS em staging → produção (Pilar 2) | Antes do Portal do Cliente, obrigatório |
| 5 | Checklist Pilar 4: itens marcados "a construir" nascem certos; os demais, conforme os módulos forem tocados | Contínuo |
| 6 | Fluxo de onboarding de organização (tela de super-admin) | Quando o segundo cliente estiver próximo de real |

**Encaixe na fila geral:** etapas 1-3 idealmente logo após o fechamento do cadastro de SPE, antes do Módulo Comercial (o espelho de vendas e tudo que vem depois já nascem cobertos). Etapa 4 em qualquer ponto antes do Portal do Cliente. Etapas 5-6 contínuas/sob demanda.

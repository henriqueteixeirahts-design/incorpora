# Status de Implantação — Incorpora (TSH Incorporadora)

> Este documento deve ser atualizado pelo Claude Code ao final de cada sprint concluída, antes de iniciar a próxima. Objetivo: permitir auditoria do progresso por alguém não-técnico, sem precisar acompanhar o desenvolvimento sprint a sprint.

**Última atualização:** Pós-Sprint 10 — comunicação visual da TSH aplicada (cores, tipografia, logo), redesign completo do padrão de UI concluído (lista com filtro/ordenação/paginação + cadastro em modal, replicado nos 8 módulos de listagem, mais a área de Configurações centralizada), e integração automática de índices (INCC/IPCA/IGP-M) com o Banco Central. Motor de template de minuta segue fora de escopo por decisão consciente. Os dois empreendimentos-piloto reais da TSH (TSH Laguna e Condomínio Lake House) já foram cadastrados em produção.

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
🔶 Regressão técnica concluída (testada com 17 conferências automáticas + varredura manual de todas as telas) — **falta uma decisão da TSH sobre as pendências acumuladas antes de considerar a implantação encerrada** (ver abaixo)
- Fluxo validado: cenário combinando os dois tipos de empreendimento num teste só — **um vertical** (torre, pavimento, unidade principal + vaga + escaninho vinculados, tabela de venda, corretor/imobiliária, comissão com split, correção em duas fases obra/pós-Habite-se) e **um loteamento** (lotes com quadra/testada/profundidade, sem torre/pavimento) — cada um passando pelo ciclo completo reserva → proposta → aprovação → venda → contrato → assinatura → carteira → recebimento parcial. Também testado: reserva cancelada devolvendo a unidade para "Disponível", bloqueio manual de unidade, conta a pagar em cada empreendimento, e confirmação de que os relatórios somam corretamente quando têm mais de um empreendimento mas continuam isolados quando filtrados por um só (nenhum vazamento de dado entre empreendimentos).
- Também testado neste ciclo: papel "Comercial" confirmado **sem** permissão de aprovar proposta nem conta a pagar (RBAC funcionando como esperado).
- Varredura manual de todas as telas do menu (dashboard, empreendimentos, mapa vertical e de loteamento, comercial, tabelas de venda, relatórios gerais e por empreendimento, vendas, contas a pagar, fluxo de caixa, inadimplência, índices, clientes, parceiros, fornecedores/centros de custo, usuários, SPEs) com o cenário misto acima — nenhum erro de console, nenhuma requisição falhando.
- **Nenhum bug novo encontrado nesta sprint** (o único bug de status encontrado na jornada foi na Sprint 9, já corrigido e coberto por teste).
- **O que falta para a sprint estar de fato concluída** (não é trabalho técnico, é decisão/ação da TSH): (1) ~~revisar a lista de pendências da seção 3 e decidir o que fecha agora vs. o que fica para depois~~ — feito, ver "Pós-Sprint 10" abaixo; (2) cadastrar os usuários reais da equipe com os papéis corretos; (3) fazer o primeiro cadastro real dos dois empreendimentos-piloto — que é o teste que efetivamente valida se o sistema está "pronto", já que tudo até aqui foi testado com dados sintéticos.

### Pós-Sprint 10 — Pendências técnicas priorizadas pela TSH
✅ Concluídas e testadas as três pendências que a TSH pediu para resolver antes do cadastro dos empreendimentos reais (motor de template de minuta mantido fora de escopo por decisão consciente):

1. **Upload real do contrato assinado.** Bucket privado `contracts` criado no Supabase Storage (limite 10MB, só PDF). O upload acontece no servidor (`src/server/storage.ts`), nunca expõe o arquivo publicamente — o download na tela do contrato usa uma URL assinada de curto prazo (1 hora), gerada sob demanda a cada acesso. Campo do banco renomeado de `signedDocumentUrl` (texto livre) para `signedDocumentPath` (caminho interno do bucket). Testado ponta a ponta: upload de um PDF real, rejeição de arquivo não-PDF, rejeição de arquivo acima de 10MB, geração do link assinado e download funcionando na tela de venda em ambiente real (Vercel + Supabase de produção).
2. **Worker assíncrono para correção mensal.** Rota `/api/cron/recalculate-installments`, protegida por segredo (`CRON_SECRET`, bearer token), agendada pela Vercel para rodar automaticamente todo dia 2 às 03:00 (`vercel.json`). Recalcula as parcelas em aberto de todas as organizações, sem depender de alguém abrir a tela de inadimplência. A varredura "sob demanda" que já existia continua ativa como rede de segurança complementar (ex.: se alguém abrir a tela entre duas execuções do cron). **Bug encontrado e corrigido durante a implementação:** o middleware de autenticação (`src/proxy.ts`) redirecionava qualquer chamada a `/api/cron/*` para a tela de login (por não haver sessão de usuário), o que faria a Vercel nunca conseguir disparar o job em produção — corrigido excluindo `api/cron` do redirecionamento. Testado localmente: chamada sem segredo e com segredo errado retornam 401; com o segredo correto, retorna 200 e o resumo do recálculo.
3. **Teste da agregação de inadimplência com valor real.** Cobre o gap identificado no relatório da Sprint 9: script dedicado cria 3 parcelas vencidas de valores diferentes (R$ 120.000, R$ 85.000 e R$ 200.000 — soma nominal R$ 405.000) e confirma que a lista de inadimplência agrega um valor corrigido real e não-zero (multa de 2% + mora de 1% ao mês aplicadas corretamente por parcela, conferidas centavo a centavo contra o cálculo manual), além de confirmar que o recálculo em massa (mesmo motor usado pelo cron) é idempotente — rodar duas vezes não duplica nem quebra nada.

✅ **`CRON_SECRET` confirmado em produção** (2026-07-26): chamada de teste direta a `https://incorpora-six.vercel.app/api/cron/recalculate-installments` com o segredo correto retornou 200 (com o resumo real do recálculo); sem o segredo ou com um segredo errado, retornou 401 nos dois casos. O job agendado (dia 2 de cada mês) está pronto para rodar de verdade em produção.

### Pós-Sprint 10 — Cadastro dos empreendimentos-piloto reais
✅ Concluído. **TSH Laguna** (vertical, SPE TSH Parque Amazônia LTDA, 141 unidades — 46 Tipo01, 92 Tipo02, 3 Penthouses — mais 8 vagas extras, VGV R$ 84.462.400) e **Condomínio Lake House** (loteamento, SPE Lake House LTDA, 575 lotes em 31 quadras, VGV R$ 168.348.885) cadastrados diretamente em produção via script de seed que reutiliza as mesmas funções de servidor da aplicação (não é inserção SQL bruta), com a mesma trilha de auditoria/histórico de qualquer cadastro feito pela UI. Ambos 100% disponíveis, prontos para o início da operação comercial real.

### Pós-Sprint 10 — Comunicação visual e redesign do padrão de UI
✅ Concluído, em duas frentes:

1. **Identidade visual da TSH** aplicada em todo o sistema: paleta oficial (Azul, Azul Claro, Marrom, Dourado, Bege) como tokens CSS globais, fonte Inter (oficial da marca) via `next/font/local`, logo vetorial real no login e na sidebar, favicon com o símbolo da marca, grafismo (padrão de barras) usado com moderação só no painel de login. Como a maior parte do sistema já herdava cor/fonte de variáveis CSS globais em vez de estilo por tela, a troca de tema se propagou às ~44 telas do sistema sem precisar editar cada uma.
2. **Redesign estrutural da UI**, baseado em `docs/BRIEFING_UI_REDESIGN.md` (referência: sistema Obra Prima) — separação entre lista (com busca, ordenação por coluna, paginação) e cadastro (em modal, com abas quando o cadastro tem sub-informações). Replicado nos 8 módulos de listagem do sistema:
   - **Clientes** — módulo-prova de conceito, com abas Dados/Contatos/Atendimento/Anexos/Acessos. Contatos (múltiplos e-mails/telefones por cliente) e Anexos (upload real via Storage) são funcionalidade nova; Atendimento e Acessos ficam como placeholder "em breve" até haver dado real pra mostrar.
   - **SPEs, Imobiliárias/Corretores, Fornecedores/Centros de custo** — cadastros simples de entidade única, modal sem abas.
   - **Usuários** — adaptado ao fluxo próprio do módulo: criar continua sendo convite por e-mail (Supabase Auth), editar troca só o papel, excluir vira revogação de acesso (não apaga o usuário), com proteção contra auto-revogação e contra revogar o último Administrador da plataforma.
   - **Empreendimentos** — só a lista principal entrou no padrão; as telas internas (torres, unidades, mapa) não fizeram parte deste redesign.
   - **Vendas** — não tem cadastro manual (venda nasce da conversão de proposta), então ganhou só lista com filtro/ordenação/paginação; o lançamento de comissão virou modal.
   - **Contas a pagar** — modal com abas Dados/Pagamento/Faturamento/Anexos (sem aba "Itens", que o modelo de dados atual não tem). Edição de dados bloqueada depois que a conta sai do status "Lançada", preservando a integridade do fluxo auditável de aprovação.
   - **Área de Configurações** (`/settings`) criada, agrupando Usuários, Índices e Fornecedores/Centros de custo — que saíram do menu operacional principal — por seção (Financeiro, Acesso ao sistema). O motor de template de minuta, citado no briefing como candidato a entrar em Configurações, **continua fora de escopo** por decisão consciente já tomada.

**Bug real do React 19 encontrado e corrigido durante o redesign:** um botão fora da tag `<form>`, associado via atributo HTML `form="..."`, não aciona corretamente uma Server Action no novo mecanismo de formulários do React 19 (cai num fallback que só lança erro). Corrigido em todos os modais usando `form.requestSubmit()` via `ref`, que é a alternativa que a própria mensagem de erro do React recomenda.

Testado localmente em cada módulo (criar, editar, excluir, buscar, ordenar, paginar, e as regras específicas de cada um) antes do commit; todos os `tsc`/`eslint`/`npm run build` limpos.

### Pós-Sprint 10 — Integração automática de índices com o Banco Central (item de Fase 2)
✅ Concluído. INCC, IPCA e IGP-M agora podem ser buscados automaticamente na API pública do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central, que republica as séries oficiais do IBGE/FGV — sem precisar de chave de API. Um cron semanal (`/api/cron/sync-index-values`, toda segunda 04:00 UTC) preenche os meses em aberto de todos os índices com fonte oficial de todas as organizações; também há um botão "Buscar do Banco Central" na tela de Índices para rodar sob demanda. Um lançamento manual nunca é sobrescrito por uma busca automática — o sync só preenche meses sem nenhum valor lançado, e cada valor mostra sua origem (Manual/Banco Central). Testado com dados reais da API (não mockado): valores de janeiro/2026 conferidos contra os números oficiais conhecidos, mês futuro tratado corretamente como "ainda não publicado", e sincronização de 24 meses confirmada como idempotente e sem sobrescrever lançamento manual.

### Pós-Sprint 10 — Refinamentos de Clientes e cadastro completo de SPE
✅ Concluído, conforme `docs/ESPEC_CADASTRO_CLIENTES.md` e `docs/ESPEC_CADASTRO_SPE.md`.

1. **Refinamentos de Clientes**: validação de CPF/CNPJ por dígito verificador com bloqueio de duplicidade (oferece "abrir cadastro existente"), e-mail/telefone obrigatórios só em criação/edição (nunca bloqueiam a exibição de registro legado incompleto), endereço estruturado com autocompletar via ViaCEP (fallback manual se o CEP não for encontrado), auditoria de criação/última alteração exibida na tela. Extraído `src/components/AddressFields.tsx` como componente de endereço reutilizável.
2. **Cadastro de SPE completo**, 7 abas:
   - **Dados** — mesmos padrões de validação/endereço/auditoria de Clientes, mais NIRE, natureza jurídica, CNAE, situação (Ativa/Em constituição/Encerrada).
   - **Sócios** — quadro societário com histórico (sócio que sai fica registrado com data de saída, não é apagado); alerta (nunca bloqueio) quando a soma dos sócios ativos difere de 100%, por ser um estado transitório legítimo durante alteração societária.
   - **Contas bancárias** — cadastro central em Configurações → Financeiro (evita duplicar conta quando SPEs compartilham banco); a aba da SPE só vincula/desvincula e marca uma como principal, com auditoria em cada vínculo.
   - **Investidores** — cadastro com modalidade estruturada (equity/mútuo/permuta física/permuta financeira/outro), pensado para a extensão futura de `docs/ESPEC_APORTES_INVESTIDORES.md` sem precisar remodelar a tabela.
   - **Documentação** — reaproveita a mesma infraestrutura de anexos (Supabase Storage) de Clientes/Contratos; `Document` ganhou `description` e `expiresAt` (opcionais, usados por certidões — sem alerta automático de vencimento ainda) e 7 categorias novas do domínio de SPE.
   - **Terrenos** — matrícula/cartório/endereço/área, dados de aquisição, e situação legal (patrimônio de afetação constituído + data de averbação + ônus/gravames) — ponto de conexão com a categoria de documento "Termo de afetação" e com o regime RET da aba Contábil.
   - **Contábil** — regime tributário (inclusive RET, com "optante desde" e CNPJ do evento 109), escrituração (contador, escritório, e as duas chaves do futuro De-Para contábil da Fase 2: código no sistema externo e código do plano de contas), obrigações (DIMOB, EFD-Contribuições).

**Bug real encontrado e corrigido durante os testes:** `AddressFields` usava ids DOM fixos (`zipCode`, `street`...); como a aba Dados da SPE mantém seu próprio `AddressFields` sempre montado, abrir o formulário de terreno (segundo `AddressFields` na mesma página) causava ids duplicados — o autocompletar de CEP do terreno escrevia nos campos escondidos da aba Dados em vez do próprio formulário. Corrigido com um `idPrefix` opcional no componente.

Todas as migrations foram aditivas (colunas nullable/com default seguro, tabelas novas) — nenhuma alterou ou removeu campo existente. Cada etapa foi testada com script de regressão direto contra as funções de servidor e depois end-to-end pela UI real antes do commit; regressão final confirmou que criar Empreendimento vinculado a SPE, e os fluxos de Vendas/Contratos/Carteira (que não leem campo nenhum da SPE além de nome/documento), continuam funcionando sem alteração.

### Pós-Sprint 10 — Fundações multi-tenant, etapa 2: auditoria de escopo por organização + helper central
✅ Concluído, conforme Pilar 1 (seções 1.2 e 1.3) de `docs/ESPEC_MULTITENANT_FUNDACOES.md`.

**Auditoria de escopo (1.2):** varredura completa do schema (todo model com dado de organização tem caminho até `organizationId`, direto ou via relação obrigatória — nenhum gap de schema encontrado) e de toda função de servidor em `src/server/*.ts` checando se cada query Prisma que toca entidade com escopo de organização filtra por ela. Encontradas e corrigidas **6 violações reais** (IDOR entre organizações — um usuário autenticado conseguiria editar/excluir registro de outra organização sabendo o id):

| Função | Vulnerabilidade | Correção |
|---|---|---|
| `spe-people.ts: updateSpePartner/deleteSpePartner` | `findFirst({where:{id, speId}})` sem checar a organização da SPE pai | Adicionado `spe: { organizationId }` ao `where` |
| `spe-people.ts: updateSpeInvestor/deleteSpeInvestor` | Mesmo padrão | Mesma correção |
| `spe-lands.ts: updateSpeLand/deleteSpeLand` | Mesmo padrão | Mesma correção |
| `proposals.ts: createProposal` | Unidade, tabela de vendas, cliente, corretor e imobiliária aceitos sem checar organização — proposta podia referenciar registro de outra organização | Adicionado filtro de organização (via `development.organizationId` ou `organizationId` direto) em cada lookup |
| `developments/[id]/sales-tables/[tableId]/page.tsx` | `listUnits(id)` usava o `id` (developmentId) da URL direto, sem checar contra `salesTable.developmentId` — usuário podia trocar o id na URL e ver/vincular unidade de outro empreendimento (potencialmente de outra organização) | Usa `salesTable.developmentId` (já validado por organização) em vez do param da URL; `notFound()` se não baterem |

Mais 6 funções de leitura (`listUnits`, `listSalesTables`, `listSpePartners`, `getActivePartnersParticipationTotal`, `listSpeInvestors`, `listSpeLands`, `listSpeBankAccounts`, `recalculateInstallment`) identificadas como **seguras hoje só porque todo chamador atual já pré-valida o id pai por organização antes de chamá-las** — não por garantia estrutural própria. As de SPE (`listSpePartners` etc.) já foram fechadas com o helper central, por serem baixo custo. As demais (`listUnits`, `listSalesTables`, `recalculateInstallment`) ficam registradas como candidatas a fechar quando o módulo for tocado de novo — consistente com a "migração gradual" que a especificação pede, não força-tarefa.

**Helper central de escopo (1.3):** `src/server/scope.ts` — funções puras que devolvem a cláusula `where` de organização certa pra cada padrão de relação (`orgScope`, `speOwnedScope`, `developmentOwnedScope`, `salesTableOwnedScope`, `bankAccountOwnedScope`, `buildingOwnedScope`, `portfolioOwnedScope`, `installmentOwnedScope`), sempre a partir de `AccessContext` (nunca de parâmetro do cliente). Aplicado em todas as correções acima; código novo deve importar daqui em vez de escrever a cláusula de organização à mão.

**Teste de fronteira (1.4, adiantado):** `tests/integration/org-scope.test.ts` — primeiro teste de integração permanente do repositório (`tests/` ainda não existia). Cria Org A e Org B de verdade, e confirma que a Org B recebe "não encontrado" (nunca revela existência) ao tentar editar/excluir sócio, investidor e terreno da Org A, e ao tentar criar proposta referenciando unidade/cliente da Org A. Exigiu duas peças de infraestrutura de teste novas: um stub do pacote `server-only` (que só funciona dentro do bundler do Next.js) via `resolve.alias` em `vitest.integration.config.ts`, e um `setupFiles` carregando `.env` via `dotenv/config` — nenhuma delas existia porque nenhum teste de integração tinha sido escrito ainda desde que a suíte permanente (Pilar 3, etapa 1) foi criada.

**Pendências desta etapa, registradas para as próximas:**
- O teste de fronteira completo (Pilar 1.4 pleno — todo módulo, não só os pontos corrigidos) e a suíte de regressão de fluxo completo (Pilar 3.2) são a etapa 3, ainda não feita.
- `npm run test:integration` não está no CI ainda (precisa de serviço Postgres no workflow) — rodar localmente por enquanto.
- RLS (Pilar 2) e o checklist "da TSH → da organização" (Pilar 4) seguem como itens futuros já registrados na especificação.

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

| Pendência | Onde impacta | Status |
|---|---|---|
| ~~Upload real de arquivo do contrato assinado~~ | Contratos | ✅ Resolvido pós-Sprint 10 — ver seção 1 |
| Minuta sem motor de template (dados corretos, mas sem geração de documento formatado) | Contratos | Fora de escopo por decisão consciente da TSH — mantido como está |
| ~~Ausência de worker assíncrono~~ para recálculo de carteira/inadimplência | Recálculo de parcelas vencidas | ✅ Resolvido pós-Sprint 10 (cron mensal via Vercel) — ver seção 1. A varredura sob demanda continua como rede de segurança complementar. Reservas expiradas continuam sendo tratadas sob demanda (não fazia parte do pedido da TSH neste round) |
| ~~Índices sem integração automática com fonte oficial (Banco Central/IBGE)~~ | Correção de carteira | ✅ Resolvido — ver seção 1 (Pós-Sprint 10 — Integração automática de índices). Cadastro manual continua disponível como alternativa/correção. |

---

## 4. Riscos identificados — pendentes de decisão da TSH (não há Sprint 11 planejada)

A Sprint 10 é a última do plano original. A regressão técnica (seção 1) não encontrou bugs novos, então os riscos abaixo não são mais "o que pode dar errado no código" — são decisões de negócio que só a TSH pode tomar antes de considerar a implantação encerrada.

| Item em aberto | Por quê importa | Próximo passo |
|---|---|---|
| ~~Sistema nunca foi testado com os dados reais dos empreendimentos-piloto~~ | TSH Laguna e Condomínio Lake House já estão cadastrados em produção (ver seção 1). | Resolvido — próximo teste real é o uso comercial de fato (primeira reserva/proposta/venda real). |
| ~~Pendências técnicas acumuladas (seção 3) ainda em aberto~~ | Upload real de contrato, worker assíncrono — resolvidos e testados pós-Sprint 10 (ver seção 1). Motor de template segue fora de escopo por decisão consciente. | Resolvido — nenhuma ação pendente aqui. |
| ~~`CRON_SECRET` ainda não cadastrado na Vercel~~ | Confirmado em produção em 2026-07-26 (ver seção 1) — chamada real ao endpoint com o segredo correto retornou 200. | Resolvido — nenhuma ação pendente aqui. |
| Ambiente de preview da Vercel aponta para o mesmo banco de produção | Sem banco de staging separado — qualquer deploy de preview (branch/PR) lê e escreve nos mesmos dados reais. | Aceitável enquanto for só a equipe interna testando; separar um projeto Supabase de staging se for abrir acesso a mais gente. |
| Usuários reais da TSH ainda não cadastrados (só o admin de teste) | Cada pessoa da equipe (financeiro, comercial, jurídico...) precisa do papel certo antes do uso real. | Levantar com a TSH quem vai usar o sistema e em qual papel, e convidar cada um pela tela de Configurações → Usuários. |
| ~~UX mínima (HTML simples, sem design system)~~ | Identidade visual da TSH aplicada e padrão de UI profissional (lista+filtro+modal) replicado em todos os módulos de cadastro (ver seção 1). | Resolvido para a estrutura geral. Ajustes finos de UX ficam para feedback específico durante o uso comercial real. |

---

## Como manter este documento

Ao final de cada sprint, o Claude Code deve:
1. Marcar a sprint como ✅ concluída na seção 1, com o fluxo real testado e um exemplo de valores conferidos.
2. Adicionar à seção 2 qualquer decisão que tenha se afastado do PRD/arquitetura, mesmo que pareça pequena.
3. Adicionar à seção 3 qualquer atalho, simplificação temporária ou funcionalidade adiada.
4. Preencher a seção 4 com riscos específicos da próxima sprint, antes de começar a implementá-la.

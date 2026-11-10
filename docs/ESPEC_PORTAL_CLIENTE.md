# Especificação — Portal do Cliente (Incorpora / TSH Incorporadora)

Área logada para o cliente final acompanhar a própria compra: posição financeira, documentos, evolução da obra, solicitações — reduzindo drasticamente as ligações/mensagens à equipe TSH (2ª via, "como está a obra", "quanto falta pagar" são as demandas nº 1 do pós-venda do setor).

Baseado em pesquisa dos portais de referência do mercado (padrão consolidado: extrato financeiro, 2ª via de boleto, acompanhamento de obra com fotos e %, documentos, chamados de assistência técnica, informe de IR, atualização cadastral).

**Estratégia de fases (importante):** o portal é dividido em duas ondas. A **Onda 1** (este documento, implementável já) usa só o que o sistema tem: extrato, documentos, obra, chamados, dados cadastrais. A **Onda 2** depende da integração bancária da Fase 2 do roadmap (2ª via de boleto/Pix automático) e da integração contábil (informe de IR) — a estrutura nasce pronta pra elas, mas elas não bloqueiam o lançamento.

Reaproveita: extrato do cliente (Fase B — mesma fonte de dados), medição de evolução de obra (Fase C), aba Acessos e Contatos do cadastro de cliente (já implementada na estrutura), motor de templates (Fase A), infraestrutura de anexos.

---

## PARTE 1 — Acesso e Segurança

### 1.1 Modelo de acesso

- **Convite pela incorporadora:** na aba Acessos do cadastro de cliente (estrutura já existente), a equipe habilita o acesso → o sistema envia convite por e-mail (contato da aba Contatos) com link de definição de senha
- Login: e-mail + senha; recuperação de senha self-service; papel `Cliente` (já existe na lista de papéis do sistema)
- Um cliente pode ter **múltiplos e-mails com acesso** (aba Contatos — ex.: casal comprador), cada um com login próprio, todos vendo os mesmos contratos
- A aba Acessos controla **o que** o cliente vê (checkboxes por área: Financeiro / Documentos / Obra / Chamados) — permite, por exemplo, dar acesso à obra mas não ao financeiro para um contato secundário

### 1.2 Isolamento de dados — regra crítica de segurança

- O cliente enxerga **exclusivamente**: seus contratos, suas unidades, seus documentos, os dados públicos do empreendimento onde comprou. Nada de outros clientes, nada de dados internos (custos, comissões, carteira geral, inadimplência de terceiros)
- Toda query do portal filtrada por `cliente autenticado` no **servidor** (nunca só no front) — testar explicitamente tentativa de acesso a contrato de outro cliente (deve retornar não-encontrado, não "sem permissão" — não confirmar existência)
- Auditoria de acessos: log de login e de ações do cliente (visualizou extrato, baixou documento, abriu chamado)
- Rate limiting no login; sessão com expiração; LGPD: o portal exibe só dados do próprio titular

### 1.3 Interface

- Mesma aplicação (rota `/portal`), layout próprio simplificado — identidade TSH aplicada, linguagem de cliente final (não jargão interno: "Minhas parcelas", não "Carteira de recebíveis")
- Responsivo mobile-first: a maioria dos acessos de cliente é pelo celular
- Cliente com mais de uma unidade/contrato: seletor no topo

---

## PARTE 2 — Módulos do Portal (Onda 1)

### 2.1 Início

- Resumo: unidade(s) compradas, próximo vencimento (valor + data), % da obra (última medição), avisos/comunicados ativos
- Comunicados: a equipe TSH publica avisos por empreendimento (texto + anexo opcional) — ex.: "vistoria agendada", "assembleia" — visíveis no portal do cliente daquele empreendimento

### 2.2 Financeiro ("Minhas parcelas")

- **Extrato completo** — mesma fonte da Fase B, visão de cliente: parcelas pagas (com data e valor), em aberto (com valor corrigido atual), vencidas destacadas
- Detalhe da parcela: composição resumida (valor original + correção + encargos se vencida) — transparência que reduz questionamento
- **Simulação de antecipação/quitação** (motor já existente) — cliente vê o valor de quitar hoje, sem precisar ligar
- Download do extrato em PDF (modelo da Fase B)
- **Onda 2 (estrutura pronta, funcionalidade futura):** botão "2ª via de boleto"/"Pagar com Pix" — aparece quando a integração bancária da Fase 2 estiver ativa; até lá, instrução de pagamento configurável por empreendimento (texto: como pagar, dados da conta)

### 2.3 Meu contrato e documentos

- Contrato assinado (PDF do Storage), aditivos, termo de renegociação se houver
- Documentos do empreendimento marcados como "visíveis ao cliente" (flag no anexo — memorial descritivo, manual do proprietário, convenção de condomínio, plantas da unidade)
- Dados da compra: unidade, vagas vinculadas, valores contratados

### 2.4 Minha obra

- Evolução física: % geral e por fase (medições da Fase C), com histórico
- Fotos da obra: galeria por medição/período (anexos das medições marcados como públicos)
- Marcos: previsão de Habite-se e entrega (com a tolerância contratual exibida corretamente — evita criar expectativa errada)

### 2.5 Solicitações (chamados)

- Cliente abre chamado: categoria (Dúvida financeira / Documentos / Assistência técnica / Atualização cadastral / Outros), descrição, anexos (fotos — essencial pra assistência técnica pós-entrega)
- Acompanhamento: status (Aberto → Em atendimento → Resolvido → Fechado), histórico de mensagens (thread cliente ↔ equipe)
- **Lado da equipe TSH:** fila de chamados no sistema interno (lista padrão de UI: filtros por empreendimento, categoria, status, responsável), atribuição de responsável, resposta com anexo, SLA simples (dias em aberto destacados)
- Chamados de assistência técnica pós-entrega: vinculados à unidade — histórico permanente da unidade (importante para garantias)

### 2.6 Meus dados

- Cliente visualiza os dados cadastrais e **solicita** alteração (não edita direto — a solicitação vira chamado de "Atualização cadastral" que a equipe valida e aplica; mantém a validação/auditoria do cadastro interno)

---

## PARTE 3 — Onda 2 (dependências externas — estrutura preparada, não implementar agora)

| Funcionalidade | Depende de |
|---|---|
| 2ª via de boleto / pagamento Pix no portal | Integração bancária (Fase 2 do roadmap) |
| Notificações automáticas (parcela a vencer, boleto disponível, atualização de obra) | Integração de comunicação e-mail/WhatsApp (Fase 2) — a régua da Fase B alimenta |
| Informe de rendimentos / demonstrativo de IR anual | Dados contábeis (integração contábil da Fase 2) — demonstrativo de valores pagos no ano já é possível na Onda 1 via extrato |
| App mobile (loja) | Avaliar depois — o portal responsivo cobre a necessidade inicial |

---

## Sequência sugerida de implementação

| Etapa | Conteúdo | Observação |
|---|---|---|
| 1 | Autenticação do cliente + convite + isolamento de dados | Testes de segurança explícitos (acesso cruzado entre clientes) ANTES de qualquer tela |
| 2 | Início + Financeiro (extrato, simulação de quitação, PDF) | Depende do extrato da Fase B |
| 3 | Contrato e documentos (com flag "visível ao cliente" nos anexos) | |
| 4 | Minha obra | Depende das medições da Fase C |
| 5 | Chamados (portal + fila interna da equipe) | Módulo com mais lógica própria |
| 6 | Comunicados + Meus dados (solicitação de alteração) | |
| 7 | Regressão de segurança completa + teste com cliente real convidado | Antes de liberar para clientes de verdade |

**Dependências:** Fases B (extrato) e C (medições de obra) devem estar implementadas antes das etapas 2 e 4 — por isso o portal fica naturalmente após elas na fila. A etapa 1 e 5 podem ser adiantadas se necessário.

## Posição na fila geral

SPE → Aportes 1-2 → Comercial + permuta visual → Fase A → Fase B + Aportes 3-7 → Permuta financeira → Fase C → **Portal do Cliente** → (Fase 2 do roadmap: integração bancária ativa a Onda 2 do portal)

## Parâmetros configuráveis

- Áreas visíveis por acesso de cliente (aba Acessos)
- Instrução de pagamento por empreendimento (texto, até a integração bancária)
- Flag "visível ao cliente" em anexos (documento a documento)
- Categorias de chamado e responsáveis padrão por categoria/empreendimento
- Comunicados por empreendimento

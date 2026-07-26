# Briefing — Profissionalização da UI do Incorpora

Baseado em exemplos reais do sistema Obra Prima (ERP de referência), levantados com o usuário. Objetivo: elevar o padrão de interface do sistema, hoje muito simples (lista e formulário sempre expostos juntos, sem filtro, sem paginação), para um padrão de sistema de gestão profissional.

---

## 1. Separar "visualizar/pesquisar" de "cadastrar"

**Problema atual:** em quase todas as telas (Clientes, Contas a pagar, etc.), a lista de registros e o formulário completo de cadastro aparecem juntos, sempre visíveis, um embaixo do outro.

**Padrão a adotar:** a tela por padrão mostra só a lista (com busca/filtro). O formulário de cadastro só aparece quando o usuário clica em "Novo", e abre **em um modal**, não em uma página separada nem inline na mesma tela.

Aplica-se a todos os módulos com listagem: Clientes, Imobiliárias/Corretores, Fornecedores/Centros de custo, Contas a pagar, SPEs, Empreendimentos, Usuários, Vendas.

---

## 2. Padrão de listagem

Cada tela de listagem deve ter:

- **Busca/filtro** acima da tabela (pode ser um painel lateral recolhível, como no Obra Prima, ou uma barra de filtros no topo — decisão de design, mas precisa existir)
- **Colunas ordenáveis** (clicar no cabeçalho ordena pela coluna)
- **Paginação**, com contagem total de registros e navegação entre páginas
- **Ações por linha** (editar/excluir com ícones, sem precisar abrir o registro pra isso)
- **Toolbar de ações da lista**: "Novo" (abre o modal de cadastro), e como itens desejáveis (não bloqueantes pra V1 do redesign): "Exportar" e "Importar"
- Linhas com leve alternância de cor para facilitar leitura em tabelas longas

**Fora do escopo inicial** (avançado, só se sobrar tempo): agrupar por arrastar cabeçalho de coluna, alternância "Grade"/lista.

---

## 3. Padrão de cadastro (modal)

- Cadastro abre em **modal sobre a lista** (fundo escurecido), não em página nova
- **Abas dentro do modal** quando o cadastro tiver muitas informações relacionadas mas distintas — ex.: Cliente → Dados / Contatos / Atendimento / Anexos / Acessos. Contas a pagar → Dados / Itens / Pagamento / Faturamento / Anexos
- Dentro de cada aba, **campos agrupados por seção com sub-título** (ex.: "Contato", "Endereço"), em vez de todos os campos soltos em sequência
- Campos obrigatórios marcados com `*`
- Selects que referenciam outro cadastro (ex.: Fornecedor, Centro de custo) podem ter um **botão "+" ao lado** para criar o item relacionado sem sair do formulário atual
- Rodapé do modal fixo, com botão "Salvar" sempre visível independente da aba ativa

**Aba "Acessos" para Clientes:** já prever essa aba na estrutura do cadastro de cliente (mesmo que a lógica de permissão ainda não faça nada), pensando no Portal do Cliente futuro (Fase 2). Assim, quando o Portal for implementado, a interface já existe — só a lógica por trás precisa ser ligada.

**Aba "Contatos" para Clientes:** permitir múltiplos contatos (e-mails/telefones) por cliente, não só um campo único — pensando em quem vai receber documentos financeiros/acessar portal.

---

## 4. Área de Configurações centralizada

Criar uma área de **Configurações**, separada do menu operacional do dia a dia, organizando por módulo (ex.: Empresa, Clientes, Financeiro, Acesso ao sistema).

Mover pra dentro dessa área itens que hoje estão soltos no menu principal misturados com telas operacionais: **Usuários**, **Índices**, **Fornecedores/Centros de custo** (o cadastro em si, não o uso do dia a dia).

**Usar essa área também para o "motor de template de minuta"** que ficou pendente da Fase 2 — modelos de documento (contrato, cessão de direitos, distrato) devem ser configuráveis aqui, não soltos em outro lugar.

---

## 5. Escopo e forma de execução

Essa mudança toca a maioria das telas do sistema — não é uma sprint pequena. Recomendo:

1. **Provar o padrão em um módulo só primeiro** (sugestão: Clientes, por ser o exemplo mais completo levantado) — lista com filtro/paginação/ordenação + modal de cadastro com abas. Mostrar antes de replicar.
2. Depois de aprovado, **replicar o mesmo padrão nos demais módulos de listagem**, um de cada vez ou em lote pequeno, sempre com checagem visual antes de seguir pro próximo — mesmo processo usado na aplicação da comunicação visual.
3. **Área de Configurações** como etapa separada, depois que os módulos individuais já estiverem no novo padrão.
4. Rodar a mesma bateria de regressão usada no V1 (fluxo comercial completo, carteira, financeiro) depois da mudança estrutural, já que ela toca como os dados são exibidos e cadastrados em várias telas ao mesmo tempo — o risco aqui não é lógica de negócio, é regressão de UI (campo que sumiu, formulário que não salva mais).

---

## Referência visual anexada

Prints do sistema Obra Prima (obraprimaweb.com.br) fornecidos como referência de padrão, não para copiar a marca/estilo — a identidade visual da TSH já aplicada permanece.

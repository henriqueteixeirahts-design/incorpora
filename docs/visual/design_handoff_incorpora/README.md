# Handoff: INCORPORA — sistema de gestão de vendas de unidades

## Visão geral
INCORPORA é o sistema interno da TSH Incorporadora para controle de vendas de unidades de
empreendimentos, carteira de recebíveis, comissões e financeiro. Este pacote contém a
especificação visual da direção aprovada e o código dos componentes-chave, para que a
interface existente (hoje sem tratamento de design) seja reimplementada com identidade TSH
e um sistema consistente.

Direção aprovada nas rodadas de design:
- **1a Institucional** — sidebar azul TSH sobre canvas bege, cartões com faixa de cor no topo,
  dourado reservado a valor financeiro.
- **3b Submenu no menu** — as subpáginas de cada item abrem dentro da própria barra lateral,
  empurrando os demais itens. Fechado por padrão; abre no item da página atual. Substitui a
  fileira de links no topo do conteúdo (que quebrava em duas linhas e não indicava hierarquia).

Escopo: **apenas desktop**, tema **claro**, densidade **equilibrada**.
Perfis de uso: diretoria/sócios, gerente comercial, corretor, financeiro, administrativo.

## Sobre os arquivos deste pacote
Os arquivos HTML aqui são **referências de design**, não código de produção para copiar
integralmente. Eles mostram a aparência e o comportamento pretendidos.

A tarefa é **recriar estes designs no ambiente do codebase de destino** (React, Vue, Blade,
Rails, o que já existir), usando os padrões e bibliotecas já estabelecidos lá. Se ainda não
houver um ambiente definido, escolha o mais adequado ao projeto e implemente ali.

Duas exceções, feitas para serem consumidas diretamente:
- `tokens.css` / `tokens.json` — podem entrar no projeto como estão (ou ser convertidos para
  o formato de tokens da stack: tema do Tailwind, SCSS, tokens do MUI, etc.).
- `icons.svg` — sprite pronto para uso.

`components.css` é código real e funcional, mas escrito em CSS puro e classes `.inc-*`
deliberadamente neutras: use-o como fonte dos valores exatos ao construir os componentes na
biblioteca do projeto.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, alturas de controle e estados
são finais. Reproduza com precisão. Todos os valores estão em `tokens.css`/`tokens.json` e
visíveis em `especificacao.html`.

Ressalva: **os dados são fictícios**, exceto nomes que vêm dos prints do sistema atual
(TSH Laguna, Condomínio Lake House, SPE TSH Parque Amazônia LTDA, SPE Lake House LTDA,
os nomes de menu e as 11 subpáginas do empreendimento). Não trate números como reais.

## Arquivos
| Arquivo | O que é |
|---|---|
| `especificacao.html` | Referência viva: paleta, tipografia, escalas, ícones e todos os componentes renderizados, com snippets. **Comece por aqui.** |
| `tokens.css` | Custom properties CSS. Fonte da verdade dos valores. |
| `tokens.json` | Os mesmos tokens em JSON, com metadados de papel tipográfico. |
| `components.css` | CSS dos componentes (`.inc-*`), documentado. |
| `icons.svg` | Sprite com 25 ícones de sistema + logotipo TSH. |
| `referencia/INCORPORA.dc.html` | Protótipo completo das telas desenhadas (abre no navegador). |
| `referencia/brand/` | Assinaturas TSH em SVG (positiva, branca, preta). |

Nota sobre o protótipo: `referencia/INCORPORA.dc.html` usa estilos inline e um runtime de
protótipo (`support.js`) — é material de leitura visual. Os valores canônicos estão nos
tokens, não nele.

## Marca
Paleta e tipografia vêm do **Brandbook TSH 2.0**: Azul `#445C6C`, Marrom `#4F3F42`,
Dourado `#B19B72`, Bege `#FFF2E0`, Azul Claro `#8ABDDD`, tipografia **Inter**.
Nenhuma cor nova foi criada: os tons de apoio (superfícies, bordas, texto) são derivados por
dessaturação desses cinco valores. Se o codebase já tiver um tema TSH, use-o como base e
importe apenas o que faltar.

O logotipo está em `referencia/brand/` e como `#tsh-logo` no sprite. Não recolorir,
não distorcer, não aplicar sombra.

## Telas desenhadas
Todas as telas foram desenhadas em 1440×1080. Largura mínima suportada: 1280px.

### 1. Dashboard (administrador da plataforma)
KPIs no topo (VGV vendido, a receber, estoque, inadimplência), espelho de vendas resumido,
fluxo de caixa projetado, últimas vendas.
Layout: sidebar 262px + conteúdo. Grid de 4 KPIs (gap 16px), depois grid 1,35fr / 1fr.

### 2. Espelho de vendas (a tela central do sistema)
Torres lado a lado; cada unidade é uma célula colorida pelo status, com número e metragem.
Painel direito de 336px com a unidade selecionada: dados, cliente, corretor/comissão e plano
de recebíveis. Legenda com contagem por status e VSO.
Grid: `1fr 336px`, gap 18px. Dentro do cartão de torres, `1fr 1fr` com gap 26px.
Célula: 46px de altura, gap 5px, raio 2px, coluna de andar 30px à esquerda.
Para torres altas (24 pavimentos, caso da TSH Laguna) reduza a célula para 26px e omita a
metragem.

### 3. Ficha do empreendimento
Cabeçalho com foto/perspectiva (placeholder 200×132), SPE, chips de situação e 4 métricas.
Abas dos módulos. Tabela de tipologias com barra de estoque, curva de vendas, cronograma de
obra por fase e bloco de permutantes.

### 4. Lista de empreendimentos
Com poucos registros, cartão em vez de tabela: cada empreendimento é um portal, com atalhos
para as subpáginas. Toggle Cartões/Tabela para quando a lista crescer.
**Correção necessária no sistema atual:** no print, a coluna "Cidade" mostra a SPE e a coluna
"SPE" mostra a contagem de unidades. Os rótulos corretos são Nome, Tipo, SPE, Cidade, Unidades.

### 5. Lista com filtros + estado vazio (Vendas)
Cinco filtros pouco usados recolhidos num botão "Filtros". Cabeçalho da tabela permanece
visível no vazio. O vazio explica de onde vem o registro e oferece o caminho real
(ação primária + "Abrir espelho de vendas") com três números de contexto.
Este padrão serve também a Clientes, Permutantes, Contas a pagar, Recebíveis avulsos,
Comissões e Corretores — todos vazios hoje.

### 6. Inadimplência
Sete faixas de aging como cartões-filtro (Todos, A vencer 30d, 1–15d, 16–30d, 31–60d,
61–90d, +90d); a faixa ativa inverte para azul cheio. Grid `1,5fr / 1fr`: parcelas em atraso
à esquerda, régua de cobrança à direita com etapa atual e próxima ação sugerida por cliente.

### 7. Fluxo de caixa
Tabela de 9 colunas com **cabeçalho em dois níveis**: grupo (Recebimentos, Pagamentos, Saldo
do mês, Saldo acumulado) e, abaixo, Previsto/Realizado. Resolve as dez colunas do sistema
atual sem quebrar texto em duas linhas. Realizado em `#3c5a6b`; "—" quando não houve
lançamento efetivo. Segmentado Mensal/Semanal/Diária.

### 8. Configurações
Hub em duas colunas. Cada item ganha uma linha de descrição do que faz. Grupos verbatim do
sistema: Financeiro, Documentos, Acesso ao sistema, Sistema.

## Componentes
Especificação completa e renderizada em `especificacao.html`; valores em `components.css`.

- **Botões** — primário (azul), dourado (segunda criação), secundário (borda), quiet, danger,
  ícone. Alturas 30/34/38px. Uma única primária por tela.
- **Campos** — input, select (com chevron em background-image), date, busca com ícone,
  estado inválido e texto de ajuda. Rótulo acima, 12px/600.
- **Segmentado** e **filtro-chip contável** (aba de status).
- **Chips de estado** (contrato, proposta, reserva, permuta, atraso) e **pills** com marcador.
- **Select de status na tabela**, herdando a cor do status.
- **Cartão**, **KPI com faixa de cor no topo**, **faixa única de KPIs**, **cartão-faixa de aging**.
- **Tabela** padrão e com cabeçalho em dois níveis; rodapé com paginação.
- **Espelho de vendas** (grid de unidades + legenda + painel de detalhe).
- **Estado vazio** e variante "convite" tracejada.
- **Modal** 520/760px com scrim, cabeçalho de contexto e rodapé com regra + ações.
- **Navegação** com submenu, badge de pendência e bloco de usuário.
- **Barra superior** com breadcrumb; **cabeçalho de página** com eyebrow + h1 + ações.

## Interações e comportamento
- **Submenu**: clique no item do menu alterna a abertura; chevron gira 90° em 180ms
  `cubic-bezier(.2,.6,.2,1)`. Fechado por padrão ao entrar no sistema; ao abrir uma página,
  o submenu do item correspondente vem aberto. Só um item aberto por vez.
- **Hover**: linha de tabela → `#fdfbf7`; item de menu → `rgba(255,242,224,.12)`;
  botão secundário → `#f6f2ea`; célula de unidade → `filter: brightness(1.06)`.
- **Foco**: anel `0 0 0 3px rgba(138,189,221,.5)` em todo controle; sobre fundo azul,
  `rgba(255,242,224,.35)`.
- **Seleção de unidade**: anel duplo (azul + branco) e abertura do painel de detalhe.
- **Faixa de aging**: clique filtra a tabela; a faixa ativa inverte para azul cheio
  (`aria-pressed="true"`).
- **Transições**: 120ms para cor de fundo, 180ms para transformações. Sem animação de entrada
  de página, sem skeleton animado — a interface é de trabalho, não de vitrine.
- **Carregando**: manter cabeçalho e cartões; preencher células com barra cinza
  `#ece6da` estática.
- **Erro de campo**: borda `#9c5f4e` + texto de ajuda em vermelho abaixo. Erro de página:
  usar o bloco de estado vazio com o texto do erro e ação de tentar novamente.
- **Sem responsividade mobile.** Abaixo de 1280px, rolagem horizontal em tabelas largas
  (Fluxo de caixa, Vendas); a sidebar não colapsa.

## Estado necessário (por tela)
- Global: usuário e perfil, SPE/empreendimento selecionado no seletor, contadores de pendência
  (inadimplência, propostas em análise) para os badges do menu.
- Navegação: `openMenuKey` (string | null), `currentRoute`.
- Listas: `filtros` (objeto por tela), `ordenacao {campo, direcao}`, `pagina`, `busca`,
  `carregando`, `total`.
- Espelho: `torres[]` com `pavimentos[]` e `unidades[]` (número, tipologia, área, status,
  vínculos), `unidadeSelecionada`.
- Inadimplência: `faixaSelecionada`, `parcelas[]`, `clientesEmAtraso[]` com etapa da régua.
- Fluxo: `granularidade` (mensal|semanal|diária), `escopo` (SPE|consolidado), `periodo`.
- Modal: `modalAberto`, dados do registro em edição, validação por campo.

Os status de unidade e de contrato devem vir do backend como enum; o mapeamento
enum → cor/rótulo está em `tokens.json` (`color.unitStatus`, `color.contractStatus`).

## Design tokens
Todos em `tokens.css` (custom properties) e `tokens.json`. Resumo:

**Marca** — azul `#445c6c` · azul claro `#8abddd` · marrom `#4f3f42` · dourado `#b19b72` ·
bege `#fff2e0`
**Superfícies** — canvas `#fbf8f2` · surface `#ffffff` · subtle `#faf8f4` ·
alt `#fdfcfa` · hover `#fdfbf7` · foto `#f2ece1`
**Bordas** — cartão `#e6dfd3` · controle `#ded7cb` · divisória `#eee7db` · linha `#f3ede2` ·
leve `#f0ece4` · tracejada `#d8d0c2`
**Texto** — `#3d3a34` · corpo `#4a453d` · secundário `#6b655c` · muted `#7a7367` ·
soft `#8a8378` · placeholder `#a8a094` · sobre azul `#fff2e0`
**Navegação** — bg `#445c6c` · painel `#3a4e5c` · item `#d9e6ef` · subitem `#c9dae5` ·
ativo bg `#fff2e0` / texto `#445c6c` · hover `rgba(255,242,224,.12)` ·
subativo `rgba(255,242,224,.18)` · divisória `rgba(255,242,224,.16)` ·
trilho `rgba(138,189,221,.45)`
**Semântica** — sucesso `#5d8a52` (texto `#4a6a45`, bg `#eef4ea`, borda `#cfdcc6`) ·
aviso `#b19b72` (texto `#8a7340`, bg `#f7f0e2`, borda `#e6d8b8`) ·
perigo `#9c5f4e` (bg `#f7ecea`) · info texto `#3c5a6b` (bg `#eaf1f6`, borda `#c9dae5`) ·
neutro texto `#6b5457` (bg `#f2ecec`, borda `#d9cbcb`)
**Status de unidade** — disponível `#8abddd`/`#2f4250` · reservado `#b19b72`/`#2f2a25` ·
vendido `#445c6c`/`#fff2e0` · permuta `#4f3f42`/`#fff2e0` · bloqueado `#d8d2c6`/`#6b655c`

**Tipografia** — Inter, pesos 400/500/600, sem itálico.
Escala: 10,5 · 11 · 11,5 · 12 · 12,5 · **13** · 13,5 · 14 · 15 · 16 · 19 · 20 · 25 · 29 · 30 · 32px.
Papéis: título de página 30/600/-0,02em/azul · eyebrow 11,5/600/0,16em/uppercase/`#7a7367` ·
título de cartão 15/600/azul · métrica 25/600/-0,02em · cabeçalho de tabela
10,5/600/0,1em/uppercase/`#7a7367` · célula 13/400 · célula-chave 13,5/600/azul ·
corpo 13,5/400/1,55 · item de menu 13,5/400 (ativo 500) · ajuda 12/400/`#7a7367`.
Números tabulares (`font-variant-numeric: tabular-nums`) em toda coluna numérica.

**Espaçamento** — base 2px: 2 4 6 8 10 12 14 16 18 20 22 26 28 30 32 40.
Gutter de página 30px · padding de cartão 20px · gap entre cartões 18px · gap de KPI 16px.

**Raio** — 0 (tabelas e cartões) · 2px (célula, chip) · 3px (botão, input, item de menu) ·
pill · 50% (avatar).

**Elevação** — a interface é plana; hierarquia por borda e superfície.
Sombra só em camadas flutuantes: popover `0 10px 24px -8px rgba(68,92,108,.28)` ·
modal `0 24px 60px -20px rgba(68,92,108,.35)` · scrim `rgba(47,42,37,.45)`.

**Alturas** — controle 30/34/38px · barra superior 58px · linha de tabela 46px (uma
informação) ou 52px (duas) · célula de unidade 46px · sidebar 262px · painel secundário 248px.

**Movimento** — `cubic-bezier(.2,.6,.2,1)`; 120ms cor, 180ms transformação, 260ms painel.

## Ícones e assets
- 25 ícones de sistema desenhados para este projeto: grade 24px, traço 1,5px, junções
  arredondadas, sem preenchimento, herdando `currentColor`. A geometria deriva do símbolo TSH
  (retângulos e diagonais a 45°). Tamanhos de uso: 13px inline · 15px em botão · 17px no menu ·
  22px em título de seção · 30px em estado vazio. Entregues em `icons.svg`.
- Logotipo TSH: `referencia/brand/` (SVG) e `#tsh-logo` no sprite.
- **Não há imagens.** Onde a interface pede foto ou perspectiva do empreendimento existe um
  placeholder (`.inc-photo`) — a TSH precisa fornecer as imagens reais.
- Fonte Inter via Google Fonts; se o projeto já a servir localmente, use a versão local.

## Regras que mantêm o sistema coerente
1. Uma ação primária azul por tela. O dourado é a segunda ação de criação.
2. No máximo duas cores de fundo por tela, além do canvas.
3. Cor nunca é o único portador de significado: o chip de status sempre traz o texto.
4. Rótulos ≤12px nunca abaixo de `#7a7367` (piso de contraste 3:1 sobre `#faf8f4`).
5. Filtro por status é aba contável, não select.
6. Layout em flex/grid com `gap` — nunca margens soltas entre irmãos.
7. Sem sombra em cartão. Sem raio acima de 3px fora de pills.
8. Cabeçalho de tabela permanece visível no estado vazio.
9. Verde e vermelho são reservados a significado (contrato, atraso), nunca decorativos.

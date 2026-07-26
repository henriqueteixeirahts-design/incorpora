# Especificação — Cadastro de SPE (Incorpora / TSH Incorporadora)

Baseado em pesquisa dos principais ERPs de incorporação do mercado brasileiro (Sienge, ERP UAU/Globaltec, Mega/Senior — líderes do segmento, usados por mais de 45 das 100 maiores construtoras do país) e na legislação aplicável (Lei 4.591/64 — incorporação e patrimônio de afetação; Lei 10.931/04 — RET).

Aplicar também ao cadastro de SPE todos os padrões já definidos para o cadastro de Clientes: validação de CNPJ com dígito verificador, contatos obrigatórios, endereço completo com autocompletar por CEP (ViaCEP), auditoria de criação/última alteração, modal com abas, campos agrupados por seção.

---

## Aba 1 — Dados

Identificação e informações gerais da SPE.

**Seção: Identificação**
| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Razão social | texto | ✅ | |
| Nome fantasia | texto | — | |
| CNPJ | texto com máscara | ✅ | Validar dígito verificador; impedir duplicidade no sistema |
| NIRE | texto | — | Nº de registro na Junta Comercial (ex.: JUCEG) |
| Data de constituição | data | — | |
| Natureza jurídica | select | — | Ex.: 206-2 Sociedade Empresária Limitada |
| CNAE principal | texto/select | — | Ex.: 41.10-7-00 Incorporação de empreendimentos imobiliários |
| Situação | select | ✅ | Ativa / Em constituição / Encerrada |

**Seção: Endereço** (padrão ViaCEP)
CEP (autocompleta) → Logradouro, Bairro, Cidade, UF preenchidos automaticamente + Número e Complemento manuais.

**Seção: Contato**
E-mail (✅ obrigatório), Telefone (✅ obrigatório), site (opcional).

**Rodapé informativo:** "Cadastrado por X em [data] · Última alteração por Y em [data]" (auditoria).

---

## Aba 2 — Sócios

Quadro societário da SPE. Tabela com múltiplas linhas; cada sócio:

| Campo | Tipo | Obrigatório |
|---|---|---|
| Tipo | PF / PJ | ✅ |
| Nome / Razão social | texto | ✅ |
| CPF / CNPJ | validado | ✅ |
| Percentual de participação (%) | número | ✅ |
| Papel | select: Sócio administrador / Sócio quotista / Outro | — |
| Data de entrada | data | — |
| Data de saída | data | — (permite histórico societário) |

**Regra de validação:** somatório dos percentuais de sócios ativos deve fechar em 100% — alertar (não bloquear) se diferente, pois durante alterações societárias pode haver estado transitório.

**Observação de mercado:** nos ERPs de referência, o quadro societário alimenta a consolidação de balanços entre empresas do grupo e a distribuição de resultados. Não precisa dessa lógica agora — mas o dado precisa existir estruturado (não texto livre) para permitir isso depois.

---

## Aba 3 — Contas bancárias

**Modelo: vinculação, não cadastro local.** As contas bancárias são cadastradas em um **registro central** (Configurações → Financeiro → Contas bancárias) e aqui apenas **vinculadas** à SPE. Evita duplicação quando SPEs compartilham banco e prepara a conciliação bancária da Fase 2.

Cadastro central de conta bancária (criar como parte desta tarefa se ainda não existir):
| Campo | Obrigatório |
|---|---|
| Banco (código + nome — lista FEBRABAN) | ✅ |
| Agência (com dígito) | ✅ |
| Conta (com dígito) | ✅ |
| Tipo (Corrente / Poupança / Pagamento) | ✅ |
| Chave Pix (opcional, tipo + valor) | — |
| Apelido/descrição | — |
| Situação (Ativa / Encerrada) | ✅ |

Na aba da SPE: tabela de contas vinculadas + botão "Vincular conta" (select das contas centrais) + marcar uma como **conta principal** da SPE.

**Nota legal relevante:** quando a SPE tem patrimônio de afetação, a lei exige *conta bancária específica* para movimentação dos recursos do patrimônio afetado — por isso o vínculo conta↔SPE precisa ser explícito e auditável, não um campo de texto.

---

## Aba 4 — Investidores

Investidores da SPE (diferentes de sócios — podem ser mutuantes, permutantes ou aportadores sem participação societária formal).

| Campo | Tipo | Obrigatório |
|---|---|---|
| Tipo | PF / PJ | ✅ |
| Nome / Razão social | texto | ✅ |
| CPF / CNPJ | validado | ✅ |
| E-mail | texto | ✅ |
| Telefone | texto | ✅ |
| Modalidade | select: Equity (participação) / Mútuo / Permuta física / Permuta financeira / Outro | ✅ |
| Capital aportado (R$) | número | — |
| Percentual de participação no resultado (%) | número | — |
| Data do aporte | data | — |
| Observações | texto | — |

**Conexão com a Fase 2:** esta aba é a estrutura de dados do futuro módulo de participação de investidores (distribuição de resultados, extrato por investidor, painel do investidor). A lógica de cálculo/distribuição NÃO entra agora — apenas o cadastro estruturado.

---

## Aba 5 — Documentação

Anexos de documentos da SPE, reaproveitando a infraestrutura de anexos já construída (Supabase Storage, mesma usada em Clientes e Contratos).

Cada anexo com **categoria** (select) para organização:
- Contrato social / alterações contratuais
- Cartão CNPJ
- Certidões (negativas fiscais, FGTS, trabalhista)
- Procurações
- Termo de afetação / averbação na matrícula
- Termo de opção pelo RET (protocolo Receita Federal)
- Alvarás e licenças
- Outros

Campos por anexo: categoria, descrição, data de validade (opcional — útil pra certidões; permite futuramente alertar vencimento), arquivo.

**Observação de mercado:** controle de validade de certidões é funcionalidade comum nos ERPs de referência (certidões vencidas travam repasses bancários em financiamentos). Só o campo agora; alerta automático pode vir depois.

---

## Aba 6 — Terrenos

Terreno(s) vinculados à SPE. Tabela com múltiplos terrenos; cada um:

**Seção: Identificação do imóvel**
| Campo | Obrigatório |
|---|---|
| Matrícula nº | ✅ |
| Cartório de registro (nome/comarca) | ✅ |
| Endereço completo (padrão CEP/ViaCEP) | ✅ |
| Área total (m²) | ✅ |
| Inscrição municipal / IPTU | — |

**Seção: Aquisição**
| Campo | Obrigatório |
|---|---|
| Forma de aquisição | select: Compra / Permuta física / Permuta financeira / Integralização / Outro | — |
| Vendedor/permutante anterior | texto | — |
| Valor de aquisição (R$) | — |
| Data de aquisição | — |

**Seção: Situação legal**
| Campo | Obrigatório |
|---|---|
| Patrimônio de afetação constituído? | sim/não | — |
| Data da averbação da afetação | data (se sim) | — |
| Ônus/gravames (hipoteca, alienação fiduciária) | texto | — |

**Observação de mercado:** o patrimônio de afetação por terreno é o que habilita o RET (aba Contábil) — os dois campos conversam. Nos ERPs de referência esse vínculo é explícito.

---

## Aba 7 — Contábil

Dados para a futura integração contábil (Fase 2). Estrutura agora, integração depois.

**Seção: Regime tributário**
| Campo | Tipo | Observação |
|---|---|---|
| Regime | select: Lucro Real / Lucro Presumido / Simples Nacional / **RET (Regime Especial de Tributação)** | RET é o regime típico de SPE de incorporação com patrimônio de afetação — alíquota unificada de 4% sobre receitas (1% para faixas do MCMV), recolhida em DARF único cobrindo IRPJ, CSLL, PIS e COFINS |
| Optante pelo RET desde | data | Se regime = RET |
| CNPJ do evento 109 | texto | Inscrição da "incorporação afetada" no CNPJ, vinculada ao evento 109 — Patrimônio de Afetação (exigência da Receita para o RET) |

**Seção: Escrituração e responsáveis**
| Campo | Observação |
|---|---|
| Contador responsável (nome, CRC, e-mail, telefone) | |
| Escritório de contabilidade | |
| Código da empresa no sistema contábil externo | Chave da futura integração (De-Para) |
| Plano de contas: código de referência | Para o De-Para contábil da Fase 2 |

**Seção: Obrigações**
| Campo | Observação |
|---|---|
| Entrega DIMOB | sim/não — obrigação acessória típica do setor |
| EFD-Contribuições | sim/não |
| Observações contábeis | texto livre |

**Fundamentação:** o RET (Lei 10.931/04) exige patrimônio de afetação averbado + inscrição no CNPJ evento 109 + termo de opção na Receita. A contabilidade da SPE afetada deve ser segregada, com conta bancária específica. É por isso que as abas Terrenos (afetação), Contas bancárias (conta específica) e Contábil (RET) se referenciam mutuamente.

---

## Regras gerais (todas as abas)

1. Modal com abas, padrão visual já aprovado no módulo Clientes
2. Auditoria em tudo: criação e última alteração (quem/quando) via `DevelopmentEvent`
3. Validação de CPF/CNPJ com dígito verificador em qualquer campo de documento (sócios, investidores, SPE)
4. Salvamento por aba ou geral — decisão do desenvolvedor, mas o usuário não pode perder dados preenchidos ao trocar de aba
5. Permissões: mesma lógica por papel do módulo Clientes (visualizar/editar/excluir separados; exclusão restrita a Administrador, Diretor e quem mais for definido)
6. Exclusão de SPE bloqueada se houver empreendimento vinculado

## Sequência sugerida de implementação

1. Aba Dados (base, com validações e endereço)
2. Cadastro central de Contas bancárias + aba de vinculação
3. Abas Sócios e Investidores (estruturas de tabela semelhantes)
4. Aba Documentação (reaproveita anexos existentes)
5. Aba Terrenos
6. Aba Contábil
7. Regressão do fluxo que depende de SPE (criação de empreendimento vinculado a SPE segue funcionando)

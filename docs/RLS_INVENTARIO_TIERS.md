# RLS — Inventário de tabelas por tier e grupos de ativação

> Pilar 2 de `docs/ESPEC_MULTITENANT_FUNDACOES.md`. Pré-requisito da Etapa 4. Versionado em 2026-10-22.
> Gerado a partir do `prisma/schema.prisma` por `node scripts/rls-tier-inventory.mjs prisma/schema.prisma` — rodar de novo a cada tabela nova e atualizar este documento. **Toda tabela do schema precisa aparecer aqui, num grupo ou nas exceções.**

## Como os tiers são definidos

- **Tier 1** — a tabela tem `organizationId` próprio (não nulo). Policy: `"organizationId" = app_current_org_id()`.
- **Tier 2** — 1 salto: FK **obrigatória** até uma tabela Tier 1. Policy: `EXISTS (SELECT 1 FROM <pai> p WHERE p.id = <fk> AND p."organizationId" = app_current_org_id())`.
- **Tier 3** — 2+ saltos por FKs obrigatórias. Mesma ideia, com a cadeia inteira (ou função auxiliar, se o desempenho pedir).
- **FK opcional nunca é caminho de policy**: com a FK nula, a linha sumiria pra todo mundo.

## Conferência com o registro da Etapa 2

| | Etapa 2 (registrado) | Reconstruído (2026-10-22) |
|---|---|---|
| Tier 1 | 40 | 40 |
| Tier 2 | 28 | 29 |
| Tier 3 | 16 | 15 |
| Exceções | 6 | 6 |
| **Total** | **90** | **90** |

A lista nominal da Etapa 2 nunca foi versionada — só os totais. A reconstrução bate em tudo menos **uma tabela que mudou entre Tier 2 e Tier 3**. A causa provável: três tabelas têm dois caminhos possíveis até a organização, e a Etapa 2 escolheu o de 2 saltos (o que a aplicação usa) em pelo menos uma delas. **Decisão pendente para a Etapa 4** (ver "Caminhos a decidir").

## Exceções (fora do padrão mecânico — decisão própria, não entram nos grupos)

| Tabela | Por quê | Decisão |
|---|---|---|
| `organizations` | É a própria fronteira. | Policy por `id = app_current_org_id()`. A listagem cross-org dos jobs já passa por `list_active_org_ids()` (SECURITY DEFINER). |
| `users` | Usuário não pertence a uma organização (vínculo via `access_grants`). | Policy pelo próprio usuário da sessão, ou leitura só via função dedicada. A decidir junto com o login. |
| `permissions` | Catálogo global, sem dado sensível. | **Sem RLS** (decidido na Etapa 2). |
| `roles` | `organizationId` nulo = papel de sistema, visível a todos. | Policy `"organizationId" IS NULL OR "organizationId" = app_current_org_id()` — o oposto do fail-closed padrão, de propósito. |
| `role_permissions` | Herda de `roles` (`roleId`). | Mesma regra de `roles`, via EXISTS. |
| `job_runs` | `organizationId` nulo permitido; `sweepStaleJobRuns`, o watchdog pg_cron e o despacho de alertas leem todas as organizações. | Policy por organização + leitura cross-org só via função dedicada ou pelo `postgres` (pg_cron/Edge Function). |

## Grupos de ativação, na ordem em que entram

Ordem: do menor risco (configuração, pouco tráfego) ao maior (carteira, lida e escrita pelos jobs e pela auditoria). Dentro de cada grupo, a tabela-pai entra junto com as filhas. Cada grupo = 1 migration de ativação + 1 de reversão já escrita.

### Grupo 1 — Configurações e regras (12)
| Tabela | Tier | Caminho |
|---|---|---|
| `settings` | 1 | `organizationId` |
| `collection_rules` | 1 | `organizationId` |
| `collection_rule_steps` | 2 | `collectionRuleId → collection_rules` |
| `commission_release_rules` | 1 | `organizationId` |
| `commission_rules` | 1 | `organizationId` |
| `distrato_rules` | 1 | `organizationId` |
| `renegotiation_rules` | 1 | `organizationId` |
| `reservation_rules` | 1 | `organizationId` |
| `proposal_evaluation_rules` | 1 | `organizationId` |
| `allocation_templates` | 1 | `organizationId` |
| `allocation_template_destinations` | 2 | `templateId → allocation_templates` |
| `scheduled_reports` | 1 | `organizationId` |

### Grupo 2 — Modelos de documento e documentos (3)
| Tabela | Tier | Caminho |
|---|---|---|
| `document_templates` | 1 | `organizationId` |
| `document_template_developments` | 2 | `documentTemplateId → document_templates` |
| `documents` | 1 | `organizationId` |

### Grupo 3 — Cadastros de terceiros (7)
| Tabela | Tier | Caminho |
|---|---|---|
| `suppliers` | 1 | `organizationId` |
| `cost_centers` | 1 | `organizationId` |
| `bank_accounts` | 1 | `organizationId` |
| `real_estate_agencies` | 1 | `organizationId` |
| `agency_split_tiers` | 2 | `agencyId → real_estate_agencies` |
| `brokers` | 1 | `organizationId` |
| `partnership_agreements` | 1 | `organizationId` |

### Grupo 4 — Clientes (2)
| Tabela | Tier | Caminho |
|---|---|---|
| `customers` | 1 | `organizationId` |
| `customer_contacts` | 2 | `customerId → customers` |

### Grupo 5 — SPEs (4)
| Tabela | Tier | Caminho |
|---|---|---|
| `special_purpose_entities` | 1 | `organizationId` |
| `spe_bank_accounts` | 2 | `speId → special_purpose_entities` |
| `spe_lands` | 2 | `speId → special_purpose_entities` |
| `spe_partners` | 2 | `speId → special_purpose_entities` |

### Grupo 6 — Investidores das SPEs (6)
| Tabela | Tier | Caminho |
|---|---|---|
| `spe_investors` | 2 | `speId → special_purpose_entities` |
| `spe_investor_contribution_forecasts` | 3 | `investorId → spe_investors → special_purpose_entities` |
| `spe_capital_calls` | 3 | `forecastId → forecasts → spe_investors → special_purpose_entities` |
| `spe_investor_contributions` | 2* | `bankAccountId → bank_accounts` (*caminho a decidir) |
| `spe_investor_returns` | 2* | `payableId → payables` (*caminho a decidir) |
| `spe_investor_loan_calculations` | 3 | `investorId → spe_investors → special_purpose_entities` |

### Grupo 7 — Índices (2)
| Tabela | Tier | Caminho |
|---|---|---|
| `index_rules` | 1 | `organizationId` |
| `index_values` | 2 | `indexRuleId → index_rules` |

Lidas pelos jobs (`sync-index-values`) e pela auditoria (V1, V5) — os dois já rodam dentro de `withOrgContext`.

### Grupo 8 — Auditoria e trilha (4)
| Tabela | Tier | Caminho |
|---|---|---|
| `audit_events` | 1 | `organizationId` |
| `audit_runs` | 1 | `organizationId` |
| `audit_check_results` | 2 | `auditRunId → audit_runs` |
| `notifications` | 1 | `organizationId` |

### Grupo 9 — Empreendimentos e estrutura física (10)
| Tabela | Tier | Caminho |
|---|---|---|
| `developments` | 1 | `organizationId` |
| `development_events` | 1 | `organizationId` |
| `buildings` | 2 | `developmentId → developments` |
| `floors` | 3 | `buildingId → buildings → developments` |
| `units` | 2 | `developmentId → developments` |
| `unit_links` | 3 | `principalUnitId → units → developments` |
| `unit_status_history` | 3 | `unitId → units → developments` |
| `construction_phases` | 2 | `developmentId → developments` |
| `construction_measurements` | 2 | `developmentId → developments` |
| `construction_phase_measurement_values` | 3 | `measurementId → construction_measurements → developments` |

### Grupo 10 — Comercial: tabela de vendas, reservas, propostas (6)
| Tabela | Tier | Caminho |
|---|---|---|
| `sales_tables` | 2 | `developmentId → developments` |
| `sales_table_units` | 3 | `salesTableId → sales_tables → developments` |
| `reservations` | 1 | `organizationId` |
| `reservation_waitlist_entries` | 2 | `customerId → customers` |
| `proposals` | 1 | `organizationId` |
| `proposal_approvals` | 2 | `proposalId → proposals` |

### Grupo 11 — Vendas e contratos (5)
| Tabela | Tier | Caminho |
|---|---|---|
| `sales` | 1 | `organizationId` |
| `contracts` | 1 | `organizationId` |
| `contract_amendments` | 1 | `organizationId` |
| `contract_assignments` | 1 | `organizationId` |
| `contract_distratos` | 1 | `organizationId` |

### Grupo 12 — Comissões (3)
| Tabela | Tier | Caminho |
|---|---|---|
| `commission_splits` | 2 | `saleId → sales` |
| `external_commission_splits` | 2 | `saleId → sales` |
| `commission_split_payables` | 2 | `payableId → payables` |

### Grupo 13 — Contas a pagar (3)
| Tabela | Tier | Caminho |
|---|---|---|
| `payables` | 1 | `organizationId` |
| `payable_items` | 2 | `payableId → payables` |
| `payable_allocations` | 2 | `payableId → payables` |

### Grupo 14 — Permutas (8)
| Tabela | Tier | Caminho |
|---|---|---|
| `permutantes` | 1 | `organizationId` |
| `exchange_contracts` | 2 | `developmentId → developments` |
| `exchange_contract_lands` | 3 | `exchangeContractId → exchange_contracts → developments` |
| `exchange_contract_financial_terms` | 3 | `exchangeContractId → exchange_contracts → developments` |
| `exchange_contract_financial_units` | 3 | `unitId → units → developments` |
| `exchange_apuration_periods` | 3 | `exchangeContractId → exchange_contracts → developments` |
| `exchange_repasses` | 3 | `exchangeContractId → exchange_contracts → developments` |
| `exchange_retention_releases` | 2* | `payableId → payables` (*caminho a decidir) |

### Grupo 15 — Cobrança e renegociação (3)
| Tabela | Tier | Caminho |
|---|---|---|
| `collection_contact_logs` | 1 | `organizationId` |
| `renegotiation_agreements` | 1 | `organizationId` |
| `renegotiation_approvals` | 2 | `agreementId → renegotiation_agreements` |

### Grupo 16 — Carteira de recebíveis (5) — maior risco
| Tabela | Tier | Caminho |
|---|---|---|
| `receivable_portfolios` | 1 | `organizationId` |
| `installments` | 2 | `portfolioId → receivable_portfolios` |
| `installment_payments` | 3 | `installmentId → installments → receivable_portfolios` |
| `financial_calculations` | 3 | `installmentId → installments → receivable_portfolios` |
| `receivables` | 1 | `organizationId` |

Escrita pelo `recalculate-installments` (diário) e lida pela auditoria V2/V3/V6 — entra por último entre os grupos comuns, com a observação de desempenho mais cuidadosa (Tier 3 em tabela com histórico crescente).

### Grupo 17 — Vínculo de acesso (1) — depende do login
| Tabela | Tier | Caminho |
|---|---|---|
| `access_grants` | 1 | `organizationId` |

É lida pelo `requireAccessContext` **antes** de a organização da sessão existir. Só pode entrar depois que o login ler os vínculos por uma função dedicada (mesmo modelo de `list_active_org_ids()`), senão ninguém consegue entrar.

Depois do Grupo 17: as 6 exceções acima, uma a uma.

**Contagem**: 84 tabelas em grupos + 6 exceções = 90.

## Caminhos a decidir antes de ativar

| Tabela | Caminho mais curto (1 salto) | Caminho que a aplicação usa (2 saltos) |
|---|---|---|
| `spe_investor_contributions` | `bankAccountId → bank_accounts` | `investorId → spe_investors → special_purpose_entities` |
| `spe_investor_returns` | `payableId → payables` | `investorId → spe_investors → special_purpose_entities` |
| `exchange_retention_releases` | `payableId → payables` | `exchangeContractId → exchange_contracts → developments` |

Regra da Etapa 2: o caminho mais curto só vale se os dois caminhos forem **equivalentes por construção** (criados na mesma transação, sem `.update()` capaz de divergir). Precisa ser verificado tabela a tabela; na dúvida, usar o caminho da aplicação.

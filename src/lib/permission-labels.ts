/** Rótulos em português pra matriz de perfil — mesma lista de RESOURCES/PermissionAction de prisma/seed.ts. */
export const RESOURCE_LABELS: Record<string, string> = {
  organization: "Organização",
  spe: "SPEs",
  development: "Empreendimentos",
  unit: "Unidades",
  user: "Usuários",
  role: "Perfis",
  document: "Documentos",
  customer: "Clientes",
  broker: "Corretores",
  agency: "Imobiliárias",
  sales_table: "Tabelas de venda",
  reservation: "Reservas",
  proposal: "Propostas",
  sale: "Vendas",
  contract: "Contratos",
  installment: "Parcelas",
  index_rule: "Índices de correção",
  supplier: "Fornecedores",
  cost_center: "Centros de custo",
  bank_account: "Contas bancárias",
  payable: "Contas a pagar",
  report: "Relatórios",
  job: "Jobs",
  audit: "Auditoria",
  permutante: "Permutantes",
  exchange_contract: "Contratos de permuta",
  document_template: "Modelos de documento",
};

export const ACTION_LABELS: Record<string, string> = {
  VIEW: "Ver",
  CREATE: "Criar",
  EDIT: "Editar",
  DELETE: "Excluir",
  APPROVE: "Aprovar",
  CANCEL: "Cancelar",
  EXPORT: "Exportar",
  VIEW_SENSITIVE: "Ver dados sensíveis",
};

export function resourceLabel(resource: string) {
  return RESOURCE_LABELS[resource] ?? resource;
}

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

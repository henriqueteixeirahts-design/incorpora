/**
 * Seed inicial: organização padrão, catálogo de permissões e papéis de
 * sistema (PRD seção 23). Rodar com `npx prisma db seed`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PermissionAction } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RESOURCES = [
  "organization",
  "spe",
  "development",
  "unit",
  "user",
  "role",
  "document",
  "customer",
  "broker",
  "agency",
  "sales_table",
  "reservation",
  "proposal",
  "sale",
  "contract",
  "installment",
] as const;

const ACTIONS = Object.values(PermissionAction);

// Papel -> conjunto de ações concedidas por recurso. "*" = todos os recursos.
const SYSTEM_ROLES: Record<
  string,
  { description: string; grants: Record<string, PermissionAction[]> }
> = {
  "Administrador da plataforma": {
    description: "Acesso irrestrito a toda a plataforma.",
    grants: { "*": ACTIONS },
  },
  "Diretor da incorporadora": {
    description: "Acesso completo à organização.",
    grants: { "*": ACTIONS },
  },
  Financeiro: {
    description: "Gestão financeira da organização.",
    grants: {
      spe: ["VIEW"],
      development: ["VIEW"],
      unit: ["VIEW"],
      document: ["VIEW", "CREATE", "EXPORT"],
      sale: ["VIEW", "EXPORT"],
      proposal: ["VIEW", "APPROVE"],
      contract: ["VIEW", "EXPORT"],
      installment: ["VIEW", "EXPORT"],
    },
  },
  Comercial: {
    description: "Operação comercial (vendas, propostas, unidades).",
    grants: {
      development: ["VIEW"],
      unit: ["VIEW", "CREATE", "EDIT"],
      document: ["VIEW", "CREATE"],
      customer: ["VIEW", "CREATE", "EDIT"],
      broker: ["VIEW"],
      agency: ["VIEW"],
      sales_table: ["VIEW"],
      reservation: ["VIEW", "CREATE", "EDIT", "CANCEL"],
      proposal: ["VIEW", "CREATE", "EDIT"],
      sale: ["VIEW"],
      contract: ["VIEW"],
      installment: ["VIEW"],
    },
  },
  "Gerente comercial": {
    description: "Comercial com alçada de aprovação.",
    grants: {
      development: ["VIEW"],
      unit: ["VIEW", "CREATE", "EDIT", "APPROVE"],
      document: ["VIEW", "CREATE"],
      customer: ["VIEW", "CREATE", "EDIT"],
      broker: ["VIEW", "CREATE", "EDIT"],
      agency: ["VIEW", "CREATE", "EDIT"],
      sales_table: ["VIEW", "CREATE", "EDIT"],
      reservation: ["VIEW", "CREATE", "EDIT", "CANCEL"],
      proposal: ["VIEW", "CREATE", "EDIT", "APPROVE"],
      sale: ["VIEW", "CREATE"],
      contract: ["VIEW", "CREATE", "EDIT"],
      installment: ["VIEW"],
    },
  },
  Jurídico: {
    description: "Revisão jurídica de contratos e cláusulas.",
    grants: {
      development: ["VIEW"],
      unit: ["VIEW"],
      document: ["VIEW", "CREATE", "APPROVE"],
      proposal: ["VIEW", "APPROVE"],
      sale: ["VIEW"],
      contract: ["VIEW", "CREATE", "EDIT", "APPROVE"],
    },
  },
  Contabilidade: {
    description: "Consulta contábil e exportações.",
    grants: { "*": ["VIEW", "EXPORT"] },
  },
  Investidor: {
    description: "Painel do investidor (portal, somente leitura).",
    grants: {
      development: ["VIEW"],
      unit: ["VIEW"],
      sale: ["VIEW"],
    },
  },
  Imobiliária: {
    description: "Parceiro comercial externo.",
    grants: { unit: ["VIEW"], reservation: ["VIEW", "CREATE"], proposal: ["VIEW", "CREATE"] },
  },
  Corretor: {
    description: "Corretor de vendas.",
    grants: { unit: ["VIEW"], reservation: ["VIEW", "CREATE"], proposal: ["VIEW", "CREATE"] },
  },
  Cliente: {
    description: "Acesso ao portal do cliente (Fase 14).",
    grants: {},
  },
  Auditor: {
    description: "Auditoria e conformidade — leitura ampla, sem edição.",
    grants: { "*": ["VIEW", "VIEW_SENSITIVE", "EXPORT"] },
  },
};

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "TSH Incorporadora",
      planTier: "internal",
    },
    update: { name: "TSH Incorporadora" },
  });

  const permissionByKey = new Map<string, { id: string }>();
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        create: { resource, action },
        update: {},
      });
      permissionByKey.set(`${resource}.${action}`, permission);
    }
  }

  for (const [roleName, { description, grants }] of Object.entries(SYSTEM_ROLES)) {
    // Papéis de sistema têm organizationId nulo; a unique compound
    // (organizationId, name) do Prisma não aceita null como filtro, então
    // buscamos manualmente em vez de usar upsert.
    const existingRole = await prisma.role.findFirst({
      where: { organizationId: null, name: roleName },
    });
    const role = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: { description },
        })
      : await prisma.role.create({
          data: { name: roleName, description, isSystem: true },
        });

    const resourceActionPairs: Array<[string, PermissionAction]> = [];
    for (const [resource, actions] of Object.entries(grants)) {
      const resourceList = resource === "*" ? RESOURCES : [resource];
      for (const r of resourceList) {
        for (const action of actions) {
          resourceActionPairs.push([r, action]);
        }
      }
    }

    for (const [resource, action] of resourceActionPairs) {
      const permission = permissionByKey.get(`${resource}.${action}`);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  console.log(`Seed concluído. Organização base: ${organization.name} (${organization.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { listOrganizationUsersPaged, updateUserAccess, revokeUserAccess } from "@/server/users";
import {
  createCustomRole,
  updateCustomRole,
  duplicateRoleForCustomization,
  deleteCustomRole,
} from "@/server/roles";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Etapa 5 — cobertura da camada de UI
 * de Usuários/Perfis: agregação de múltiplos AccessGrant (um por
 * empreendimento) numa linha por usuário, substituição atômica do conjunto
 * de grants na edição, proteção contra remover o último Administrador da
 * plataforma (por edição OU revogação), e as operações de perfil customizado
 * (criar/editar/duplicar/excluir), respeitando que papel de sistema é
 * somente leitura.
 */

let org: { id: string };
let otherOrg: { id: string };
let contextFull: AccessContext;
let devX: { id: string };
let devY: { id: string };
let otherOrgDev: { id: string };
let systemRole: { id: string; name: string };
let adminRole: { id: string; name: string };
let brokerRole: { id: string; name: string };
let permViewId: string;
let permEditId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Usuários e Perfis" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Usuários e Perfis (outra)" } });
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "actor-users-roles@teste.local", fullName: "Ator" },
  });
  contextFull = { userId: actor.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Usuários e Perfis", document: "63265390000141", status: "ACTIVE",
    email: "spe-users-roles@teste.local", phone: "62999990400",
  });
  devX = await createDevelopment(contextFull, { speId: spe.id, name: "Development X UR", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId: spe.id, name: "Development Y UR", type: "RESIDENTIAL_BUILDING" });

  const otherSpe = await createSpe(
    { ...contextFull, organizationId: otherOrg.id },
    { name: "SPE outra org", document: "11444777000161", status: "ACTIVE", email: "spe-outra@teste.local", phone: "62999990401" },
  );
  otherOrgDev = await createDevelopment(
    { ...contextFull, organizationId: otherOrg.id },
    { speId: otherSpe.id, name: "Development outra org", type: "RESIDENTIAL_BUILDING" },
  );

  adminRole = await prisma.role.create({ data: { organizationId: org.id, name: "Administrador da plataforma", isSystem: false } });
  brokerRole = await prisma.role.create({ data: { organizationId: org.id, name: "Corretor UR", isSystem: false } });
  systemRole = await prisma.role.create({ data: { organizationId: null, name: "Papel de sistema UR", isSystem: true } });

  const permView = await prisma.permission.create({ data: { resource: "__test_ur_resource", action: "VIEW" } });
  const permEdit = await prisma.permission.create({ data: { resource: "__test_ur_resource", action: "EDIT" } });
  permViewId = permView.id;
  permEditId = permEdit.id;
  await prisma.rolePermission.createMany({
    data: [{ roleId: systemRole.id, permissionId: permViewId }, { roleId: systemRole.id, permissionId: permEditId }],
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.rolePermission.deleteMany({ where: { permissionId: { in: [permViewId, permEditId] } } });
  await prisma.permission.deleteMany({ where: { id: { in: [permViewId, permEditId] } } });
  await prisma.accessGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.role.deleteMany({ where: { OR: [{ organizationId: { in: orgIds } }, { id: systemRole.id }] } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: "-users-roles@teste.local" } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("listOrganizationUsersPaged — agrega múltiplos AccessGrant numa linha por usuário", () => {
  it("usuário com grants em X e Y aparece uma vez, com developmentScope contendo os dois", async () => {
    const broker = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "broker-multi-users-roles@teste.local", fullName: "Corretor Multi" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: broker.id, roleId: brokerRole.id, developmentId: devX.id } });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: broker.id, roleId: brokerRole.id, developmentId: devY.id } });

    const { items } = await listOrganizationUsersPaged(contextFull, {});
    const row = items.find((i) => i.userId === broker.id);
    expect(row).toBeTruthy();
    expect(row!.developmentScope).not.toBe("ALL");
    expect((row!.developmentScope as string[]).sort()).toEqual([devX.id, devY.id].sort());
  });

  it("usuário com grant irrestrito aparece com developmentScope 'ALL'", async () => {
    const admin = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "admin-unrestricted-users-roles@teste.local", fullName: "Admin Irrestrito" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: admin.id, roleId: adminRole.id } });

    const { items } = await listOrganizationUsersPaged(contextFull, {});
    const row = items.find((i) => i.userId === admin.id);
    expect(row!.developmentScope).toBe("ALL");
  });
});

describe("updateUserAccess — substitui o conjunto de grants atomicamente", () => {
  it("troca de [X] pra [Y]: grant antigo some, novo aparece", async () => {
    const user = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "swap-users-roles@teste.local", fullName: "Troca Escopo" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: brokerRole.id, developmentId: devX.id } });

    await updateUserAccess(contextFull, user.id, { roleId: brokerRole.id, developmentIds: [devY.id] });

    const grants = await prisma.accessGrant.findMany({ where: { organizationId: org.id, userId: user.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0].developmentId).toBe(devY.id);
  });

  it("rejeita developmentId de outra organização", async () => {
    const user = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "cross-org-users-roles@teste.local", fullName: "Cross Org" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: brokerRole.id, developmentId: devX.id } });

    await expect(
      updateUserAccess(contextFull, user.id, { roleId: brokerRole.id, developmentIds: [otherOrgDev.id] }),
    ).rejects.toThrow("Empreendimento inválido.");
  });

  it("bloqueia rebaixar o único Administrador da plataforma", async () => {
    await prisma.accessGrant.deleteMany({ where: { organizationId: org.id, roleId: adminRole.id } });
    const soleAdmin = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "sole-admin-users-roles@teste.local", fullName: "Único Admin" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: soleAdmin.id, roleId: adminRole.id } });

    await expect(
      updateUserAccess(contextFull, soleAdmin.id, { roleId: brokerRole.id, developmentIds: null }),
    ).rejects.toThrow("único Administrador da plataforma");

    const grants = await prisma.accessGrant.findMany({ where: { organizationId: org.id, userId: soleAdmin.id } });
    expect(grants[0].roleId).toBe(adminRole.id);
  });

  it("permite rebaixar um admin quando há outro Administrador da plataforma", async () => {
    const admin1 = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "admin1-users-roles@teste.local", fullName: "Admin 1" },
    });
    const admin2 = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "admin2-users-roles@teste.local", fullName: "Admin 2" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: admin1.id, roleId: adminRole.id } });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: admin2.id, roleId: adminRole.id } });

    await updateUserAccess(contextFull, admin1.id, { roleId: brokerRole.id, developmentIds: null });

    const grants = await prisma.accessGrant.findMany({ where: { organizationId: org.id, userId: admin1.id } });
    expect(grants[0].roleId).toBe(brokerRole.id);
  });
});

describe("revokeUserAccess — remove todos os grants do usuário na organização", () => {
  it("bloqueia auto-revogação", async () => {
    await expect(revokeUserAccess(contextFull, contextFull.userId)).rejects.toThrow(
      "Você não pode revogar o seu próprio acesso.",
    );
  });

  it("bloqueia revogar o único Administrador da plataforma", async () => {
    await prisma.accessGrant.deleteMany({ where: { organizationId: org.id, roleId: adminRole.id } });
    const soleAdmin = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "revoke-sole-admin-users-roles@teste.local", fullName: "Único Admin Revoke" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: soleAdmin.id, roleId: adminRole.id } });

    await expect(revokeUserAccess(contextFull, soleAdmin.id)).rejects.toThrow("único Administrador da plataforma");
  });

  it("remove todos os grants de um usuário com múltiplos empreendimentos", async () => {
    const broker = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "revoke-multi-users-roles@teste.local", fullName: "Revoke Multi" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: broker.id, roleId: brokerRole.id, developmentId: devX.id } });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: broker.id, roleId: brokerRole.id, developmentId: devY.id } });

    await revokeUserAccess(contextFull, broker.id);

    const grants = await prisma.accessGrant.findMany({ where: { organizationId: org.id, userId: broker.id } });
    expect(grants).toHaveLength(0);
  });
});

describe("Perfis customizados — papel de sistema é somente leitura, customizado é editável", () => {
  it("createCustomRole cria o perfil com as permissões escolhidas", async () => {
    const role = await createCustomRole(contextFull, { name: "Perfil Custom A", permissionIds: [permViewId] });
    const rolePermissions = await prisma.rolePermission.findMany({ where: { roleId: role!.id } });
    expect(rolePermissions.map((rp) => rp.permissionId)).toEqual([permViewId]);
  });

  it("updateCustomRole rejeita editar um papel de sistema", async () => {
    await expect(
      updateCustomRole(contextFull, systemRole.id, { name: "Tentativa de editar sistema", permissionIds: [] }),
    ).rejects.toThrow("Perfil não encontrado.");
  });

  it("duplicateRoleForCustomization copia as permissões do papel de sistema pra um novo papel customizado", async () => {
    const duplicated = await duplicateRoleForCustomization(contextFull, systemRole.id, "Papel de sistema UR (customizado)");
    expect(duplicated!.organizationId).toBe(org.id);
    expect(duplicated!.isSystem).toBe(false);

    const rolePermissions = await prisma.rolePermission.findMany({ where: { roleId: duplicated!.id } });
    expect(rolePermissions.map((rp) => rp.permissionId).sort()).toEqual([permEditId, permViewId].sort());
  });

  it("deleteCustomRole rejeita excluir um perfil atribuído a usuários", async () => {
    const role = await createCustomRole(contextFull, { name: "Perfil Custom B", permissionIds: [] });
    const user = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "role-in-use-users-roles@teste.local", fullName: "Usa Perfil" },
    });
    await prisma.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: role!.id } });

    await expect(deleteCustomRole(contextFull, role!.id)).rejects.toThrow("atribuído a");
  });

  it("deleteCustomRole exclui um perfil sem usuários atribuídos", async () => {
    const role = await createCustomRole(contextFull, { name: "Perfil Custom C", permissionIds: [] });
    await deleteCustomRole(contextFull, role!.id);

    const found = await prisma.role.findUnique({ where: { id: role!.id } });
    expect(found).toBeNull();
  });
});

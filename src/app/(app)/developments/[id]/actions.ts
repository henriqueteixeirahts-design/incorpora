"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createBuilding, createFloor } from "@/server/developments";
import { createUnit, updateUnitStatus, linkUnits } from "@/server/units";
import { setDevelopmentCorrectionRule } from "@/server/receivables";
import type { InterestType } from "@/generated/prisma/client";
import type {
  UnitType,
  UnitStatus,
  UnitLinkType,
  UnitLinkPricing,
} from "@/generated/prisma/client";

export type FormState = { error?: string };

export async function createBuildingAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome da torre/bloco." };

  try {
    await createBuilding(context, developmentId, name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar torre." };
  }

  revalidatePath(`/developments/${developmentId}`);
  return {};
}

export async function createFloorAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const buildingId = String(formData.get("buildingId") ?? "");
  const level = Number(formData.get("level"));
  const label = String(formData.get("label") ?? "").trim();

  if (!buildingId || Number.isNaN(level)) {
    return { error: "Selecione a torre e informe o andar." };
  }

  try {
    await createFloor(context, buildingId, level, label || undefined);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar pavimento." };
  }

  revalidatePath(`/developments/${developmentId}`);
  return {};
}

export async function createUnitAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "unit", "CREATE")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const number = String(formData.get("number") ?? "").trim();
  const unitType = String(formData.get("unitType") ?? "") as UnitType;
  const isAccessory = formData.get("isAccessory") === "on";
  const buildingId = String(formData.get("buildingId") ?? "").trim() || undefined;
  const floorId = String(formData.get("floorId") ?? "").trim() || undefined;

  const numberField = (key: string) => {
    const raw = formData.get(key);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  };

  if (!number || !unitType) {
    return { error: "Número e tipo da unidade são obrigatórios." };
  }

  try {
    await createUnit(context, {
      developmentId,
      buildingId,
      floorId,
      unitType,
      isAccessory,
      number,
      bedrooms: numberField("bedrooms"),
      suites: numberField("suites"),
      privateArea: numberField("privateArea"),
      totalArea: numberField("totalArea"),
      block: String(formData.get("block") ?? "").trim() || undefined,
      lotArea: numberField("lotArea"),
      frontage: numberField("frontage"),
      depth: numberField("depth"),
      registrationNumber: String(formData.get("registrationNumber") ?? "").trim() || undefined,
      referenceValue: numberField("referenceValue"),
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar unidade." };
  }

  revalidatePath(`/developments/${developmentId}`);
  revalidatePath(`/developments/${developmentId}/map`);
  return {};
}

export async function updateUnitStatusAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "unit", "EDIT")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const status = String(formData.get("status") ?? "") as UnitStatus;
  if (!unitId || !status) return;

  await updateUnitStatus(context, unitId, status);

  revalidatePath(`/developments/${developmentId}`);
  revalidatePath(`/developments/${developmentId}/map`);
}

export async function linkUnitsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "unit", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const principalUnitId = String(formData.get("principalUnitId") ?? "");
  const accessoryUnitId = String(formData.get("accessoryUnitId") ?? "");
  const linkType = String(formData.get("linkType") ?? "") as UnitLinkType;
  const pricing = String(formData.get("pricing") ?? "") as UnitLinkPricing;

  if (!principalUnitId || !accessoryUnitId || !linkType || !pricing) {
    return { error: "Preencha todos os campos do vínculo." };
  }

  try {
    await linkUnits(context, principalUnitId, accessoryUnitId, linkType, pricing);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao vincular unidades." };
  }

  revalidatePath(`/developments/${developmentId}`);
  return {};
}

export async function setDevelopmentCorrectionRuleAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const habiteSeDateRaw = String(formData.get("habiteSeDate") ?? "").trim();
  const postHabiteSeIndexRuleId =
    String(formData.get("postHabiteSeIndexRuleId") ?? "").trim() || null;
  const postHabiteSeMonthlyInterestPercentRaw = formData.get("postHabiteSeMonthlyInterestPercent");
  const postHabiteSeMonthlyInterestPercent = postHabiteSeMonthlyInterestPercentRaw
    ? Number(postHabiteSeMonthlyInterestPercentRaw)
    : null;
  const postHabiteSeInterestType = String(
    formData.get("postHabiteSeInterestType") ?? "COMPOUND",
  ) as InterestType;

  if (!developmentId) return { error: "Empreendimento inválido." };

  try {
    await setDevelopmentCorrectionRule(context, developmentId, {
      habiteSeDate: habiteSeDateRaw ? new Date(habiteSeDateRaw) : null,
      postHabiteSeIndexRuleId,
      postHabiteSeMonthlyInterestPercent,
      postHabiteSeInterestType,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Falha ao configurar correção pós-Habite-se.",
    };
  }

  revalidatePath(`/developments/${developmentId}`);
  return {};
}

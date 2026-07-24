"use client";

import { updateUnitStatusAction } from "./actions";
import { UNIT_STATUS_META, UNIT_STATUS_VALUES } from "@/lib/unit-status";
import type { UnitStatus } from "@/generated/prisma/client";

export function UnitStatusSelect({
  developmentId,
  unitId,
  status,
  disabled,
}: {
  developmentId: string;
  unitId: string;
  status: UnitStatus;
  disabled?: boolean;
}) {
  return (
    <form action={updateUnitStatusAction}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="unitId" value={unitId} />
      <select
        name="status"
        defaultValue={status}
        disabled={disabled}
        style={{ color: UNIT_STATUS_META[status].color, borderColor: UNIT_STATUS_META[status].color }}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {UNIT_STATUS_VALUES.map((value) => (
          <option key={value} value={value}>
            {UNIT_STATUS_META[value].label}
          </option>
        ))}
      </select>
    </form>
  );
}

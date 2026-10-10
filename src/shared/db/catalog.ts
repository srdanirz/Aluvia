import { eq, inArray, sql } from "drizzle-orm";

import {
  disasterTypeSupplyTypes,
  disasterTypeWorkTypes,
  emergencies,
  supplyTypes,
  workTypes,
} from "./schema";
import type { Executor } from "./types";

/**
 * Copies each emergency's disaster-type work template into the emergency's own catalog, in one
 * statement for any number of emergencies. Returns how many work types were copied. Later
 * template edits never reach an emergency that already has its copy (ADR 0009).
 */
export async function copyWorkTypeTemplates(executor: Executor, emergencyIds: string[]): Promise<number> {
  if (emergencyIds.length === 0) return 0;
  const copied = await executor
    .insert(workTypes)
    .select(
      executor
        .select({
          emergencyId: emergencies.id,
          key: disasterTypeWorkTypes.key,
          name: disasterTypeWorkTypes.name,
          sortOrder: disasterTypeWorkTypes.sortOrder,
          isActive: sql<boolean>`true`.as("is_active"),
        })
        .from(emergencies)
        .innerJoin(
          disasterTypeWorkTypes,
          eq(disasterTypeWorkTypes.disasterTypeKey, emergencies.disasterTypeKey),
        )
        .where(inArray(emergencies.id, emergencyIds)),
    )
    .returning({ key: workTypes.key });
  return copied.length;
}

/**
 * Same as copyWorkTypeTemplates, for the supply catalog (shovels, water, gloves). Call both in the
 * transaction that creates the emergency.
 */
export async function copySupplyTypeTemplates(executor: Executor, emergencyIds: string[]): Promise<number> {
  if (emergencyIds.length === 0) return 0;
  const copied = await executor
    .insert(supplyTypes)
    .select(
      executor
        .select({
          emergencyId: emergencies.id,
          key: disasterTypeSupplyTypes.key,
          name: disasterTypeSupplyTypes.name,
          sortOrder: disasterTypeSupplyTypes.sortOrder,
          isActive: sql<boolean>`true`.as("is_active"),
        })
        .from(emergencies)
        .innerJoin(
          disasterTypeSupplyTypes,
          eq(disasterTypeSupplyTypes.disasterTypeKey, emergencies.disasterTypeKey),
        )
        .where(inArray(emergencies.id, emergencyIds)),
    )
    .returning({ key: supplyTypes.key });
  return copied.length;
}

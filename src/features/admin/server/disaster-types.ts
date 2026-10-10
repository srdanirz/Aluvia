import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  adminEvents,
  disasterTypes,
  disasterTypeSupplyTypes,
  disasterTypeWorkTypes,
} from "@/shared/db/schema";
import type { Database, Transaction } from "@/shared/db/types";

import type { Result } from "../result";
import type { DisasterTypeInput, DisasterTypeUpdate } from "../schemas";

/** Writes both templates of a type in their saved order; one statement per table. */
async function insertTemplates(tx: Transaction, key: string, input: DisasterTypeInput) {
  const rows = (items: DisasterTypeInput["workTypes"]) =>
    items.map((item, index) => ({ disasterTypeKey: key, key: item.key, name: item.name, sortOrder: index }));
  await tx.insert(disasterTypeWorkTypes).values(rows(input.workTypes));
  if (input.supplyTypes.length > 0) await tx.insert(disasterTypeSupplyTypes).values(rows(input.supplyTypes));
}

const templateKeys = (input: DisasterTypeInput) => ({
  workTypeKeys: input.workTypes.map((w) => w.key),
  supplyTypeKeys: input.supplyTypes.map((s) => s.key),
});

/** Adds a disaster type with its work and supply templates and logs it, all or nothing. */
export async function createDisasterType(
  db: Database,
  actorId: string,
  input: DisasterTypeInput,
): Promise<Result<{ key: string }>> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(disasterTypes)
      .values({ key: input.key, name: input.name })
      .onConflictDoNothing()
      .returning({ key: disasterTypes.key });
    if (!created) return { ok: false, code: "disaster_type_key_taken" };

    await insertTemplates(tx, input.key, input);
    await tx.insert(adminEvents).values({
      actorId,
      action: "disaster_type_created",
      targetType: "disaster_type",
      targetId: input.key,
      payload: templateKeys(input),
    });
    return { ok: true, data: { key: input.key } };
  });
}

/**
 * Renames a disaster type and replaces its templates as a whole, if nobody saved it since
 * `version` was read. Emergencies keep their own copy, so this never changes an open emergency.
 */
export async function updateDisasterType(
  db: Database,
  actorId: string,
  input: DisasterTypeUpdate,
): Promise<Result<{ version: number }>> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(disasterTypes)
      .set({ name: input.name, version: sql`${disasterTypes.version} + 1` })
      .where(and(eq(disasterTypes.key, input.key), eq(disasterTypes.version, input.version)))
      .returning({ version: disasterTypes.version });
    if (!updated) {
      // The decision was the UPDATE's; this read only picks which code to answer.
      const [exists] = await tx
        .select({ key: disasterTypes.key })
        .from(disasterTypes)
        .where(eq(disasterTypes.key, input.key));
      return { ok: false, code: exists ? "stale_version" : "not_found" };
    }

    await tx.delete(disasterTypeWorkTypes).where(eq(disasterTypeWorkTypes.disasterTypeKey, input.key));
    await tx.delete(disasterTypeSupplyTypes).where(eq(disasterTypeSupplyTypes.disasterTypeKey, input.key));
    await insertTemplates(tx, input.key, input);
    await tx.insert(adminEvents).values({
      actorId,
      action: "disaster_type_updated",
      targetType: "disaster_type",
      targetId: input.key,
      payload: { version: updated.version, ...templateKeys(input) },
    });
    return { ok: true, data: updated };
  });
}

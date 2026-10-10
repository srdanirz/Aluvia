import { copySupplyTypeTemplates, copyWorkTypeTemplates } from "../catalog";
import {
  disasterTypes,
  disasterTypeSupplyTypes,
  disasterTypeWorkTypes,
  emergencies,
  emergencySettings,
} from "../schema";
import type { LocalizedText } from "../schema/types";
import type { Database } from "../types";
import { DISASTER_TYPES } from "./disaster-types";
import { EMERGENCIES } from "./emergencies";

/**
 * Loads the reviewed seeds in one transaction. Idempotent: rows that already exist are left as
 * they are, so running it again never overwrites what an admin edited.
 */
export async function seedDatabase(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const newTypes = await tx
      .insert(disasterTypes)
      .values(DISASTER_TYPES.map(({ key, name }) => ({ key, name })))
      .onConflictDoNothing()
      .returning({ key: disasterTypes.key });
    // Only types created now get their template: an existing type's template is the admin's,
    // and re-adding a work type they removed would undo their edit.
    const newKeys = new Set(newTypes.map(({ key }) => key));
    const templates = DISASTER_TYPES.filter((type) => newKeys.has(type.key));
    const rows = (pick: (type: (typeof templates)[number]) => { key: string; name: LocalizedText }[]) =>
      templates.flatMap((type) =>
        pick(type).map((item, index) => ({
          disasterTypeKey: type.key,
          key: item.key,
          name: item.name,
          sortOrder: index,
        })),
      );
    const workRows = rows((type) => type.workTypes);
    const supplyRows = rows((type) => type.supplyTypes);
    if (workRows.length > 0) await tx.insert(disasterTypeWorkTypes).values(workRows);
    if (supplyRows.length > 0) await tx.insert(disasterTypeSupplyTypes).values(supplyRows);

    const created = await tx
      .insert(emergencies)
      .values(
        EMERGENCIES.map(({ slug, disasterTypeKey, name, defaultLocale, timeZone, comunas, startedAt }) => ({
          slug,
          disasterTypeKey,
          name,
          defaultLocale,
          timeZone,
          comunas,
          startedAt,
        })),
      )
      .onConflictDoNothing({ target: emergencies.slug })
      .returning({ id: emergencies.id, slug: emergencies.slug });
    if (created.length === 0) return;

    await tx.insert(emergencySettings).values(
      created.map(({ id, slug }) => ({
        emergencyId: id,
        officialSurveyName: EMERGENCIES.find((e) => e.slug === slug)?.officialSurveyName ?? null,
        emergencyNumbers: EMERGENCIES.find((e) => e.slug === slug)?.emergencyNumbers ?? [],
      })),
    );
    const createdIds = created.map(({ id }) => id);
    await copyWorkTypeTemplates(tx, createdIds);
    await copySupplyTypeTemplates(tx, createdIds);
  });
}

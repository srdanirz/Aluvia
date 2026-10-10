import "server-only";

import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";

import {
  disasterTypes,
  disasterTypeSupplyTypes,
  disasterTypeWorkTypes,
  emergencies,
  emergencyNotices,
  emergencySettings,
  supplyTypes,
  workTypes,
} from "@/shared/db/schema";
import type { LocalizedText } from "@/shared/db/schema/types";
import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, PAGE_SIZE, pageOf } from "@/shared/lib/pagination";

export type DisasterTypeSummary = {
  key: string;
  name: LocalizedText;
  workTypeCount: number;
  supplyTypeCount: number;
};

/** Disaster types by key, keyset-paged by the last key seen. */
export async function listDisasterTypes(
  db: Executor,
  { after }: { after?: string } = {},
): Promise<Page<DisasterTypeSummary>> {
  const rows = await db
    .select({
      key: disasterTypes.key,
      name: disasterTypes.name,
      // Drizzle renders columns unqualified inside sql``, so the outer reference is spelled out.
      workTypeCount: sql<number>`(select count(*)::int from ${disasterTypeWorkTypes} where ${disasterTypeWorkTypes.disasterTypeKey} = "disaster_types"."key")`,
      supplyTypeCount: sql<number>`(select count(*)::int from ${disasterTypeSupplyTypes} where ${disasterTypeSupplyTypes.disasterTypeKey} = "disaster_types"."key")`,
    })
    .from(disasterTypes)
    .where(after ? gt(disasterTypes.key, after) : undefined)
    .orderBy(asc(disasterTypes.key))
    .limit(PAGE_SIZE + 1);
  return pageOf(rows, (last) => last.key);
}

/**
 * Every disaster type, for a picker. Follows the keyset pages to the end: one query per 50
 * types, sequential because each page needs the previous cursor. The registry is small.
 */
export async function listAllDisasterTypes(db: Executor, after?: string): Promise<DisasterTypeSummary[]> {
  const page = await listDisasterTypes(db, { after });
  return page.nextCursor ? [...page.items, ...(await listAllDisasterTypes(db, page.nextCursor))] : page.items;
}

export type DisasterTypeDetail = {
  key: string;
  name: LocalizedText;
  version: number;
  workTypes: { key: string; name: LocalizedText }[];
  supplyTypes: { key: string; name: LocalizedText }[];
};

export async function findDisasterType(db: Executor, key: string): Promise<DisasterTypeDetail | null> {
  const [[type], template, supplyTemplate] = await Promise.all([
    db
      .select({ key: disasterTypes.key, name: disasterTypes.name, version: disasterTypes.version })
      .from(disasterTypes)
      .where(eq(disasterTypes.key, key)),
    db
      .select({ key: disasterTypeWorkTypes.key, name: disasterTypeWorkTypes.name })
      .from(disasterTypeWorkTypes)
      .where(eq(disasterTypeWorkTypes.disasterTypeKey, key))
      .orderBy(asc(disasterTypeWorkTypes.sortOrder), asc(disasterTypeWorkTypes.key)),
    db
      .select({ key: disasterTypeSupplyTypes.key, name: disasterTypeSupplyTypes.name })
      .from(disasterTypeSupplyTypes)
      .where(eq(disasterTypeSupplyTypes.disasterTypeKey, key))
      .orderBy(asc(disasterTypeSupplyTypes.sortOrder), asc(disasterTypeSupplyTypes.key)),
  ]);
  return type ? { ...type, workTypes: template, supplyTypes: supplyTemplate } : null;
}

export type EmergencySummary = {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: string;
  status: "open" | "closed";
  timeZone: string;
  startedAt: Date;
  disasterTypeName: LocalizedText;
  cursorAt: string;
};

/** Emergencies, newest first, keyset-paged by (created_at, id). */
export async function listEmergencies(
  db: Executor,
  { after }: { after?: string } = {},
): Promise<Page<EmergencySummary>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db
    .select({
      id: emergencies.id,
      slug: emergencies.slug,
      name: emergencies.name,
      defaultLocale: emergencies.defaultLocale,
      status: emergencies.status,
      timeZone: emergencies.timeZone,
      startedAt: emergencies.startedAt,
      disasterTypeName: disasterTypes.name,
      // Postgres keeps microseconds and a JS Date does not; the cursor carries the exact text.
      cursorAt: sql<string>`${emergencies.createdAt}::text`,
    })
    .from(emergencies)
    .innerJoin(disasterTypes, eq(disasterTypes.key, emergencies.disasterTypeKey))
    .where(
      cursor
        ? sql`(${emergencies.createdAt}, ${emergencies.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`
        : undefined,
    )
    .orderBy(desc(emergencies.createdAt), desc(emergencies.id))
    .limit(PAGE_SIZE + 1);
  return pageOf(rows, (last) => encodeTimeCursor(last.cursorAt, last.id));
}

export type EmergencyDetail = {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: string;
  timeZone: string;
  comunas: string[];
  status: "open" | "closed";
  startedAt: Date;
  closedAt: Date | null;
  version: number;
  hasArea: boolean;
  disasterTypeKey: string;
  disasterTypeName: LocalizedText;
  workTypeCount: number;
  supplyTypeCount: number;
  settings: {
    version: number;
    smsDailyCap: number;
    whatsappDailyCap: number;
    neighborReserve: number;
    claimHoldMinutes: number;
    staleAfterHours: number;
    officialContact: string | null;
    officialSurveyName: string | null;
    emergencyNumbers: { label: LocalizedText; phone: string }[];
  };
  notice: { id: string; message: LocalizedText; publishedAt: Date } | null;
};

/** One emergency with its settings and the notice in force, in one query. */
export async function findEmergency(db: Executor, slug: string): Promise<EmergencyDetail | null> {
  const [row] = await db
    .select({
      id: emergencies.id,
      slug: emergencies.slug,
      name: emergencies.name,
      defaultLocale: emergencies.defaultLocale,
      timeZone: emergencies.timeZone,
      comunas: emergencies.comunas,
      status: emergencies.status,
      startedAt: emergencies.startedAt,
      closedAt: emergencies.closedAt,
      version: emergencies.version,
      hasArea: sql<boolean>`${emergencies.area} is not null`,
      disasterTypeKey: emergencies.disasterTypeKey,
      disasterTypeName: disasterTypes.name,
      // Drizzle renders columns unqualified inside sql``, so the outer reference is spelled out.
      workTypeCount: sql<number>`(select count(*)::int from ${workTypes} where ${workTypes.emergencyId} = "emergencies"."id")`,
      supplyTypeCount: sql<number>`(select count(*)::int from ${supplyTypes} where ${supplyTypes.emergencyId} = "emergencies"."id")`,
      settings: {
        version: emergencySettings.version,
        smsDailyCap: emergencySettings.smsDailyCap,
        whatsappDailyCap: emergencySettings.whatsappDailyCap,
        neighborReserve: emergencySettings.neighborReserve,
        claimHoldMinutes: emergencySettings.claimHoldMinutes,
        staleAfterHours: emergencySettings.staleAfterHours,
        officialContact: emergencySettings.officialContact,
        officialSurveyName: emergencySettings.officialSurveyName,
        emergencyNumbers: emergencySettings.emergencyNumbers,
      },
      noticeId: emergencyNotices.id,
      noticeMessage: emergencyNotices.message,
      noticePublishedAt: emergencyNotices.publishedAt,
    })
    .from(emergencies)
    .innerJoin(disasterTypes, eq(disasterTypes.key, emergencies.disasterTypeKey))
    .innerJoin(emergencySettings, eq(emergencySettings.emergencyId, emergencies.id))
    .leftJoin(
      emergencyNotices,
      and(eq(emergencyNotices.emergencyId, emergencies.id), isNull(emergencyNotices.withdrawnAt)),
    )
    .where(eq(emergencies.slug, slug));
  if (!row) return null;
  const { noticeId, noticeMessage, noticePublishedAt, ...emergency } = row;
  return {
    ...emergency,
    notice:
      noticeId && noticeMessage && noticePublishedAt
        ? { id: noticeId, message: noticeMessage, publishedAt: noticePublishedAt }
        : null,
  };
}

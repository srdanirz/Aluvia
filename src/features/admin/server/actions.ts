"use server";

import { updateTag } from "next/cache";
import type { z } from "zod";

import { OPEN_EMERGENCIES_TAG } from "@/features/emergencies/server";
import { trackServerEvent } from "@/shared/analytics/server";
import { db } from "@/shared/db/client";
import { meter } from "@/shared/observability/metrics";

import type { Result } from "../result";
import {
  closeEmergencySchema,
  disasterTypeSchema,
  disasterTypeUpdateSchema,
  emergencyAreaSchema,
  emergencySchema,
  emergencySettingsSchema,
  fieldErrorsOf,
  noticeSchema,
  noticeWithdrawalSchema,
  officialLayerSchema,
} from "../schemas";
import { createDisasterType, updateDisasterType } from "./disaster-types";
import { closeEmergency, createEmergency, updateEmergencyArea, updateEmergencySettings } from "./emergencies";
import { publishNotice, withdrawNotice } from "./notices";
import { importOfficialLayer } from "./official-import";
import { findPlatformAdminId } from "./policy";

// One counter for every admin action, labeled by action and outcome code: low cardinality.
const adminActions = meter.createCounter("aluvia.admin.actions", {
  description: "Admin Server Actions by action and result",
  unit: "{action}",
});

/**
 * The admin's Server Actions. Each one checks the policy, parses its input at the boundary and
 * calls the operation of the same name, which owns the transaction and the admin_events entry.
 * After a commit it sends its product event (ADR 0008). They take a plain object (not FormData)
 * because the forms hold lists, like a work template.
 */
async function run<S extends z.ZodType, T>(
  action: string,
  schema: S,
  input: unknown,
  operation: (actorId: string, data: z.output<S>) => Promise<Result<T>>,
  track: (data: z.output<S>, result: T, actorId: string) => unknown,
): Promise<Result<T>> {
  const actorId = await findPlatformAdminId();
  if (!actorId) {
    adminActions.add(1, { action, result: "forbidden" });
    return { ok: false, code: "forbidden" };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    adminActions.add(1, { action, result: "invalid_input" });
    return { ok: false, code: "invalid_input", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  let result: Result<T>;
  try {
    result = await operation(actorId, parsed.data);
  } catch (error) {
    // Unexpected failures are the ones worth seeing; Next logs the error itself.
    adminActions.add(1, { action, result: "error" });
    throw error;
  }
  adminActions.add(1, { action, result: result.ok ? "ok" : result.code });
  if (result.ok) track(parsed.data, result.data, actorId);
  return result;
}

export async function createDisasterTypeAction(input: unknown) {
  return run(
    "create_disaster_type",
    disasterTypeSchema,
    input,
    (actorId, data) => createDisasterType(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent(
        "disaster_type_created",
        {
          disasterTypeKey: data.key,
          workTypeCount: data.workTypes.length,
          supplyTypeCount: data.supplyTypes.length,
        },
        { distinctId },
      ),
  );
}

export async function updateDisasterTypeAction(input: unknown) {
  return run(
    "update_disaster_type",
    disasterTypeUpdateSchema,
    input,
    (actorId, data) => updateDisasterType(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent(
        "disaster_type_updated",
        {
          disasterTypeKey: data.key,
          workTypeCount: data.workTypes.length,
          supplyTypeCount: data.supplyTypes.length,
        },
        { distinctId },
      ),
  );
}

export async function createEmergencyAction(input: unknown) {
  const result = await run(
    "create_emergency",
    emergencySchema,
    input,
    (actorId, data) => createEmergency(db, actorId, data),
    // A retry of an emergency already created answers ok without a second event.
    (data, result, distinctId) =>
      result.created &&
      trackServerEvent(
        "emergency_created",
        { emergencyId: data.id, disasterTypeKey: data.disasterTypeKey, hasArea: data.area !== null },
        { distinctId },
      ),
  );
  // The home redirects to the only open emergency; a new one changes where it sends people.
  if (result.ok) updateTag(OPEN_EMERGENCIES_TAG);
  return result;
}

export async function updateEmergencySettingsAction(input: unknown) {
  return run(
    "update_emergency_settings",
    emergencySettingsSchema,
    input,
    (actorId, data) => updateEmergencySettings(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent("emergency_settings_updated", { emergencyId: data.emergencyId }, { distinctId }),
  );
}

export async function updateEmergencyAreaAction(input: unknown) {
  return run(
    "update_emergency_area",
    emergencyAreaSchema,
    input,
    (actorId, data) => updateEmergencyArea(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent("emergency_area_updated", { emergencyId: data.emergencyId }, { distinctId }),
  );
}

export async function closeEmergencyAction(input: unknown) {
  const result = await run(
    "close_emergency",
    closeEmergencySchema,
    input,
    (actorId, data) => closeEmergency(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent("emergency_closed", { emergencyId: data.emergencyId }, { distinctId }),
  );
  if (result.ok) updateTag(OPEN_EMERGENCIES_TAG);
  return result;
}

export async function publishNoticeAction(input: unknown) {
  return run(
    "publish_notice",
    noticeSchema,
    input,
    (actorId, data) => publishNotice(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent(
        "emergency_notice_published",
        { emergencyId: data.emergencyId, replaced: data.replacesId !== null },
        { distinctId },
      ),
  );
}

export async function withdrawNoticeAction(input: unknown) {
  return run(
    "withdraw_notice",
    noticeWithdrawalSchema,
    input,
    (actorId, data) => withdrawNotice(db, actorId, data),
    (data, _, distinctId) =>
      trackServerEvent("emergency_notice_withdrawn", { emergencyId: data.emergencyId }, { distinctId }),
  );
}

export async function importOfficialLayerAction(input: unknown) {
  return run(
    "import_official_layer",
    officialLayerSchema,
    input,
    (actorId, data) => importOfficialLayer(db, actorId, data),
    (data, summary, distinctId) =>
      trackServerEvent(
        "official_layer_imported",
        { emergencyId: data.emergencyId, kind: data.kind, ...summary },
        { distinctId },
      ),
  );
}

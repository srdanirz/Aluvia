"use server";

import type { z } from "zod";

import { db } from "@/shared/db/client";

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
} from "../schemas";
import { createDisasterType, updateDisasterType } from "./disaster-types";
import { closeEmergency, createEmergency, updateEmergencyArea, updateEmergencySettings } from "./emergencies";
import { publishNotice, withdrawNotice } from "./notices";
import { findPlatformAdminId } from "./policy";

/**
 * The admin's Server Actions. Each one checks the policy, parses its input at the boundary and
 * calls the operation of the same name, which owns the transaction and the admin_events entry.
 * They take a plain object (not FormData) because the forms hold lists, like a work template.
 */
async function run<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  operation: (actorId: string, data: z.output<S>) => Promise<Result<T>>,
): Promise<Result<T>> {
  const actorId = await findPlatformAdminId();
  if (!actorId) return { ok: false, code: "forbidden" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input", fieldErrors: fieldErrorsOf(parsed.error) };
  // TODO(#23): trackServerEvent after an ok result, once the events catalog is on main.
  return operation(actorId, parsed.data);
}

export async function createDisasterTypeAction(input: unknown) {
  return run(disasterTypeSchema, input, (actorId, data) => createDisasterType(db, actorId, data));
}

export async function updateDisasterTypeAction(input: unknown) {
  return run(disasterTypeUpdateSchema, input, (actorId, data) => updateDisasterType(db, actorId, data));
}

export async function createEmergencyAction(input: unknown) {
  return run(emergencySchema, input, (actorId, data) => createEmergency(db, actorId, data));
}

export async function updateEmergencySettingsAction(input: unknown) {
  return run(emergencySettingsSchema, input, (actorId, data) => updateEmergencySettings(db, actorId, data));
}

export async function updateEmergencyAreaAction(input: unknown) {
  return run(emergencyAreaSchema, input, (actorId, data) => updateEmergencyArea(db, actorId, data));
}

export async function closeEmergencyAction(input: unknown) {
  return run(closeEmergencySchema, input, (actorId, data) => closeEmergency(db, actorId, data));
}

export async function publishNoticeAction(input: unknown) {
  return run(noticeSchema, input, (actorId, data) => publishNotice(db, actorId, data));
}

export async function withdrawNoticeAction(input: unknown) {
  return run(noticeWithdrawalSchema, input, (actorId, data) => withdrawNotice(db, actorId, data));
}

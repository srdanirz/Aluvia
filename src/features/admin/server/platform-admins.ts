import { eq, sql } from "drizzle-orm";

import { adminEvents, users } from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";

export type GrantResult = { ok: true; userId: string } | { ok: false; code: "user_not_found" };

/**
 * Makes an existing person a platform admin and logs it, in one transaction. Used by
 * `pnpm admin:grant` for the first admin (ADR 0009), so the event has no actor. `identity` is
 * the person's E.164 phone or email; they must have signed in once, so this never creates people.
 */
export async function grantPlatformAdmin(db: Database, identity: string): Promise<GrantResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ platformRole: "admin" })
      // One identity, one column: phones are unique (the login identity, ADR 0013) and emails
      // are unique case-insensitively, so either names at most one person.
      .where(
        identity.startsWith("+")
          ? eq(users.phone, identity)
          : sql`lower(${users.email}) = lower(${identity})`,
      )
      .returning({ id: users.id });
    if (!user) return { ok: false, code: "user_not_found" };

    await tx
      .insert(adminEvents)
      .values({ action: "platform_role_granted", targetType: "user", targetId: user.id });
    return { ok: true, userId: user.id };
  });
}

import { and, eq, sql } from "drizzle-orm";

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
      // One identity, one column, and only when it names exactly one person: emails are unique
      // case-insensitively, phones are not unique in this schema, so a shared phone grants nobody.
      .where(
        identity.startsWith("+")
          ? and(
              eq(users.phone, identity),
              sql`(select count(*) from ${users} where ${users.phone} = ${identity}) = 1`,
            )
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

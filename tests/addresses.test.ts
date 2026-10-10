import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { findPublicWorksite } from "@/features/map/server/public-worksite";
import { readAndLogContact } from "@/features/worksites/server/contact-card";
import { contactViews, emergencies, worksiteContacts } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, createUsers, createWorksite, NOW } from "./work-items/fixtures";

const { db, close } = createTestDb();
afterAll(close);

describe("home addresses", () => {
  it("shows the street to everyone but never the number", async () => {
    const emergency = await createEmergency(db);
    const { worksiteId } = await createWorksite(db, emergency.id);
    await db.insert(worksiteContacts).values({ worksiteId, addressText: "CALLE INVENTADA 1234 DEPTO 5" });
    const [row] = await db
      .select({ slug: emergencies.slug })
      .from(emergencies)
      .where(eq(emergencies.id, emergency.id));

    const home = await findPublicWorksite({ slug: row!.slug, id: worksiteId, locale: "es", now: NOW }, db);
    expect(home?.street).toBe("Calle Inventada");
  });

  it("gives the full address to a coordinator and logs the view", async () => {
    const emergency = await createEmergency(db);
    const [viewer] = await createUsers(db, emergency.id, 1);
    const { worksiteId } = await createWorksite(db, emergency.id);
    await db.insert(worksiteContacts).values({ worksiteId, addressText: "Calle Inventada 1234" });

    const contact = await readAndLogContact(db, { emergencyId: emergency.id, worksiteId, viewerId: viewer! });
    expect(contact?.addressText).toBe("Calle Inventada 1234");
    const [logged] = await db
      .select({ n: count() })
      .from(contactViews)
      .where(eq(contactViews.worksiteId, worksiteId));
    expect(logged?.n).toBe(1);
  });
});

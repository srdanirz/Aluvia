// pnpm db:seed [--skip-layers]: loads the reviewed seeds of src/shared/db/seeds, then imports the
// public layers each seeded emergency declares (issue #44). Safe to run again; also run by the
// deploy after migrating. --skip-layers loads only the rows, without the network.
import { findSeededEmergencyIds, seedDatabase } from "@/shared/db/seeds";
import { EMERGENCIES } from "@/shared/db/seeds/emergencies";

import { connect } from "./connect.mjs";

const { db, close } = connect();
try {
  await seedDatabase(db);
  process.stdout.write("Seeds loaded.\n");

  if (!process.argv.includes("--skip-layers")) {
    // Imported after connect() so the app's db client sees DATABASE_URL from .env.local.
    const { importOfficialLayer } = await import("@/features/admin/server/official-import");
    const idBySlug = await findSeededEmergencyIds(db);
    const jobs = EMERGENCIES.flatMap((emergency) =>
      emergency.officialLayers.map((layer) => ({ slug: emergency.slug, layer })),
    );
    // One layer at a time: the area first, so imported homes are checked against it.
    let failed = false;
    await jobs.reduce(async (previous, { slug, layer }) => {
      await previous;
      const emergencyId = idBySlug.get(slug);
      if (!emergencyId) return;
      const result = await importOfficialLayer(db, null, { ...layer, emergencyId });
      if (result.ok) {
        const { featureCount, createdCount } = result.data;
        process.stdout.write(`${slug} ${layer.kind}: ${featureCount} read, ${createdCount} new.\n`);
      } else {
        failed = true;
        process.stderr.write(`${slug} ${layer.kind}: ${result.code}\n`);
      }
    }, Promise.resolve());
    if (failed) process.exitCode = 1;
  }
} finally {
  await close();
}

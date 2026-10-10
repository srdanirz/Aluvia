// pnpm db:geocode-backfill: places the homes reported with a written address before the server
// located addresses (ADR 0016), so they show on the map. Safe to run again; prints counts only,
// never an address. In production: `gcloud run jobs execute aluvia-task --args=db:geocode-backfill`.
import { connect } from "./connect.mjs";

const { db, close } = connect();
try {
  // Imported after connect() so the app's env sees DATABASE_URL from .env.local.
  const { backfillWorksiteLocations } = await import("@/features/worksites/server/geocode-backfill");
  const summary = await backfillWorksiteLocations(db);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!process.env.GOOGLE_MAPS_SERVER_KEY) {
    process.stderr.write("GOOGLE_MAPS_SERVER_KEY is not set: only official-parcel matches were placed.\n");
  }
} finally {
  await close();
}

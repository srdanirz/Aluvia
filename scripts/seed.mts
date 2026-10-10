// pnpm db:seed: loads the reviewed seeds of src/shared/db/seeds. Safe to run again.
import { seedDatabase } from "@/shared/db/seeds";

import { connect } from "./connect.mjs";

const { db, close } = connect();
try {
  await seedDatabase(db);
  process.stdout.write("Seeds loaded.\n");
} finally {
  await close();
}

// pnpm admin:grant <phone|email>: makes the first platform admin (ADR 0009). After that, admins
// grant the role to each other from the admin. Needs direct access to the database.
import { grantPlatformAdmin } from "@/features/admin/server/platform-admins";

import { connect } from "./connect.mjs";

const identity = process.argv[2]?.trim();
if (!identity) {
  process.stderr.write("Usage: pnpm admin:grant <phone in E.164 | email>\n");
  process.exit(1);
}

const { db, close } = connect();
try {
  const result = await grantPlatformAdmin(db, identity);
  if (result.ok) {
    process.stdout.write(`Platform admin granted to user ${result.userId}.\n`);
  } else {
    process.stderr.write("No user with that phone or email. They must sign in once first.\n");
    process.exitCode = 1;
  }
} finally {
  await close();
}

import { connection } from "next/server";

import { pingDatabase } from "@/shared/db/ping";

// Target of the uptime check (ADR 0008, 0012). It answers 200 only when the app can reach the
// database, so "up" means a neighbor's report would actually be saved. A failed ping throws on
// purpose: Next answers 500 and logs the cause, and onRequestError reports it.
export async function GET() {
  await connection();
  await pingDatabase();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

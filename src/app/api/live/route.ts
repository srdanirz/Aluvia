import { connection } from "next/server";

// Liveness probe for Cloud Run (ADR 0012): the process answers, nothing more. It never touches
// the database, so a database blip does not restart every instance; /api/health covers that.
export async function GET() {
  await connection();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

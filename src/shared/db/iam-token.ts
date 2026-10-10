const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
// Refresh ahead of expiry so a connection opened at the edge never carries a dead token.
const REFRESH_MARGIN_MS = 5 * 60_000;

type Fetch = typeof fetch;

/**
 * Returns a function that yields an OAuth access token for the runtime service account, used as
 * the Postgres password under Cloud SQL IAM authentication (ADR 0012). Only works on GCP, where
 * the metadata server exists. No server-only guard: one-off scripts (scripts/connect.mts) use it
 * too, and it holds nothing secret. Tokens are cached until close to expiry; concurrent callers share
 * one in-flight request.
 */
export function createIamTokenSource(fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  let cached: { token: string; refreshAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function load(): Promise<string> {
    const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) throw new Error(`metadata token request failed: ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
      throw new Error("metadata token response is malformed");
    }
    // The metadata server reports the time left; near expiry, refresh again in 30 s at most.
    const refreshAt = Math.max(now() + 30_000, now() + body.expires_in * 1000 - REFRESH_MARGIN_MS);
    cached = { token: body.access_token, refreshAt };
    return body.access_token;
  }

  return function getToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return Promise.resolve(cached.token);
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

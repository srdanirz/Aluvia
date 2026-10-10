import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { rateLimits } from "@/shared/db/schema";
import { clientIpKey, hitRateLimit } from "@/shared/rate-limit";

import { createTestDb } from "./setup/db";

const RACERS = 20;
const { db, close } = createTestDb({ connections: 10 });
afterAll(close);

const SECRET = "test-only-secret-that-is-at-least-32-chars";

describe("hitRateLimit", () => {
  it("lets exactly `limit` concurrent hits through", async () => {
    const key = "test:concurrent";
    const results = await Promise.all(
      Array.from({ length: RACERS }, () => hitRateLimit(db, { key, limit: 5, windowSeconds: 60 })),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    const [row] = await db.select({ hits: rateLimits.hits }).from(rateLimits).where(eq(rateLimits.key, key));
    expect(row?.hits).toBe(RACERS);
  });

  it("starts over once the window has passed", async () => {
    const key = "test:window";
    await hitRateLimit(db, { key, limit: 1, windowSeconds: 60 });
    expect(await hitRateLimit(db, { key, limit: 1, windowSeconds: 60 })).toBe(false);
    await db
      .update(rateLimits)
      .set({ windowStartedAt: sql`now() - interval '61 seconds'` })
      .where(eq(rateLimits.key, key));
    expect(await hitRateLimit(db, { key, limit: 1, windowSeconds: 60 })).toBe(true);
  });
});

describe("clientIpKey", () => {
  // Documentation addresses (RFC 5737), never a real client.
  const headers = (forwarded: string) => new Headers({ "x-forwarded-for": forwarded });

  it("reads the client the trusted proxies saw, ignoring what the client prepended", () => {
    const options = { secret: SECRET, trustedProxyHops: 1 };
    expect(clientIpKey(headers("198.51.100.7, 192.0.2.10"), options)).toBe(
      clientIpKey(headers("192.0.2.10"), options),
    );
    const behindBalancer = { secret: SECRET, trustedProxyHops: 2 };
    expect(clientIpKey(headers("6.6.6.6, 192.0.2.10, 203.0.113.1"), behindBalancer)).toBe(
      clientIpKey(headers("192.0.2.10"), options),
    );
  });

  it("never contains the address", () => {
    const key = clientIpKey(headers("192.0.2.10"), { secret: SECRET, trustedProxyHops: 1 });
    expect(key).not.toContain("192.0.2.10");
    expect(key).not.toBe(clientIpKey(headers("192.0.2.10"), { secret: `${SECRET}x`, trustedProxyHops: 1 }));
  });
});

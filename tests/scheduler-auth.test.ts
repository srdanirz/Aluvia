import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { isSchedulerRequest } from "@/shared/scheduler-auth";

const AUDIENCE = "https://aluvia.example.org/api/v1/notifications/dispatch";
const ACCOUNT = "scheduler@aluvia-test.iam.gserviceaccount.com";
const DEV_TOKEN = "d".repeat(40);

let keys: ReturnType<typeof createLocalJWKSet>;
let sign: (claims: Record<string, unknown>, audience?: string) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
  sign = (claims, audience = AUDIENCE) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
});

const request = (token: string) =>
  new Request(AUDIENCE, { method: "POST", headers: { authorization: `Bearer ${token}` } });
const production = {
  NODE_ENV: "production",
  SCHEDULER_SERVICE_ACCOUNT: ACCOUNT,
  SCHEDULER_DEV_TOKEN: DEV_TOKEN,
};

describe("scheduler requests", () => {
  it("accept Google's OIDC token for our scheduler and this endpoint", async () => {
    const token = await sign({ email: ACCOUNT, email_verified: true });
    expect(await isSchedulerRequest(request(token), AUDIENCE, { env: production, keys })).toBe(true);
  });

  it("reject another audience, another account or an unverified email", async () => {
    const cases = [
      await sign({ email: ACCOUNT, email_verified: true }, "https://aluvia.example.org/other"),
      await sign({ email: "someone@example.org", email_verified: true }),
      await sign({ email: ACCOUNT, email_verified: false }),
    ];
    const results = await Promise.all(
      cases.map((token) => isSchedulerRequest(request(token), AUDIENCE, { env: production, keys })),
    );
    expect(results).toEqual([false, false, false]);
  });

  it("take the dev token only outside production", async () => {
    expect(await isSchedulerRequest(request(DEV_TOKEN), AUDIENCE, { env: production, keys })).toBe(false);
    const development = { ...production, NODE_ENV: "development" };
    expect(await isSchedulerRequest(request(DEV_TOKEN), AUDIENCE, { env: development, keys })).toBe(true);
  });

  it("reject a request without a bearer", async () => {
    const bare = new Request(AUDIENCE, { method: "POST" });
    expect(await isSchedulerRequest(bare, AUDIENCE, { env: production, keys })).toBe(false);
  });
});

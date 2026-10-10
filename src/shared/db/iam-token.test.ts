import { describe, expect, it, vi } from "vitest";

import { createIamTokenSource } from "./iam-token";

function tokenResponse(token: string, expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }));
}

describe("createIamTokenSource", () => {
  it("asks the metadata server once and reuses the token until close to expiry", async () => {
    let clock = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("first"))
      .mockResolvedValueOnce(tokenResponse("second"));
    const getToken = createIamTokenSource(fetchMock, () => clock);

    expect(await Promise.all([getToken(), getToken()])).toEqual(["first", "first"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ "Metadata-Flavor": "Google" });

    clock = 54 * 60_000;
    expect(await getToken()).toBe("first");
    clock = 56 * 60_000;
    expect(await getToken()).toBe("second");
  });

  it("fails loudly and retries on the next call when the metadata server errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(tokenResponse("ok"));
    const getToken = createIamTokenSource(fetchMock);

    await expect(getToken()).rejects.toThrow("metadata token request failed: 500");
    expect(await getToken()).toBe("ok");
  });

  it("refuses a malformed metadata response instead of caching it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ expires_in: 3600 })))
      .mockResolvedValueOnce(tokenResponse("ok"));
    const getToken = createIamTokenSource(fetchMock);

    await expect(getToken()).rejects.toThrow("metadata token response is malformed");
    expect(await getToken()).toBe("ok");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createIamTokenSource } = await import("./iam-token");

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
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { firebaseRealtimeDb, runWithFirebaseToken } from "./firebase.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Firebase REST transaction", () => {
  it("uses ETags and retries a concurrent update instead of overwriting it", async () => {
    vi.stubEnv(
      "FIREBASE_DATABASE_URL",
      "https://example-default-rtdb.firebaseio.com"
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("1", { headers: { ETag: '"etag-1"' } })
      )
      .mockResolvedValueOnce(new Response("null", { status: 412 }))
      .mockResolvedValueOnce(
        new Response("2", { headers: { ETag: '"etag-2"' } })
      )
      .mockResolvedValueOnce(new Response("3"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWithFirebaseToken("firebase-id-token", () =>
      firebaseRealtimeDb()
        .ref("_meta/nextIds/invoices")
        .transaction(current => Number(current || 0) + 1)
    );

    expect(result.snapshot.val()).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "_meta/nextIds/invoices.json"
    );
    expect(fetchMock.mock.calls[0]?.[0]).toContain("auth=firebase-id-token");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Firebase-ETag": "true",
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "if-match": '"etag-1"',
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe("2");
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({
      "if-match": '"etag-2"',
    });
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe("3");
  });
});

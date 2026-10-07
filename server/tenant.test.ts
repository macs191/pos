import { describe, expect, it } from "vitest";
import { getTenantIdFromUser } from "./tenant.js";

describe("tenant context guard", () => {
  it("returns null for missing user and missing supermarketId without throwing", () => {
    expect(getTenantIdFromUser(null)).toBeNull();
    expect(getTenantIdFromUser(undefined)).toBeNull();
    expect(getTenantIdFromUser({ supermarketId: null })).toBeNull();
    expect(getTenantIdFromUser({})).toBeNull();
  });

  it("accepts only positive integer tenant IDs", () => {
    expect(getTenantIdFromUser({ supermarketId: 17 })).toBe(17);
    expect(getTenantIdFromUser({ supermarketId: "17" })).toBe(17);
    expect(getTenantIdFromUser({ supermarketId: 0 })).toBeNull();
    expect(getTenantIdFromUser({ supermarketId: -2 })).toBeNull();
    expect(getTenantIdFromUser({ supermarketId: "not-an-id" })).toBeNull();
  });
});

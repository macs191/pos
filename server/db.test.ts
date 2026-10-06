import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockGet } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("./firebase.js", () => ({
  firebaseRealtimeDb: () => ({
    ref: () => ({ get: mockGet, create: mockCreate }),
  }),
}));

import { createRecordIfMissing } from "./db.js";

describe("createRecordIfMissing", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGet.mockReset();
  });

  it("creates a missing record without first reading a path the user may not be allowed to read", async () => {
    const record = { id: 101, ownerUid: "owner-a" };
    mockCreate.mockResolvedValue(undefined);

    await expect(
      createRecordIfMissing("supermarkets", record)
    ).resolves.toEqual(record);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns an existing readable record after a create-only write is denied", async () => {
    const existing = { id: 101, ownerUid: "owner-a" };
    mockCreate.mockRejectedValue(new Error("FIREBASE_WRITE_FAILED:401"));
    mockGet.mockResolvedValue({ exists: () => true, val: () => existing });

    await expect(
      createRecordIfMissing("supermarkets", { id: 101 })
    ).resolves.toEqual(existing);

    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("preserves the write error when a conflicting record cannot be read", async () => {
    const writeError = new Error("FIREBASE_WRITE_FAILED:401");
    mockCreate.mockRejectedValue(writeError);
    mockGet.mockRejectedValue(new Error("FIREBASE_READ_FAILED:401"));

    await expect(
      createRecordIfMissing("supermarkets", { id: 101 })
    ).rejects.toBe(writeError);
  });
});

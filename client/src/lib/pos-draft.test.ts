import { describe, expect, it } from "vitest";
import { clearPosDraft, loadPosDraft, savePosDraft } from "./pos-draft";
import type { PosCartLine } from "@shared/pos";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const sample: PosCartLine = {
  id: "product-1",
  name: "مياه معدنية",
  barcode: "6221001",
  price: 12.5,
  qty: 2,
  unit: "قطعة",
};

describe("POS local drafts", () => {
  it("saves and restores a draft for the same user", () => {
    const storage = new MemoryStorage();
    expect(savePosDraft(storage, 7, [sample])).toBe(true);
    expect(loadPosDraft(storage, 7)).toEqual([sample]);
  });

  it("keeps drafts isolated by user", () => {
    const storage = new MemoryStorage();
    savePosDraft(storage, 7, [sample]);
    expect(loadPosDraft(storage, 8)).toEqual([]);
  });

  it("ignores malformed and invalid stored lines", () => {
    const storage = new MemoryStorage();
    storage.setItem("souqi:pos-draft:v1:7", JSON.stringify([sample, null, { ...sample, qty: -2 }]));
    expect(loadPosDraft(storage, 7)).toEqual([sample]);
    storage.setItem("souqi:pos-draft:v1:8", "not-json");
    expect(loadPosDraft(storage, 8)).toEqual([]);
  });

  it("clears only the selected user's draft", () => {
    const storage = new MemoryStorage();
    savePosDraft(storage, 7, [sample]);
    savePosDraft(storage, 8, [sample]);
    clearPosDraft(storage, 7);
    expect(loadPosDraft(storage, 7)).toEqual([]);
    expect(loadPosDraft(storage, 8)).toEqual([sample]);
  });
});

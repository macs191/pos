import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Firebase Realtime Database access policy", () => {
  it("denies all direct client reads and writes; server access uses Firebase Admin", () => {
    const rulesPath = new URL("../database.rules.json", import.meta.url);
    const rules = JSON.parse(readFileSync(rulesPath, "utf8")) as { rules: { ".read": boolean; ".write": boolean } };
    expect(rules.rules[".read"]).toBe(false);
    expect(rules.rules[".write"]).toBe(false);
  });
});

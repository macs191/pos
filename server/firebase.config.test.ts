import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Firebase Realtime Database access policy", () => {
  it("denies all direct client reads and writes; server access uses Firebase Admin", () => {
    const rulesPath = new URL("../database.rules.json", import.meta.url);
    const rules = JSON.parse(readFileSync(rulesPath, "utf8")) as { rules: { ".read": boolean; ".write": boolean } };
    expect(rules.rules[".read"]).toBe(false);
    expect(rules.rules[".write"]).toBe(false);
  });
});

describe("Firebase Admin runtime compatibility", () => {
  it("loads Firebase Auth when require(ESM) is disabled", () => {
    const result = spawnSync(
      process.execPath,
      ["--no-experimental-require-module", "-e", "require('firebase-admin/auth')"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type RuleNode = {
  ".read"?: string | boolean;
  ".write"?: string | boolean;
  ".validate"?: string | boolean;
  [key: string]: unknown;
};

const rulesPath = new URL("../database.rules.json", import.meta.url);
const rules = JSON.parse(readFileSync(rulesPath, "utf8")) as { rules: RuleNode };

describe("Firebase Realtime Database REST security rules", () => {
  it("deny unscoped root access by default", () => {
    expect(rules.rules[".read"]).toBe(false);
    expect(rules.rules[".write"]).toBe(false);
  });

  it("scope user lookup to the authenticated UID or the user's store", () => {
    const users = rules.rules.users as RuleNode;
    expect(users[".read"]).toContain("query.orderByChild === 'openId'");
    expect(users[".read"]).toContain("query.equalTo === auth.uid");
    expect(users[".read"]).toContain("query.orderByChild === 'supermarketId'");
    expect(users["$id"]).toBeDefined();
  });

  it("makes account-to-UID mapping self-writable only after a matching user record exists", () => {
    const mapping = rules.rules.usersByUid as RuleNode;
    const child = mapping["$uid"] as RuleNode;
    expect(child[".read"]).toContain("auth.uid === $uid");
    expect(child[".write"]).toContain("root.child('users').child(newData.val() + '').child('openId').val() === auth.uid");
  });

  it("allows authenticated shared-catalog reads but only create-only user submissions", () => {
    const catalog = rules.rules.catalogProducts as RuleNode;
    expect(catalog[".read"]).toBe("auth != null");
    const child = catalog["$barcode"] as RuleNode;
    expect(child[".write"]).toContain("!data.exists()");
    expect(child[".write"]).toContain("newData.child('createdByUid').val() === auth.uid");
  });

  it("scopes invoices and price requests by supermarket and reserves administration for seeded UIDs", () => {
    for (const tableName of ["invoices", "priceChangeRequests"]) {
      const table = rules.rules[tableName] as RuleNode;
      expect(table[".read"]).toContain("query.orderByChild === 'supermarketId'");
      expect((table["$id"] as RuleNode)[".write"]).toContain("adminUids");
    }
    expect((rules.rules.adminUids as RuleNode)["$uid"]).toBeDefined();
  });

  it("does not depend on Firebase Admin or a service-account secret", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies["firebase-admin"]).toBeUndefined();
    const firebaseSource = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8");
    expect(firebaseSource).not.toContain("firebase-admin");
    expect(firebaseSource).toContain("AsyncLocalStorage");
    expect(firebaseSource).toContain("accounts:lookup");
  });
});

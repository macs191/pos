import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { equalTo, get, orderByChild, query, ref, set, update } from "firebase/database";

const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const integrationDescribe = emulatorHost ? describe : describe.skip;
const rules = readFileSync(new URL("../database.rules.json", import.meta.url), "utf8");
let environment: RulesTestEnvironment;

async function createOwner(uid: string, storeId: number, branchId: number, userId: number) {
  const db = environment.authenticatedContext(uid).database();
  const timestamp = new Date().toISOString();
  await assertSucceeds(set(ref(db, `supermarkets/${storeId}`), {
    id: storeId, ownerUid: uid, name: `متجر ${uid}`, slug: `store-${uid}`,
    status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp,
  }));
  await assertSucceeds(set(ref(db, `branches/${branchId}`), {
    id: branchId, supermarketId: storeId, name: "الفرع الرئيسي", createdAt: timestamp,
  }));
  await assertSucceeds(set(ref(db, `subscriptions/${storeId}`), {
    id: storeId, supermarketId: storeId, planId: 0, status: "ACTIVE", paymentStatus: "UNPAID",
    startDate: timestamp, endDate: new Date(Date.now() + 86400000).toISOString(),
    endAt: Date.now() + 86400000, createdAt: timestamp, updatedAt: timestamp,
  }));
  await assertSucceeds(set(ref(db, `users/${userId}`), {
    id: userId, openId: uid, name: `مالك ${uid}`, email: null, loginMethod: "firebase",
    role: "OWNER", supermarketId: storeId, branchId, permissions: [], isActive: true,
    createdAt: timestamp, updatedAt: timestamp, lastSignedIn: timestamp,
  }));
  await assertSucceeds(set(ref(db, `usersByUid/${uid}`), userId));
  return db;
}

integrationDescribe("Firebase RTDB security rules integration", () => {
  beforeAll(async () => {
    const [host, rawPort] = (emulatorHost || "127.0.0.1:9000").split(":");
    environment = await initializeTestEnvironment({
      projectId: "demo-pos",
      database: { host, port: Number(rawPort || 9000), rules },
    });
  });

  afterEach(async () => environment.clearDatabase());
  afterAll(async () => environment?.cleanup());

  it("allows scoped owner onboarding but denies a forged free subscription term", async () => {
    const db = environment.authenticatedContext("owner-a").database();
    const now = Date.now();
    await assertFails(get(ref(db, "supermarkets/11")));
    await assertFails(get(ref(environment.unauthenticatedContext().database(), "catalogProducts")));
    await assertSucceeds(set(ref(db, "supermarkets/11"), {
      id: 11, ownerUid: "owner-a", name: "المتجر", slug: "store-a", status: "ACTIVE",
    }));
    await assertFails(set(ref(db, "subscriptions/11"), {
      id: 11, supermarketId: 11, planId: 0, status: "ACTIVE", paymentStatus: "UNPAID",
      endAt: now + 60 * 86400000,
    }));
    const validDb = environment.authenticatedContext("owner-b").database();
    await assertSucceeds(set(ref(validDb, "supermarkets/12"), {
      id: 12, ownerUid: "owner-b", name: "المتجر ب", slug: "store-b", status: "ACTIVE",
    }));
    await createOwner("owner-c", 13, 23, 33);
    const owner = environment.authenticatedContext("owner-c").database();
    const ownUsers = query(ref(owner, "users"), orderByChild("openId"), equalTo("owner-c"));
    expect((await assertSucceeds(get(ownUsers))).size).toBe(1);
  });

  it("shares product reads globally while keeping product creation-only for ordinary users", async () => {
    const ownerA = await createOwner("owner-a", 11, 21, 31);
    const ownerB = await createOwner("owner-b", 12, 22, 32);
    const product = {
      id: "012345678905", barcode: "012345678905", name: "مياه", sellingPrice: 10,
      isActive: true, createdBy: 31, createdByUid: "owner-a",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await assertSucceeds(set(ref(ownerA, "catalogProducts/012345678905"), product));
    expect((await assertSucceeds(get(ref(ownerB, "catalogProducts/012345678905")))).val()).toMatchObject({ name: "مياه", sellingPrice: 10 });
    await assertFails(set(ref(ownerB, "catalogProducts/012345678905"), { ...product, sellingPrice: 11 }));
    await assertFails(set(ref(ownerB, "adminUids/owner-b"), true));

    await environment.withSecurityRulesDisabled(async context => {
      await set(ref(context.database(), "adminUids/site-admin"), true);
    });
    const admin = environment.authenticatedContext("site-admin").database();
    const moved = { ...product, id: "987654321098", barcode: "987654321098" };
    await assertSucceeds(update(ref(admin), {
      "catalogProducts/012345678905": null,
      "catalogProducts/987654321098": moved,
    }));
    expect((await assertSucceeds(get(ref(ownerB, "catalogProducts/987654321098")))).val()).toMatchObject({ barcode: "987654321098" });
  });

  it("keeps other employee accounts private from cashier-level members", async () => {
    const owner = await createOwner("owner-a", 11, 21, 31);
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.database();
      await set(ref(db, "users/32"), {
        id: 32, openId: "cashier-a", name: "كاشير", email: "cashier@example.test",
        role: "CASHIER", supermarketId: 11, branchId: 21, isActive: true,
      });
      await set(ref(db, "usersByUid/cashier-a"), 32);
    });
    const cashier = environment.authenticatedContext("cashier-a").database();
    await assertSucceeds(get(ref(cashier, "users/32")));
    await assertFails(get(ref(cashier, "users/31")));
    await assertFails(get(query(ref(cashier, "users"), orderByChild("supermarketId"), equalTo(11))));
    const marker = { supermarketId: 11, completed: true, completedByUid: "cashier-a", completedAt: new Date().toISOString() };
    await assertFails(set(ref(cashier, "legacyCatalogMigrations/11"), marker));
    await assertSucceeds(set(ref(owner, "legacyCatalogMigrations/11"), { ...marker, completedByUid: "owner-a" }));
  });

  it("isolates invoices and pending price requests to the owning store", async () => {
    const ownerA = await createOwner("owner-a", 11, 21, 31);
    const ownerB = await createOwner("owner-b", 12, 22, 32);
    const invoice = {
      id: 1001, supermarketId: 11, branchId: 21, cashierId: 31, invoiceNumber: "INV-1",
      subtotal: 10, discount: 0, tax: 0, total: 10, paymentMethod: "CASH", status: "PAID",
      createdAt: new Date().toISOString(),
    };
    await assertSucceeds(set(ref(ownerA, "invoices/1001"), invoice));
    await assertFails(get(ref(ownerB, "invoices/1001")));
    await assertFails(get(ref(ownerB, "invoices")));

    const request = {
      id: "request-1", productId: "012345678905", barcode: "012345678905", productName: "مياه",
      currentPrice: 10, proposedPrice: 12, submittedBy: 31, submittedByUid: "owner-a",
      submittedByName: "مالك", supermarketId: 11, status: "PENDING",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await assertSucceeds(set(ref(ownerA, "priceChangeRequests/request-1"), request));
    const ownRequests = query(ref(ownerA, "priceChangeRequests"), orderByChild("supermarketId"), equalTo(11));
    expect((await assertSucceeds(get(ownRequests))).size).toBe(1);
    const otherRequests = query(ref(ownerB, "priceChangeRequests"), orderByChild("supermarketId"), equalTo(11));
    await assertFails(get(otherRequests));
  });

  it("grants site-admin access only to UIDs seeded by the database owner", async () => {
    await createOwner("owner-a", 11, 21, 31);
    await environment.withSecurityRulesDisabled(async context => {
      await set(ref(context.database(), "adminUids/site-admin"), true);
    });
    const admin = environment.authenticatedContext("site-admin").database();
    expect((await assertSucceeds(get(ref(admin, "invoices")))).exists()).toBe(false);
    await assertSucceeds(set(ref(admin, "catalogProducts/012345678905"), {
      id: "012345678905", barcode: "012345678905", name: "مياه", sellingPrice: 12, isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }));
  });
});

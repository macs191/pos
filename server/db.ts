import { and, desc, eq, gte, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  branches,
  InsertUser,
  invoices,
  products,
  supermarkets,
  subscriptionPlans,
  subscriptions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function tenantSlug(name: string, openId: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${normalized || "market"}-${openId.slice(-8).toLowerCase()}`;
}

async function provisionTenantForUser(user: InsertUser) {
  const db = await getDb();
  if (!db) return;

  await db.transaction(async tx => {
    const tenantResult = await tx
      .insert(supermarkets)
      .values({
        name: `${user.name || "متجري"}`,
        slug: tenantSlug(user.name || "market", user.openId),
        phone: null,
        address: null,
      });
    const supermarketId = Number((tenantResult as any)[0]?.insertId ?? 0);
    if (!supermarketId) throw new Error("Tenant provisioning failed");

    const branchResult = await tx.insert(branches).values({
      supermarketId,
      name: "الفرع الرئيسي",
      address: null,
      phone: null,
    });
    const branchId = Number((branchResult as any)[0]?.insertId ?? 0);

    await tx.insert(users).values({
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.openId === ENV.ownerOpenId ? "SUPER_ADMIN" : "OWNER",
      supermarketId,
      branchId: branchId || null,
      permissions: [],
      lastSignedIn: user.lastSignedIn ?? new Date(),
    });

    const planResult = await tx.insert(subscriptionPlans).values({
      name: "مجاني",
      code: `FREE-${supermarketId}`,
      price: "0",
      durationDays: 36500,
      maxProducts: 250,
      maxUsers: 3,
      maxBranches: 1,
      maxInvoices: null,
      features: ["pos", "products", "invoices"],
    });
    const planId = Number((planResult as any)[0]?.insertId ?? 0);
    if (planId) {
      await tx.insert(subscriptions).values({
        supermarketId,
        planId,
        status: "ACTIVE",
        endDate: null,
      });
    }
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const existing = await getUserByOpenId(user.openId);
  if (!existing) {
    try {
      await provisionTenantForUser(user);
      return;
    } catch (error) {
      console.warn("[Database] Tenant provisioning race or failure, retrying user upsert", error);
    }
  }

  const updateSet: Record<string, unknown> = {
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "SUPER_ADMIN";
    updateSet.role = "SUPER_ADMIN";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getDashboardMetrics(supermarketId: number) {
  const db = await getDb();
  if (!db) return null;
  const [productCount, invoiceCount, sales, lowStock, recentInvoices] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.supermarketId, supermarketId)),
    db.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.supermarketId, supermarketId)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(eq(invoices.supermarketId, supermarketId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(and(eq(products.supermarketId, supermarketId), sql`${products.stockQuantity} <= ${products.minimumStock}`)),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.supermarketId, supermarketId))
      .orderBy(desc(invoices.createdAt))
      .limit(5),
  ]);
  return {
    products: Number(productCount[0]?.count ?? 0),
    invoices: Number(invoiceCount[0]?.count ?? 0),
    sales: Number(sales[0]?.total ?? 0),
    lowStock: Number(lowStock[0]?.count ?? 0),
    recentInvoices,
  };
}

export async function findProducts(supermarketId: number, search = "") {
  const db = await getDb();
  if (!db) return [];
  const term = `%${search.trim()}%`;
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.supermarketId, supermarketId),
        eq(products.isActive, true),
        search.trim()
          ? or(like(products.barcode, term), like(products.name, term), like(products.sku, term))
          : undefined,
      ),
    )
    .orderBy(desc(products.updatedAt))
    .limit(100);
}

export async function findProductByBarcode(supermarketId: number, barcode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(products)
    .where(and(eq(products.supermarketId, supermarketId), eq(products.barcode, barcode), eq(products.isActive, true)))
    .limit(1);
  return result[0];
}

export async function getTenantBranches(supermarketId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(branches).where(eq(branches.supermarketId, supermarketId)).orderBy(desc(branches.createdAt));
}

export async function getTenantById(supermarketId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(supermarkets).where(eq(supermarkets.id, supermarketId)).limit(1);
  return result[0];
}

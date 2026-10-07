import type { User } from "../drizzle/schema.js";
import { firebaseRealtimeDb } from "./firebase.js";
import { ENV } from "./_core/env.js";
import {
  applyApprovedPriceChange,
  buildGlobalProductRecord,
  createPriceChangeRequest,
  normalizeBarcode,
  productKeyForBarcode,
} from "./catalog.logic.js";

export const TRIAL_DAYS = 15;

type AnyRecord = Record<string, any>;

function nowIso() {
  return new Date().toISOString();
}
function asDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value || nowIso()));
}
function encodeKey(value: string) {
  return Buffer.from(value).toString("base64url");
}
function tablePath(table: string, id?: number | string) {
  return id === undefined ? table : `${table}/${id}`;
}

async function read<T>(path: string): Promise<T | null> {
  const snapshot = await firebaseRealtimeDb().ref(path).get();
  return snapshot.exists() ? (snapshot.val() as T) : null;
}

async function readTable<T extends AnyRecord>(table: string): Promise<T[]> {
  const value = await read<Record<string, T>>(table);
  return value ? Object.values(value) : [];
}

async function nextId(table: string) {
  const result = await firebaseRealtimeDb()
    .ref(`_meta/nextIds/${table}`)
    .transaction((current: unknown) => Number(current || 0) + 1);
  return Number(result.snapshot.val());
}

async function writeRecord(table: string, record: AnyRecord) {
  await firebaseRealtimeDb().ref(tablePath(table, record.id)).set(record);
  return record;
}

function userDates(user: AnyRecord): User {
  return {
    ...user,
    createdAt: asDate(user.createdAt),
    updatedAt: asDate(user.updatedAt),
    lastSignedIn: asDate(user.lastSignedIn),
  } as User;
}

function withDates<T extends AnyRecord>(record: T | null): AnyRecord | null {
  if (!record) return null;
  return {
    ...record,
    createdAt: asDate(record.createdAt),
    updatedAt: asDate(record.updatedAt),
  } as AnyRecord;
}

function tenantSlug(name: string, openId: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${normalized || "market"}-${openId.slice(-8).toLowerCase()}`;
}

async function createTenantBundle(name: string, openId: string) {
  const supermarketId = await nextId("supermarkets");
  const branchId = await nextId("branches");
  const planId = await nextId("subscriptionPlans");
  const subscriptionId = await nextId("subscriptions");
  const timestamp = nowIso();
  const tenant = {
    id: supermarketId,
    name,
    slug: tenantSlug(name, openId),
    phone: null,
    address: null,
    status: "ACTIVE",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const branch = {
    id: branchId,
    supermarketId,
    name: "الفرع الرئيسي",
    address: null,
    phone: null,
    status: "ACTIVE",
    createdAt: timestamp,
  };
  const plan = {
    id: planId,
    name: "مجاني",
    code: `FREE-${supermarketId}`,
    price: 0,
    durationDays: TRIAL_DAYS,
    maxProducts: null,
    maxUsers: 3,
    maxBranches: 1,
    maxInvoices: null,
    features: ["pos", "catalog", "invoices"],
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const subscription = {
    id: subscriptionId,
    supermarketId,
    planId,
    status: "ACTIVE",
    isPaid: false,
    startDate: timestamp,
    endDate: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    supermarketId,
    branchId,
    subscriptionId,
    writes: {
      [tablePath("supermarkets", supermarketId)]: tenant,
      [tablePath("branches", branchId)]: branch,
      [tablePath("subscriptionPlans", planId)]: plan,
      [tablePath("subscriptions", subscriptionId)]: subscription,
    },
  };
}

async function isPlatformAdmin(openId: string, email?: string | null) {
  if (
    (ENV.ownerOpenId && openId === ENV.ownerOpenId) ||
    (ENV.ownerEmail && email?.toLowerCase() === ENV.ownerEmail.toLowerCase())
  )
    return true;
  return (await read<boolean>(`adminUids/${openId}`)) === true;
}

export async function getDb() {
  firebaseRealtimeDb();
  return { provider: "firebase" as const };
}

export async function upsertUser(
  input: Partial<User> & {
    openId: string;
    name?: string | null;
    email?: string | null;
    loginMethod?: string | null;
  }
) {
  const existing = await getUserByOpenId(input.openId);
  const isSuperAdmin = await isPlatformAdmin(
    input.openId,
    input.email ?? existing?.email ?? null
  );

  if (existing) {
    const updated: AnyRecord = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      loginMethod: input.loginMethod ?? existing.loginMethod,
      role: isSuperAdmin ? "SUPER_ADMIN" : existing.role,
      lastSignedIn: nowIso(),
      updatedAt: nowIso(),
    };
    const writes: Record<string, unknown> = {};
    let supermarketId = Number(existing.supermarketId);
    let branchId = existing.branchId == null ? null : Number(existing.branchId);
    let subscriptionId: number | null = null;

    if (!Number.isSafeInteger(supermarketId) || supermarketId <= 0) {
      const bundle = await createTenantBundle(
        String(updated.name || "متجري"),
        input.openId
      );
      Object.assign(writes, bundle.writes);
      supermarketId = bundle.supermarketId;
      branchId = bundle.branchId;
      subscriptionId = bundle.subscriptionId;
      updated.supermarketId = supermarketId;
      updated.branchId = branchId;
    }

    const storedUser: AnyRecord = {
      ...updated,
      supermarketId,
      branchId,
      createdAt: existing.createdAt.toISOString(),
      lastSignedIn: updated.lastSignedIn,
      updatedAt: updated.updatedAt,
    };
    writes[tablePath("users", existing.id)] = storedUser;
    const oldProfile =
      (await read<AnyRecord>(tablePath("profiles", input.openId))) ?? {};
    writes[tablePath("profiles", input.openId)] = {
      ...oldProfile,
      id: input.openId,
      uid: input.openId,
      email: storedUser.email ?? null,
      name: storedUser.name ?? null,
      supermarketId,
      subscriptionId: subscriptionId ?? oldProfile.subscriptionId ?? null,
      updatedAt: updated.updatedAt,
    };
    await firebaseRealtimeDb().ref().update(writes);
    return userDates(storedUser);
  }

  const userId = await nextId("users");
  const timestamp = nowIso();
  const name = input.name || "متجري";
  const bundle = await createTenantBundle(name, input.openId);
  const user = {
    id: userId,
    openId: input.openId,
    name: input.name ?? null,
    email: input.email ?? null,
    loginMethod: input.loginMethod ?? "firebase",
    role: isSuperAdmin ? "SUPER_ADMIN" : "OWNER",
    supermarketId: bundle.supermarketId,
    branchId: bundle.branchId,
    permissions: [],
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSignedIn: timestamp,
  };
  const writes: Record<string, unknown> = { ...bundle.writes };
  writes[tablePath("users", userId)] = user;
  writes[`usersByOpenId/${encodeKey(input.openId)}`] = userId;
  writes[tablePath("profiles", input.openId)] = {
    id: input.openId,
    uid: input.openId,
    email: user.email,
    name: user.name,
    supermarketId: bundle.supermarketId,
    subscriptionId: bundle.subscriptionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await firebaseRealtimeDb().ref().update(writes);
  return userDates(user);
}

export async function getUserByOpenId(
  openId: string
): Promise<User | undefined> {
  const id = await read<number>(`usersByOpenId/${encodeKey(openId)}`);
  if (id === null) return undefined;
  const user = await read<AnyRecord>(tablePath("users", id));
  return user ? userDates(user) : undefined;
}

export async function getTenantById(
  supermarketId: number
): Promise<AnyRecord | null> {
  return withDates(
    await read<AnyRecord>(tablePath("supermarkets", supermarketId))
  );
}
export async function getTenantBranches(supermarketId: number) {
  return (await readTable<AnyRecord>("branches"))
    .filter(row => Number(row.supermarketId) === supermarketId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

let catalogMigrationInFlight: Promise<void> | null = null;

async function ensureGlobalCatalogMigration() {
  const marker = await read<AnyRecord>("_meta/globalCatalogMigrationV1");
  if (marker?.completed === true) return;
  if (catalogMigrationInFlight) return catalogMigrationInFlight;

  catalogMigrationInFlight = (async () => {
    const legacyProducts = await readTable<AnyRecord>("products");
    const globalProducts =
      (await read<Record<string, AnyRecord>>("globalProducts")) ?? {};
    const writes: Record<string, unknown> = {};
    const seen = new Set(Object.keys(globalProducts));
    legacyProducts.sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || "")
      )
    );

    for (const legacy of legacyProducts) {
      const barcode = normalizeBarcode(legacy.barcode);
      const name = String(legacy.name ?? "").trim();
      const sellingPrice = Number(legacy.sellingPrice);
      if (
        !barcode ||
        name.length < 2 ||
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
      )
        continue;
      const key = productKeyForBarcode(barcode);
      if (seen.has(key)) continue;
      const createdAt = String(legacy.createdAt || nowIso());
      const updatedAt = String(legacy.updatedAt || createdAt);
      const product = buildGlobalProductRecord({
        id: key,
        barcode,
        name,
        sellingPrice,
        createdByUserId: legacy.createdByUserId ?? null,
        createdByStoreId: legacy.supermarketId ?? null,
        createdAt,
        updatedAt,
        isActive: legacy.isActive !== false,
      });
      writes[tablePath("globalProducts", key)] = product;
      seen.add(key);
    }

    const paths = Object.keys(writes);
    for (let offset = 0; offset < paths.length; offset += 200) {
      const batch: Record<string, unknown> = {};
      for (const path of paths.slice(offset, offset + 200))
        batch[path] = writes[path];
      await firebaseRealtimeDb().ref().update(batch);
    }
    await firebaseRealtimeDb().ref("_meta/globalCatalogMigrationV1").set({
      completed: true,
      migratedProducts: paths.length,
      completedAt: nowIso(),
    });
  })();

  try {
    await catalogMigrationInFlight;
  } finally {
    catalogMigrationInFlight = null;
  }
}

export async function findProducts(search = ""): Promise<any[]> {
  await ensureGlobalCatalogMigration();
  const term = search.trim().toLowerCase();
  return (await readTable<AnyRecord>("globalProducts"))
    .filter(
      row =>
        row.isActive !== false &&
        (!term ||
          [row.name, row.barcode].some(value =>
            String(value || "")
              .toLowerCase()
              .includes(term)
          ))
    )
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 200);
}

export async function findProductByBarcode(
  barcode: string
): Promise<any | undefined> {
  await ensureGlobalCatalogMigration();
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return undefined;
  const product = await read<AnyRecord>(
    tablePath("globalProducts", productKeyForBarcode(normalized))
  );
  return product && product.isActive !== false ? product : undefined;
}

export async function findProductsByName(name: string): Promise<any[]> {
  return (await findProducts(name)).slice(0, 5);
}

export async function createProduct(
  input: { name: string; barcode: string; sellingPrice: number },
  user: User
) {
  await ensureGlobalCatalogMigration();
  const barcode = normalizeBarcode(input.barcode);
  const id = productKeyForBarcode(barcode);
  const timestamp = nowIso();
  const product = buildGlobalProductRecord({
    id,
    barcode,
    name: input.name.trim(),
    sellingPrice: Number(input.sellingPrice),
    createdByUserId: user.id,
    createdByStoreId: user.supermarketId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  let duplicateBarcode = false;
  await firebaseRealtimeDb()
    .ref(tablePath("globalProducts", id))
    .transaction(current => {
      if (current !== null && current !== undefined) {
        duplicateBarcode = true;
        return current;
      }
      return product;
    });
  if (duplicateBarcode) throw new Error("DUPLICATE_BARCODE");
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb()
    .ref()
    .update({
      [tablePath("auditLogs", auditId)]: {
        id: auditId,
        supermarketId: user.supermarketId ?? null,
        userId: user.id,
        action: "catalog.product.create",
        entity: "globalProduct",
        entityId: id,
        metadata: { barcode },
        createdAt: timestamp,
      },
    });
  return { id, success: true };
}

export async function submitPriceChangeRequest(
  barcode: string,
  requestedPrice: number,
  user: User
) {
  const product = await findProductByBarcode(barcode);
  if (!product) throw new Error("NOT_FOUND");
  const pending = (await readTable<AnyRecord>("priceChangeRequests")).find(
    row => row.barcode === product.barcode && row.status === "PENDING"
  );
  if (pending) throw new Error("PRICE_CHANGE_PENDING");
  const store = user.supermarketId
    ? await getTenantById(user.supermarketId)
    : null;
  const timestamp = nowIso();
  const id = `pcr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const request = createPriceChangeRequest({
    id,
    product: {
      id: String(product.id),
      barcode: String(product.barcode),
      name: String(product.name),
      sellingPrice: Number(product.sellingPrice),
    },
    requestedPrice,
    requestedByUserId: user.id,
    requestedByName: user.name ?? user.email ?? "مستخدم",
    requestedByStoreId: user.supermarketId ?? null,
    requestedByStoreName: store?.name ?? "متجر غير محدد",
    createdAt: timestamp,
  });
  const pendingPath = tablePath(
    "pendingPriceChangeByBarcode",
    productKeyForBarcode(product.barcode)
  );
  const claim = await firebaseRealtimeDb()
    .ref(pendingPath)
    .transaction(current => current ?? id);
  if (claim.snapshot.val() !== id) throw new Error("PRICE_CHANGE_PENDING");
  try {
    await writeRecord("priceChangeRequests", request);
  } catch (error) {
    await firebaseRealtimeDb()
      .ref(pendingPath)
      .transaction(current => (current === id ? null : current));
    throw error;
  }
  return { id, success: true };
}

export async function listPriceChangeRequests() {
  return (await readTable<AnyRecord>("priceChangeRequests"))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 1000);
}

export async function resolvePriceChangeRequest(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  reviewerId: number
) {
  const requestPath = tablePath("priceChangeRequests", requestId);
  const processingToken = `review_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const claim = await firebaseRealtimeDb()
    .ref(requestPath)
    .transaction(current => {
      if (!current || typeof current !== "object") return current;
      const record = current as AnyRecord;
      if (record.status !== "PENDING") return current;
      return { ...record, status: "PROCESSING", processingToken };
    });
  const claimed = claim.snapshot.val() as AnyRecord | null;
  if (!claimed) throw new Error("NOT_FOUND");
  if (claimed.processingToken !== processingToken)
    throw new Error("REQUEST_ALREADY_RESOLVED");

  const request: AnyRecord = { ...claimed, status: "PENDING" };
  try {
    const timestamp = nowIso();
    const updatedRequest: AnyRecord = {
      ...claimed,
      status: decision,
      reviewedByUserId: reviewerId,
      reviewedAt: timestamp,
      updatedAt: timestamp,
    };
    delete updatedRequest.processingToken;
    const pendingPath = tablePath(
      "pendingPriceChangeByBarcode",
      productKeyForBarcode(String(request.barcode))
    );
    const writes: Record<string, unknown> = {
      [requestPath]: updatedRequest,
      [pendingPath]: null,
    };

    if (decision === "APPROVED") {
      const product = await read<AnyRecord>(
        tablePath(
          "globalProducts",
          productKeyForBarcode(String(request.barcode))
        )
      );
      if (!product) throw new Error("NOT_FOUND");
      const priceUpdate = applyApprovedPriceChange(
        { sellingPrice: Number(product.sellingPrice) },
        {
          status: String(request.status),
          currentPrice: Number(request.currentPrice),
          requestedPrice: Number(request.requestedPrice),
        },
        timestamp
      );
      writes[tablePath("globalProducts", product.id)] = {
        ...product,
        ...priceUpdate,
      };
    }

    const auditId = await nextId("auditLogs");
    writes[tablePath("auditLogs", auditId)] = {
      id: auditId,
      userId: reviewerId,
      action:
        decision === "APPROVED"
          ? "catalog.price.approve"
          : "catalog.price.reject",
      entity: "priceChangeRequest",
      entityId: requestId,
      metadata: {
        barcode: request.barcode,
        currentPrice: request.currentPrice,
        requestedPrice: request.requestedPrice,
      },
      createdAt: timestamp,
    };
    await firebaseRealtimeDb().ref().update(writes);
    return { id: requestId, status: decision };
  } catch (error) {
    await firebaseRealtimeDb()
      .ref(requestPath)
      .transaction(current => {
        if (!current || typeof current !== "object") return current;
        const record = current as AnyRecord;
        if (record.processingToken !== processingToken) return current;
        const restored: AnyRecord = { ...record, status: "PENDING" };
        delete restored.processingToken;
        return restored;
      })
      .catch(releaseError => {
        console.error(
          "Could not release price request review claim",
          releaseError
        );
      });
    throw error;
  }
}

export async function updateCatalogProduct(
  barcode: string,
  name: string,
  sellingPrice: number,
  userId: number
) {
  const normalized = normalizeBarcode(barcode);
  const key = productKeyForBarcode(normalized);
  const existing = await read<AnyRecord>(tablePath("globalProducts", key));
  if (!existing) throw new Error("NOT_FOUND");
  const timestamp = nowIso();
  const product = {
    ...existing,
    name: name.trim(),
    sellingPrice: Math.round(Number(sellingPrice) * 100) / 100,
    updatedAt: timestamp,
  };
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb()
    .ref()
    .update({
      [tablePath("globalProducts", key)]: product,
      [tablePath("auditLogs", auditId)]: {
        id: auditId,
        userId,
        action: "catalog.product.update",
        entity: "globalProduct",
        entityId: key,
        metadata: { barcode: normalized },
        createdAt: timestamp,
      },
    });
  return { id: key, success: true };
}

export async function getDashboardMetrics(supermarketId: number) {
  const [allProducts, allInvoices] = await Promise.all([
    findProducts(""),
    readTable<AnyRecord>("invoices"),
  ]);
  const tenantInvoices = allInvoices.filter(
    row => Number(row.supermarketId) === supermarketId
  );
  return {
    products: allProducts.length,
    invoices: tenantInvoices.length,
    sales: tenantInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0),
    recentInvoices: tenantInvoices
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5),
  };
}

export async function getTenantSubscription(supermarketId: number) {
  const subscriptions = (await readTable<AnyRecord>("subscriptions"))
    .filter(row => Number(row.supermarketId) === supermarketId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const subscription = subscriptions[0];
  if (!subscription) return null;
  const plan = await read<AnyRecord>(
    tablePath("subscriptionPlans", subscription.planId)
  );
  const effectiveEnd = asDate(
    subscription.endDate ||
      new Date(asDate(subscription.createdAt).getTime() + TRIAL_DAYS * 86400000)
  );
  return {
    subscription: withDates(subscription),
    plan: withDates(plan),
    effectiveEnd,
    isPaid: subscription.isPaid === true,
    isActive:
      subscription.status === "ACTIVE" && effectiveEnd.getTime() > Date.now(),
  };
}

export async function listInvoices(supermarketId: number, search = "") {
  const term = search.trim().toLowerCase();
  return (await readTable<AnyRecord>("invoices"))
    .filter(
      row =>
        Number(row.supermarketId) === supermarketId &&
        (!term || String(row.invoiceNumber).toLowerCase().includes(term))
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100);
}

export async function invoiceDetail(supermarketId: number, id: number) {
  const invoice = await read<AnyRecord>(tablePath("invoices", id));
  if (!invoice || Number(invoice.supermarketId) !== supermarketId) return null;
  const items = (await readTable<AnyRecord>("invoiceItems")).filter(
    row => Number(row.invoiceId) === id
  );
  return { invoice, items };
}

export async function createInvoice(
  supermarketId: number,
  user: User,
  input: AnyRecord
) {
  const lines: AnyRecord[] = [];
  for (const requested of input.items) {
    const productId = String(requested.productId);
    const product = await read<AnyRecord>(
      tablePath("globalProducts", productId)
    );
    if (!product || product.isActive === false)
      throw new Error("PRODUCT_NOT_FOUND");
    const quantity = Number(requested.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new Error("INVALID_QUANTITY");
    const unitPrice = Number(product.sellingPrice);
    lines.push({ product, quantity, unitPrice, total: unitPrice * quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const total = Math.max(
    0,
    subtotal - Number(input.discount || 0) + Number(input.tax || 0)
  );
  const invoiceId = await nextId("invoices");
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const timestamp = nowIso();
  const writes: Record<string, unknown> = {
    [tablePath("invoices", invoiceId)]: {
      id: invoiceId,
      supermarketId,
      branchId: user.branchId ?? null,
      cashierId: user.id,
      customerId: input.customerId ?? null,
      invoiceNumber,
      subtotal,
      discount: Number(input.discount || 0),
      tax: Number(input.tax || 0),
      total,
      paymentMethod: input.paymentMethod || "CASH",
      status: "PAID",
      createdAt: timestamp,
    },
  };
  for (const line of lines) {
    const itemId = await nextId("invoiceItems");
    writes[tablePath("invoiceItems", itemId)] = {
      id: itemId,
      invoiceId,
      productId: line.product.id,
      productNameSnapshot: line.product.name,
      barcodeSnapshot: line.product.barcode,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      total: line.total,
    };
  }
  const auditId = await nextId("auditLogs");
  writes[tablePath("auditLogs", auditId)] = {
    id: auditId,
    supermarketId,
    userId: user.id,
    action: "invoice.create",
    entity: "invoice",
    entityId: String(invoiceId),
    metadata: { invoiceNumber, total },
    createdAt: timestamp,
  };
  await firebaseRealtimeDb().ref().update(writes);
  return { success: true, invoiceId, invoiceNumber, total };
}

export async function updateStore(
  supermarketId: number,
  input: AnyRecord,
  userId: number
): Promise<any> {
  const store = await read<AnyRecord>(tablePath("supermarkets", supermarketId));
  if (!store) throw new Error("NOT_FOUND");
  const updated: AnyRecord = {
    ...store,
    ...input,
    updatedAt: nowIso(),
    updatedByUserId: userId,
  };
  await writeRecord("supermarkets", updated);
  return updated;
}

export async function listUsers(supermarketId?: number) {
  const rows = await readTable<AnyRecord>("users");
  return rows
    .filter(
      row =>
        supermarketId === undefined ||
        Number(row.supermarketId) === supermarketId
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 500);
}

export async function listAllProducts() {
  await ensureGlobalCatalogMigration();
  return (await readTable<AnyRecord>("globalProducts"))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 2000);
}

export async function listAllCategories() {
  return (await readTable<AnyRecord>("categories"))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 1000);
}
export async function listAllInvoices() {
  return (await readTable<AnyRecord>("invoices"))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 1000);
}
export async function listPlans() {
  return (await readTable<AnyRecord>("subscriptionPlans"))
    .filter(row => row.isActive !== false)
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
}
export async function listAccounts() {
  const stores = await readTable<AnyRecord>("supermarkets");
  return Promise.all(
    stores.map(async store => ({
      store,
      access: await getTenantSubscription(Number(store.id)),
    }))
  );
}

export async function globalMetrics() {
  const [stores, users, products, invoices, accounts, requests] =
    await Promise.all([
      readTable<AnyRecord>("supermarkets"),
      readTable<AnyRecord>("users"),
      listAllProducts(),
      readTable<AnyRecord>("invoices"),
      listAccounts(),
      readTable<AnyRecord>("priceChangeRequests"),
    ]);
  const latestSubscriptions = accounts
    .map(row => row.access?.subscription)
    .filter(Boolean) as AnyRecord[];
  return {
    supermarkets: stores.length,
    users: users.length,
    products: products.length,
    invoices: invoices.length,
    sales: invoices.reduce((sum, row) => sum + Number(row.total || 0), 0),
    paidSubscriptions: latestSubscriptions.filter(row => row.isPaid === true)
      .length,
    unpaidSubscriptions: latestSubscriptions.filter(row => row.isPaid !== true)
      .length,
    pendingPriceRequests: requests.filter(row => row.status === "PENDING")
      .length,
  };
}

export async function setUserRole(id: number, role: string) {
  const user = await read<AnyRecord>(tablePath("users", id));
  if (!user) throw new Error("NOT_FOUND");
  await firebaseRealtimeDb()
    .ref(tablePath("users", id))
    .set({ ...user, role, updatedAt: nowIso() });
  return { id, role };
}

export async function setUserActive(id: number, isActive: boolean) {
  const user = await read<AnyRecord>(tablePath("users", id));
  if (!user) throw new Error("NOT_FOUND");
  await firebaseRealtimeDb()
    .ref(tablePath("users", id))
    .set({ ...user, isActive, updatedAt: nowIso() });
  return { id, isActive };
}

export async function setSubscription(
  supermarketId: number,
  status: string,
  endDate: Date | null,
  isPaid?: boolean
) {
  const rows = (await readTable<AnyRecord>("subscriptions"))
    .filter(row => Number(row.supermarketId) === supermarketId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const current = rows[0];
  if (!current) throw new Error("NOT_FOUND");
  const updated: AnyRecord = {
    ...current,
    status,
    endDate: endDate?.toISOString() ?? null,
    isPaid: isPaid ?? current.isPaid === true,
    updatedAt: nowIso(),
  };
  await writeRecord("subscriptions", updated);
  return {
    id: Number(updated.id),
    status: String(updated.status),
    isPaid: updated.isPaid,
    endDate: updated.endDate ? new Date(updated.endDate) : null,
  };
}

export async function setProductActive(barcode: string, isActive: boolean) {
  const key = productKeyForBarcode(barcode);
  const product = await read<AnyRecord>(tablePath("globalProducts", key));
  if (!product) throw new Error("NOT_FOUND");
  await firebaseRealtimeDb()
    .ref(tablePath("globalProducts", key))
    .set({ ...product, isActive, updatedAt: nowIso() });
  return { id: key, isActive };
}

export async function setInvoiceStatus(id: number, status: string) {
  const invoice = await read<AnyRecord>(tablePath("invoices", id));
  if (!invoice) throw new Error("NOT_FOUND");
  await firebaseRealtimeDb()
    .ref(tablePath("invoices", id))
    .set({ ...invoice, status, updatedAt: nowIso() });
  return { id, status };
}

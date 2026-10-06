import { createHash, randomInt, randomUUID } from "node:crypto";
import type { User } from "../drizzle/schema.js";
import { firebaseRealtimeDb, type FirebaseQuery } from "./firebase.js";

export const TRIAL_DAYS = 15;

type AnyRecord = Record<string, any>;

function nowIso() { return new Date().toISOString(); }
function asDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const parsed = new Date(String(value || nowIso()));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
function encodeKey(value: string) { return Buffer.from(value).toString("base64url"); }
function tablePath(table: string, id?: number | string) { return id === undefined ? table : `${table}/${id}`; }

async function read<T>(path: string, query?: FirebaseQuery): Promise<T | null> {
  const snapshot = await firebaseRealtimeDb().ref(path).get(query);
  return snapshot.exists() ? snapshot.val() as T : null;
}

async function readTable<T extends AnyRecord>(table: string, query?: FirebaseQuery): Promise<T[]> {
  const value = await read<Record<string, T>>(table, query);
  return value ? Object.values(value) : [];
}

async function readTableByChild<T extends AnyRecord>(table: string, child: string, equalTo: string | number | boolean): Promise<T[]> {
  return readTable<T>(table, { orderByChild: child, equalTo });
}

async function nextId(_table: string) {
  // IDs are random and collision-checked by Firebase's create-only rules where possible.
  return randomInt(1, 2 ** 48);
}

function stableId(scope: string, uid: string) {
  const hex = createHash("sha256").update(`${scope}:${uid}`).digest("hex").slice(0, 12);
  return Number.parseInt(hex, 16) || 1;
}

async function writeRecord(table: string, record: AnyRecord) {
  await firebaseRealtimeDb().ref(tablePath(table, record.id)).set(record);
  return record;
}

export async function createRecordIfMissing(table: string, record: AnyRecord) {
  const path = tablePath(table, record.id);
  try {
    // A missing record may be unreadable under tenant-scoped RTDB rules.
    // Attempt a conditional create first, then read only after a conflict.
    await firebaseRealtimeDb().ref(path).create(record);
    return record;
  } catch (error) {
    if (!(error instanceof Error) || !/:(?:401|412)$/.test(error.message)) throw error;
    try {
      const current = await read<AnyRecord>(path);
      if (current) return current;
    } catch {
      // Keep the original write error; a denied read must not weaken access rules.
    }
    throw error;
  }
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
  return { ...record, createdAt: asDate(record.createdAt), updatedAt: asDate(record.updatedAt) } as AnyRecord;
}

function tenantSlug(name: string, openId: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `${normalized || "market"}-${openId.slice(-8).toLowerCase()}`;
}

export async function getDb() {
  // Compatibility guard for existing router boundaries; all persistence is Firebase.
  firebaseRealtimeDb();
  return { provider: "firebase" as const };
}

export async function upsertUser(input: Partial<User> & { openId: string; name?: string | null; email?: string | null; emailVerified?: boolean; loginMethod?: string | null }) {
  const uid = input.openId;
  const timestamp = nowIso();
  const isSiteAdmin = (await read<boolean>(`adminUids/${uid}`)) === true;
  let existing = await getUserByOpenId(uid);

  if (existing && existing.supermarketId != null) {
    const role = isSiteAdmin ? "SUPER_ADMIN" : existing.role === "SUPER_ADMIN" ? "OWNER" : existing.role;
    const updated = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      loginMethod: input.loginMethod ?? existing.loginMethod,
      role,
      lastSignedIn: timestamp,
      updatedAt: timestamp,
    };
    await writeRecord("users", { ...updated, createdAt: asDate(existing.createdAt).toISOString(), lastSignedIn: timestamp, updatedAt: timestamp });
    await firebaseRealtimeDb().ref(`usersByUid/${uid}`).set(existing.id);
    return userDates(updated);
  }

  if (existing && isSiteAdmin) {
    const updated = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      loginMethod: input.loginMethod ?? existing.loginMethod,
      role: "SUPER_ADMIN",
      lastSignedIn: timestamp,
      updatedAt: timestamp,
    };
    await writeRecord("users", { ...updated, createdAt: asDate(existing.createdAt).toISOString(), lastSignedIn: timestamp, updatedAt: timestamp });
    await firebaseRealtimeDb().ref(`usersByUid/${uid}`).set(existing.id);
    return userDates(updated);
  }

  const userId = existing?.id ?? stableId("user", uid);
  if (isSiteAdmin) {
    const user = {
      ...(existing || {}),
      id: userId,
      openId: uid,
      name: input.name ?? existing?.name ?? null,
      email: input.email ?? existing?.email ?? null,
      loginMethod: input.loginMethod ?? existing?.loginMethod ?? "firebase",
      role: "SUPER_ADMIN",
      supermarketId: null,
      branchId: null,
      permissions: existing?.permissions ?? [],
      isActive: existing?.isActive ?? true,
      createdAt: existing ? asDate(existing.createdAt).toISOString() : timestamp,
      updatedAt: timestamp,
      lastSignedIn: timestamp,
    };
    await writeRecord("users", user);
    await firebaseRealtimeDb().ref(`usersByUid/${uid}`).set(userId);
    return userDates(user);
  }

  const supermarketId = stableId("store", uid);
  const branchId = stableId("branch", uid);
  const storeName = input.name || existing?.name || "متجري";
  const tenant = {
    id: supermarketId, ownerUid: uid, name: storeName, slug: tenantSlug(storeName, uid),
    phone: null, address: null, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp,
  };
  const savedTenant = await createRecordIfMissing("supermarkets", tenant);
  if (savedTenant.ownerUid !== uid) throw new Error("TENANT_ID_COLLISION");

  const branch = { id: branchId, supermarketId, name: "الفرع الرئيسي", address: null, phone: null, status: "ACTIVE", createdAt: timestamp };
  await createRecordIfMissing("branches", branch);

  const subscription = {
    id: supermarketId, supermarketId, planId: 0, status: "ACTIVE", paymentStatus: "UNPAID",
    startDate: timestamp, endDate: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
    endAt: Date.now() + TRIAL_DAYS * 86400000, createdAt: timestamp, updatedAt: timestamp,
  };
  await createRecordIfMissing("subscriptions", subscription);

  const user = {
    ...(existing || {}),
    id: userId,
    openId: uid,
    name: input.name ?? existing?.name ?? null,
    email: input.email ?? existing?.email ?? null,
    loginMethod: input.loginMethod ?? existing?.loginMethod ?? "firebase",
    role: existing?.role === "SUPER_ADMIN" ? "OWNER" : existing?.role ?? "OWNER",
    supermarketId,
    branchId,
    permissions: existing?.permissions ?? [],
    isActive: existing?.isActive ?? true,
    createdAt: existing ? asDate(existing.createdAt).toISOString() : timestamp,
    updatedAt: timestamp,
    lastSignedIn: timestamp,
  };
  await writeRecord("users", user);
  await firebaseRealtimeDb().ref(`usersByUid/${uid}`).set(userId);
  return userDates(user);
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const id = await read<number>(`usersByUid/${openId}`);
  if (id !== null) {
    const user = await read<AnyRecord>(tablePath("users", id));
    if (user) return userDates(user);
  }
  const matches = await readTableByChild<AnyRecord>("users", "openId", openId);
  const user = matches.find(row => row.openId === openId);
  return user ? userDates(user) : undefined;
}

export async function getTenantById(supermarketId: number): Promise<AnyRecord | null> { return withDates(await read<AnyRecord>(tablePath("supermarkets", supermarketId))); }
export async function getTenantBranches(supermarketId: number) {
  return (await readTableByChild<AnyRecord>("branches", "supermarketId", supermarketId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function findProducts(supermarketId: number, search = ""): Promise<any[]> {
  const term = search.trim().toLowerCase();
  return (await readTableByChild<AnyRecord>("products", "supermarketId", supermarketId))
    .filter(row => row.isActive !== false && (!term || [row.name, row.barcode, row.sku].some(value => String(value || "").toLowerCase().includes(term))))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 100);
}
export async function findProductByBarcode(supermarketId: number, barcode: string): Promise<any | undefined> { return (await findProducts(supermarketId, barcode)).find(row => row.barcode === barcode); }
export async function findProductsByName(supermarketId: number, name: string): Promise<any[]> { return (await findProducts(supermarketId, name)).slice(0, 5); }

export type CatalogProduct = {
  id: string;
  barcode: string;
  name: string;
  sellingPrice: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: number;
};

function asCatalogProduct(record: AnyRecord): CatalogProduct {
  return {
    id: String(record.id), barcode: String(record.barcode || ""), name: String(record.name || ""),
    sellingPrice: Number(record.sellingPrice || 0), isActive: record.isActive !== false,
    createdAt: String(record.createdAt || nowIso()), updatedAt: String(record.updatedAt || record.createdAt || nowIso()),
    ...(record.createdBy ? { createdBy: Number(record.createdBy) } : {}),
  };
}

async function readCatalogProduct(id: string | number): Promise<CatalogProduct | null> {
  const stored = await read<AnyRecord>(tablePath("catalogProducts", String(id)));
  return stored ? asCatalogProduct(stored) : null;
}

export async function findCatalogProductByBarcode(barcode: string): Promise<CatalogProduct | undefined> {
  const normalized = barcode.trim();
  if (!normalized) return undefined;
  const direct = await readCatalogProduct(normalized);
  if (direct?.barcode === normalized && direct.isActive) return direct;

  const indexId = await read<string>(`catalogProductByBarcode/${encodeKey(normalized)}`);
  if (indexId) {
    const indexed = await readCatalogProduct(indexId);
    if (indexed?.barcode === normalized && indexed.isActive) return indexed;
  }
  const matches = (await readTable<AnyRecord>("catalogProducts"))
    .filter(row => String(row.barcode) === normalized)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const product = matches[0] ? asCatalogProduct(matches[0]) : undefined;
  return product?.isActive ? product : undefined;
}

export async function findCatalogProducts(search = "", includeInactive = false): Promise<CatalogProduct[]> {
  const term = search.trim().toLocaleLowerCase();
  const globalRows = await readTable<AnyRecord>("catalogProducts");
  return globalRows.map(asCatalogProduct)
    .filter(product => includeInactive || product.isActive)
    .filter(product => !term || [product.name, product.barcode].some(value => value.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export async function migrateTenantProductsToCatalog(user: User) {
  if (!user.supermarketId || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) return { migrated: 0 };
  const migrationPath = tablePath("legacyCatalogMigrations", user.supermarketId);
  const migration = await read<AnyRecord>(migrationPath);
  if (migration?.completed === true) return { migrated: 0 };
  const [legacyRows, catalogRows] = await Promise.all([
    readTableByChild<AnyRecord>("products", "supermarketId", user.supermarketId),
    readTable<AnyRecord>("catalogProducts"),
  ]);
  const knownBarcodes = new Set(catalogRows.map(row => String(row.barcode || "")));
  let migrated = 0;
  for (const legacy of legacyRows) {
    const barcode = String(legacy.barcode || "").trim();
    const name = String(legacy.name || "").trim();
    const price = Number(legacy.sellingPrice);
    if (legacy.isActive === false || name.length < 2 || !/^\d{3,80}$/.test(barcode) || !Number.isFinite(price) || price < 0 || knownBarcodes.has(barcode)) continue;
    const timestamp = nowIso();
    const product = {
      id: barcode, barcode, name, sellingPrice: price, isActive: true,
      createdAt: String(legacy.createdAt || timestamp), updatedAt: timestamp,
      createdBy: user.id, createdByUid: user.openId,
    };
    try {
      await firebaseRealtimeDb().ref(tablePath("catalogProducts", barcode)).create(product);
      knownBarcodes.add(barcode);
      migrated += 1;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.endsWith(":412")) throw error;
      knownBarcodes.add(barcode);
    }
  }
  const marker = {
    supermarketId: user.supermarketId, completed: true, completedByUid: user.openId,
    completedAt: nowIso(),
  };
  try {
    await firebaseRealtimeDb().ref(migrationPath).create(marker);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.endsWith(":412")) throw error;
    const racedMarker = await read<AnyRecord>(migrationPath);
    if (racedMarker?.completed !== true) throw error;
  }
  return { migrated };
}

export async function createCatalogProduct(input: { name: string; barcode: string; sellingPrice: number }, userId: number, userUid: string) {
  const name = input.name.trim();
  const barcode = input.barcode.trim();
  if (name.length < 2 || !/^\d{3,80}$/.test(barcode) || !Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) throw new Error("INVALID_PRODUCT_DATA");
  if ((await findCatalogProducts("", true)).some(product => product.barcode === barcode)) throw new Error("DUPLICATE_BARCODE");
  const timestamp = nowIso();
  const product: CatalogProduct & { createdByUid: string } = {
    id: barcode, barcode, name, sellingPrice: input.sellingPrice, isActive: true,
    createdAt: timestamp, updatedAt: timestamp, createdBy: userId, createdByUid: userUid,
  };
  try {
    await firebaseRealtimeDb().ref(tablePath("catalogProducts", barcode)).create(product);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith(":412")) throw new Error("DUPLICATE_BARCODE");
    throw error;
  }
  return product;
}

export async function submitPriceChange(input: { barcode: string; proposedPrice: number }, user: User) {
  if (!Number.isFinite(input.proposedPrice) || input.proposedPrice < 0) throw new Error("INVALID_PRODUCT_DATA");
  const product = await findCatalogProductByBarcode(input.barcode);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (Number(product.sellingPrice) === input.proposedPrice) throw new Error("PRICE_UNCHANGED");
  const id = randomUUID();
  const timestamp = nowIso();
  const request = {
    id, productId: product.id, barcode: product.barcode, productName: product.name,
    currentPrice: product.sellingPrice, proposedPrice: input.proposedPrice,
    submittedBy: user.id, submittedByUid: user.openId,
    submittedByName: user.name || user.email || "مستخدم",
    supermarketId: user.supermarketId ?? null,
    status: "PENDING", createdAt: timestamp, updatedAt: timestamp,
  };
  await createRecordIfMissing("priceChangeRequests", request);
  return request;
}

export async function listPriceChangeRequests(status = "PENDING", supermarketId?: number) {
  const rows = supermarketId === undefined
    ? await readTable<AnyRecord>("priceChangeRequests")
    : await readTableByChild<AnyRecord>("priceChangeRequests", "supermarketId", supermarketId);
  return rows
    .filter(row => !status || row.status === status)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function reviewPriceChangeRequest(id: string, status: "APPROVED" | "REJECTED", reviewerId: number) {
  const request = await read<AnyRecord>(tablePath("priceChangeRequests", id));
  if (!request) throw new Error("NOT_FOUND");
  if (request.status !== "PENDING") throw new Error("REQUEST_ALREADY_REVIEWED");
  const timestamp = nowIso();
  if (status === "APPROVED") {
    const product = await readCatalogProduct(String(request.productId));
    if (!product) throw new Error("NOT_FOUND");
    const updated = { ...product, sellingPrice: Number(request.proposedPrice), updatedAt: timestamp };
    await firebaseRealtimeDb().ref().update({
      [tablePath("catalogProducts", product.id)]: updated,
      [tablePath("priceChangeRequests", id)]: { ...request, status, reviewedBy: reviewerId, reviewedAt: timestamp, updatedAt: timestamp },
    });
  } else {
    await writeRecord("priceChangeRequests", { ...request, status, reviewedBy: reviewerId, reviewedAt: timestamp, updatedAt: timestamp });
  }
  return { id, status };
}

export async function updateCatalogProduct(input: { id: string; name: string; barcode: string; sellingPrice: number }, userId: number) {
  const existing = await read<AnyRecord>(tablePath("catalogProducts", input.id));
  if (!existing) throw new Error("NOT_FOUND");
  const name = input.name.trim();
  const barcode = input.barcode.trim();
  if (name.length < 2 || !/^\d{3,80}$/.test(barcode) || !Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) throw new Error("INVALID_PRODUCT_DATA");
  const allProducts = await findCatalogProducts("", true);
  const nextProductId = barcode !== String(existing.barcode) && String(existing.id) === String(existing.barcode) ? barcode : String(input.id);
  const collision = allProducts.find(product => product.id !== String(input.id) && (product.barcode === barcode || product.id === nextProductId));
  if (collision) throw new Error("DUPLICATE_BARCODE");
  const timestamp = nowIso();
  const updated = { ...existing, id: nextProductId, name, barcode, sellingPrice: input.sellingPrice, updatedAt: timestamp };
  const auditId = await nextId("auditLogs");
  const writes: Record<string, unknown> = {
    [tablePath("catalogProducts", nextProductId)]: updated,
    [tablePath("auditLogs", auditId)]: { id: auditId, userId, action: "catalog.product.update", entity: "catalogProduct", entityId: nextProductId, createdAt: timestamp },
  };
  if (nextProductId !== String(input.id)) writes[tablePath("catalogProducts", input.id)] = null;
  await firebaseRealtimeDb().ref().update(writes);
  return asCatalogProduct(updated);
}

export async function getDashboardMetrics(supermarketId: number) {
  const [allProducts, invoiceRows, pendingRequests] = await Promise.all([
    findCatalogProducts(""),
    readTableByChild<AnyRecord>("invoices", "supermarketId", supermarketId),
    listPriceChangeRequests("PENDING", supermarketId),
  ]);
  const paidInvoices = invoiceRows.filter(row => row.status !== "VOID" && row.status !== "REFUNDED");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayInvoices = paidInvoices.filter(row => new Date(row.createdAt).getTime() >= todayStart);
  return {
    products: allProducts.length,
    invoices: invoiceRows.length,
    sales: paidInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0),
    todaySales: todayInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0),
    pendingPriceChanges: pendingRequests.length,
    lowStock: 0,
    recentInvoices: invoiceRows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5),
  };
}

export async function getTenantSubscription(supermarketId: number) {
  const subscriptions = (await readTableByChild<AnyRecord>("subscriptions", "supermarketId", supermarketId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const subscription = subscriptions[0];
  if (!subscription) return null;
  const plan = await read<AnyRecord>(tablePath("subscriptionPlans", subscription.planId)) || (Number(subscription.planId) === 0 ? {
    id: 0, name: "مجاني", code: "FREE", price: 0, durationDays: TRIAL_DAYS,
    maxProducts: 250, maxUsers: 3, maxBranches: 1, features: ["pos", "products", "invoices"], isActive: true,
  } : null);
  const effectiveEnd = subscription.endAt != null
    ? asDate(Number(subscription.endAt))
    : asDate(subscription.endDate || new Date(asDate(subscription.createdAt).getTime() + TRIAL_DAYS * 86400000));
  const paymentValid = Number(plan?.price || 0) <= 0 || subscription.paymentStatus === "PAID";
  return { subscription: withDates(subscription), plan: withDates(plan), effectiveEnd, isActive: subscription.status === "ACTIVE" && effectiveEnd.getTime() > Date.now() && paymentValid };
}

export async function listInvoices(supermarketId: number, search = "") {
  const term = search.trim().toLowerCase();
  return (await readTableByChild<AnyRecord>("invoices", "supermarketId", supermarketId))
    .filter(row => !term || String(row.invoiceNumber).toLowerCase().includes(term))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100);
}
export async function invoiceDetail(supermarketId: number, id: number) {
  const invoice = await read<AnyRecord>(tablePath("invoices", id));
  if (!invoice || Number(invoice.supermarketId) !== supermarketId) return null;
  const items = (await readTableByChild<AnyRecord>("invoiceItems", "supermarketId", supermarketId))
    .filter(row => Number(row.invoiceId) === id);
  return { invoice, items };
}

export async function createInvoice(supermarketId: number, user: User, input: AnyRecord) {
  const grouped = new Map<string, number>();
  for (const requested of input.items as Array<{ productId: string | number; quantity: number }>) {
    const key = String(requested.productId);
    grouped.set(key, (grouped.get(key) || 0) + Number(requested.quantity));
  }
  const lines: AnyRecord[] = [];
  for (const [productId, quantity] of Array.from(grouped.entries())) {
    const product = await readCatalogProduct(productId);
    if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
    lines.push({ product, quantity, unitPrice: Number(product.sellingPrice), total: Number(product.sellingPrice) * quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const total = Math.max(0, subtotal - Number(input.discount || 0) + Number(input.tax || 0));
  const invoiceId = await nextId("invoices");
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const timestamp = nowIso();
  const writes: Record<string, unknown> = {
    [tablePath("invoices", invoiceId)]: {
      id: invoiceId, supermarketId, branchId: user.branchId ?? null, cashierId: user.id,
      customerId: input.customerId ?? null, invoiceNumber, subtotal,
      discount: Number(input.discount || 0), tax: Number(input.tax || 0), total,
      paymentMethod: input.paymentMethod || "CASH", status: "PAID", createdAt: timestamp,
    },
  };
  for (const line of lines) {
    const itemId = await nextId("invoiceItems");
    writes[tablePath("invoiceItems", itemId)] = {
      id: itemId, supermarketId, invoiceId, productId: line.product.id,
      productNameSnapshot: line.product.name, barcodeSnapshot: line.product.barcode,
      unitPrice: line.unitPrice, quantity: line.quantity, total: line.total,
    };
  }
  const auditId = await nextId("auditLogs");
  writes[tablePath("auditLogs", auditId)] = {
    id: auditId, supermarketId, userId: user.id, action: "invoice.create",
    entity: "invoice", entityId: String(invoiceId), metadata: { invoiceNumber, total }, createdAt: timestamp,
  };
  await firebaseRealtimeDb().ref().update(writes);
  return { success: true, invoiceId, invoiceNumber, total };
}

export async function updateStore(supermarketId: number, input: AnyRecord, _userId: number): Promise<any> {
  const store = await read<AnyRecord>(tablePath("supermarkets", supermarketId));
  if (!store) throw new Error("NOT_FOUND");
  const updated: AnyRecord = { ...store, ...input, updatedAt: nowIso() };
  await writeRecord("supermarkets", updated);
  return updated;
}
export async function listUsers(supermarketId?: number) {
  const rows = supermarketId === undefined
    ? await readTable<AnyRecord>("users")
    : await readTableByChild<AnyRecord>("users", "supermarketId", supermarketId);
  const filtered = rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return supermarketId === undefined ? filtered : filtered.slice(0, 500);
}

export async function listAllProducts() { return findCatalogProducts("", true); }
export async function listAllCategories() { return (await readTable<AnyRecord>("categories")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1000); }
export async function listAllInvoices() { return (await readTable<AnyRecord>("invoices")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
export async function listPlans() { return (await readTable<AnyRecord>("subscriptionPlans")).filter(row => row.isActive !== false).sort((a, b) => Number(a.price || 0) - Number(b.price || 0)); }
export async function upsertPlan(input: { id?: number; name: string; code: string; price: number; durationDays: number; maxProducts: number; maxUsers: number; maxBranches: number }) {
  const timestamp = nowIso();
  if (input.id) {
    const current = await read<AnyRecord>(tablePath("subscriptionPlans", input.id));
    if (!current) throw new Error("NOT_FOUND");
    const updated = { ...current, ...input, updatedAt: timestamp };
    await writeRecord("subscriptionPlans", updated);
    return updated;
  }
  const id = await nextId("subscriptionPlans");
  const plan = { ...input, id, features: ["pos", "products", "invoices"], isActive: true, createdAt: timestamp, updatedAt: timestamp };
  await writeRecord("subscriptionPlans", plan);
  return plan;
}
export async function listAccounts() { const stores = await readTable<AnyRecord>("supermarkets"); return Promise.all(stores.map(async store => ({ store, access: await getTenantSubscription(Number(store.id)) }))); }
export async function globalMetrics() {
  const [stores, users, products, invoices, subscriptions, requests] = await Promise.all([
    readTable<AnyRecord>("supermarkets"), readTable<AnyRecord>("users"), findCatalogProducts(""),
    readTable<AnyRecord>("invoices"), readTable<AnyRecord>("subscriptions"),
    listPriceChangeRequests("PENDING"),
  ]);
  const activePaidStoreIds = new Set(subscriptions.filter(subscription => {
    const end = subscription.endDate ? new Date(subscription.endDate).getTime() : Infinity;
    return subscription.status === "ACTIVE" && end > Date.now() && subscription.paymentStatus === "PAID";
  }).map(subscription => Number(subscription.supermarketId)));
  const paidSubscriptions = activePaidStoreIds.size;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const todayInvoices = invoices.filter(invoice => new Date(invoice.createdAt).getTime() >= dayStart);
  const monthInvoices = invoices.filter(invoice => new Date(invoice.createdAt).getTime() >= monthStart);
  const paidInvoices = invoices.filter(invoice => invoice.status !== "VOID" && invoice.status !== "REFUNDED");
  return {
    supermarkets: stores.length, users: users.length, products: products.length, invoices: invoices.length,
    sales: paidInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0),
    todaySales: todayInvoices.filter(row => row.status !== "VOID" && row.status !== "REFUNDED").reduce((sum, row) => sum + Number(row.total || 0), 0), todayInvoices: todayInvoices.length,
    monthSales: monthInvoices.filter(row => row.status !== "VOID" && row.status !== "REFUNDED").reduce((sum, row) => sum + Number(row.total || 0), 0), monthInvoices: monthInvoices.length,
    paidSubscriptions, unpaidSubscriptions: Math.max(0, stores.length - paidSubscriptions),
    pendingPriceChanges: requests.length,
  };
}
export async function setUserRole(id: number, role: string) { if (role === "SUPER_ADMIN") throw new Error("ADMIN_UID_REQUIRED"); const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, role, updatedAt: nowIso() }); return { id, role }; }
export async function updateUserDisplayName(id: number, name: string) {
  const user = await read<AnyRecord>(tablePath("users", id));
  if (!user) throw new Error("NOT_FOUND");
  const updatedAt = nowIso();
  const updated = { ...user, name: name.trim(), updatedAt };
  await firebaseRealtimeDb().ref(tablePath("users", id)).set(updated);
  return { id, name: updated.name };
}
export async function setUserActive(id: number, isActive: boolean) { const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, isActive, updatedAt: nowIso() }); return { id, isActive }; }
export async function setSubscription(supermarketId: number, status: string, endDate: Date | null) {
  const rows = await readTableByChild<AnyRecord>("subscriptions", "supermarketId", supermarketId);
  const current = rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!current) throw new Error("NOT_FOUND");
  const updated: AnyRecord = { ...current, status, endDate: endDate?.toISOString() ?? null, endAt: endDate?.getTime() ?? null, updatedAt: nowIso() };
  await writeRecord("subscriptions", updated);
  return { id: Number(updated.id), status: String(updated.status), endDate: updated.endDate ? new Date(updated.endDate) : null, paymentStatus: updated.paymentStatus || "UNPAID" };
}
export async function setSubscriptionPaymentStatus(supermarketId: number, paymentStatus: "PAID" | "UNPAID") {
  const rows = await readTableByChild<AnyRecord>("subscriptions", "supermarketId", supermarketId);
  const current = rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!current) throw new Error("NOT_FOUND");
  const updated = { ...current, paymentStatus, paidAt: paymentStatus === "PAID" ? nowIso() : null, updatedAt: nowIso() };
  await writeRecord("subscriptions", updated);
  return { supermarketId, paymentStatus };
}
export async function setProductActive(id: string | number, isActive: boolean) {
  const product = await read<AnyRecord>(tablePath("catalogProducts", String(id)));
  if (!product) throw new Error("NOT_FOUND");
  const updated = { ...product, isActive, updatedAt: nowIso() };
  await firebaseRealtimeDb().ref(tablePath("catalogProducts", String(product.id))).set(updated);
  return { id: String(product.id), isActive };
}
export async function setInvoiceStatus(id: number, status: string) { const invoice = await read<AnyRecord>(tablePath("invoices", id)); if (!invoice) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("invoices", id)).set({ ...invoice, status }); return { id, status }; }

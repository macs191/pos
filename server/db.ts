import { randomUUID } from "node:crypto";
import type { User } from "../drizzle/schema.js";
import { firebaseRealtimeDb } from "./firebase.js";
import { ENV } from "./_core/env.js";

export const TRIAL_DAYS = 15;

type AnyRecord = Record<string, any>;

function nowIso() { return new Date().toISOString(); }
function asDate(value: unknown) { return value instanceof Date ? value : new Date(String(value || nowIso())); }
function encodeKey(value: string) { return Buffer.from(value).toString("base64url"); }
function tablePath(table: string, id?: number | string) { return id === undefined ? table : `${table}/${id}`; }

async function read<T>(path: string): Promise<T | null> {
  const snapshot = await firebaseRealtimeDb().ref(path).get();
  return snapshot.exists() ? snapshot.val() as T : null;
}

async function readTable<T extends AnyRecord>(table: string): Promise<T[]> {
  const value = await read<Record<string, T>>(table);
  return value ? Object.values(value) : [];
}

async function nextId(table: string) {
  const result = await firebaseRealtimeDb().ref(`_meta/nextIds/${table}`).transaction((current: unknown) => Number(current || 0) + 1);
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
  const existing = await getUserByOpenId(input.openId);
  if (existing) {
    if (!existing.supermarketId) {
      const supermarketId = await nextId("supermarkets");
      const branchId = await nextId("branches");
      const planId = await nextId("subscriptionPlans");
      const subscriptionId = await nextId("subscriptions");
      const timestamp = nowIso();
      const name = input.name || existing.name || "متجري";
      const isSuperAdmin = input.openId === ENV.ownerOpenId || (Boolean(input.emailVerified) && input.email?.trim().toLowerCase() === ENV.ownerEmail.trim().toLowerCase());
      const tenant = { id: supermarketId, name, slug: tenantSlug(name, input.openId), phone: null, address: null, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
      const branch = { id: branchId, supermarketId, name: "الفرع الرئيسي", address: null, phone: null, status: "ACTIVE", createdAt: timestamp };
      const plan = { id: planId, name: "مجاني", code: `FREE-${supermarketId}`, price: 0, durationDays: 15, maxProducts: 250, maxUsers: 3, maxBranches: 1, maxInvoices: null, features: ["pos", "products", "invoices"], isActive: true, createdAt: timestamp, updatedAt: timestamp };
      const subscription = { id: subscriptionId, supermarketId, planId, status: "ACTIVE", paymentStatus: "UNPAID", startDate: timestamp, endDate: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(), createdAt: timestamp, updatedAt: timestamp };
      const repaired = { ...existing, name: input.name ?? existing.name, email: input.email ?? existing.email, role: isSuperAdmin ? "SUPER_ADMIN" : existing.role, supermarketId, branchId, updatedAt: timestamp, lastSignedIn: timestamp };
      const writes: Record<string, unknown> = {};
      for (const [table, record] of [["supermarkets", tenant], ["branches", branch], ["subscriptionPlans", plan], ["subscriptions", subscription], ["users", { ...repaired, createdAt: asDate(existing.createdAt).toISOString() }]] as const) writes[tablePath(table, record.id)] = record;
      writes[`usersByOpenId/${encodeKey(input.openId)}`] = repaired.id;
      await firebaseRealtimeDb().ref().update(writes);
      await writeRecord("profiles", { id: input.openId, uid: input.openId, email: repaired.email, name: repaired.name, supermarketId, subscriptionId, createdAt: asDate(existing.createdAt).toISOString(), updatedAt: timestamp });
      return userDates(repaired);
    }
    const isSuperAdmin = input.openId === ENV.ownerOpenId || (Boolean(input.emailVerified) && input.email?.trim().toLowerCase() === ENV.ownerEmail.trim().toLowerCase());
    const updated = { ...existing, name: input.name ?? existing.name, email: input.email ?? existing.email, loginMethod: input.loginMethod ?? existing.loginMethod, role: isSuperAdmin ? "SUPER_ADMIN" : existing.role, lastSignedIn: nowIso(), updatedAt: nowIso() };
    await writeRecord("users", { ...updated, createdAt: existing.createdAt.toISOString(), lastSignedIn: updated.lastSignedIn, updatedAt: updated.updatedAt });
    await writeRecord("profiles", { id: input.openId, uid: input.openId, email: updated.email, name: updated.name, supermarketId: updated.supermarketId, subscriptionId: null, updatedAt: updated.updatedAt });
    return userDates(updated);
  }

  const supermarketId = await nextId("supermarkets");
  const branchId = await nextId("branches");
  const userId = await nextId("users");
  const planId = await nextId("subscriptionPlans");
  const subscriptionId = await nextId("subscriptions");
  const timestamp = nowIso();
  const name = input.name || "متجري";
  const isSuperAdmin = input.openId === ENV.ownerOpenId || (Boolean(input.emailVerified) && input.email?.trim().toLowerCase() === ENV.ownerEmail.trim().toLowerCase());
  const tenant = { id: supermarketId, name, slug: tenantSlug(name, input.openId), phone: null, address: null, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
  const branch = { id: branchId, supermarketId, name: "الفرع الرئيسي", address: null, phone: null, status: "ACTIVE", createdAt: timestamp };
  const user = { id: userId, openId: input.openId, name: input.name ?? null, email: input.email ?? null, loginMethod: input.loginMethod ?? "firebase", role: isSuperAdmin ? "SUPER_ADMIN" : "OWNER", supermarketId, branchId, permissions: [], isActive: true, createdAt: timestamp, updatedAt: timestamp, lastSignedIn: timestamp };
  const plan = { id: planId, name: "مجاني", code: `FREE-${supermarketId}`, price: 0, durationDays: 15, maxProducts: 250, maxUsers: 3, maxBranches: 1, maxInvoices: null, features: ["pos", "products", "invoices"], isActive: true, createdAt: timestamp, updatedAt: timestamp };
  const subscription = { id: subscriptionId, supermarketId, planId, status: "ACTIVE", paymentStatus: "UNPAID", startDate: timestamp, endDate: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(), createdAt: timestamp, updatedAt: timestamp };
  const writes: Record<string, unknown> = {};
  for (const [table, record] of [["supermarkets", tenant], ["branches", branch], ["users", user], ["subscriptionPlans", plan], ["subscriptions", subscription]] as const) writes[tablePath(table, record.id)] = record;
  writes[`usersByOpenId/${encodeKey(input.openId)}`] = userId;
  await firebaseRealtimeDb().ref().update(writes);
  await writeRecord("profiles", { id: input.openId, uid: input.openId, email: user.email, name: user.name, supermarketId, subscriptionId, createdAt: timestamp, updatedAt: timestamp });
  return userDates(user);
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const id = await read<number>(`usersByOpenId/${encodeKey(openId)}`);
  if (id === null) return undefined;
  const user = await read<AnyRecord>(tablePath("users", id));
  return user ? userDates(user) : undefined;
}

export async function getTenantById(supermarketId: number): Promise<AnyRecord | null> { return withDates(await read<AnyRecord>(tablePath("supermarkets", supermarketId))); }
export async function getTenantBranches(supermarketId: number) { return (await readTable<AnyRecord>("branches")).filter(row => Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }

export async function findProducts(supermarketId: number, search = ""): Promise<any[]> {
  const term = search.trim().toLowerCase();
  return (await readTable<AnyRecord>("products"))
    .filter(row => Number(row.supermarketId) === supermarketId && row.isActive !== false && (!term || [row.name, row.barcode, row.sku].some(value => String(value || "").toLowerCase().includes(term))))
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
  if (stored) return asCatalogProduct(stored);
  const legacyId = Number(id);
  if (!Number.isInteger(legacyId) || legacyId <= 0) return null;
  const legacy = await read<AnyRecord>(tablePath("products", legacyId));
  return legacy && legacy.isActive !== false ? asCatalogProduct(legacy) : null;
}

async function ensureGlobalProduct(record: AnyRecord): Promise<CatalogProduct> {
  const barcodeKey = encodeKey(String(record.barcode));
  const id = randomUUID();
  const timestamp = nowIso();
  const product = asCatalogProduct({ id, barcode: record.barcode, name: record.name, sellingPrice: record.sellingPrice, isActive: record.isActive !== false, createdAt: record.createdAt || timestamp, updatedAt: timestamp, createdBy: record.createdBy });
  const indexRef = firebaseRealtimeDb().ref(`catalogProductByBarcode/${barcodeKey}`);
  const reservation = await indexRef.transaction(current => current == null ? id : undefined);
  if (!reservation.committed) {
    const indexedId = String(reservation.snapshot.val() || "");
    const existing = indexedId ? await read<AnyRecord>(tablePath("catalogProducts", indexedId)) : null;
    if (existing) return asCatalogProduct(existing);
    const repaired = await indexRef.transaction(current => current === indexedId ? id : undefined);
    if (!repaired.committed) {
      const racedProduct = await read<AnyRecord>(tablePath("catalogProducts", String(repaired.snapshot.val() || "")));
      if (racedProduct) return asCatalogProduct(racedProduct);
      throw new Error("DUPLICATE_BARCODE");
    }
  }
  await firebaseRealtimeDb().ref(tablePath("catalogProducts", id)).set(product);
  return product;
}

export async function findCatalogProductByBarcode(barcode: string): Promise<CatalogProduct | undefined> {
  const normalized = barcode.trim();
  if (!normalized) return undefined;
  const id = await read<string>(`catalogProductByBarcode/${encodeKey(normalized)}`);
  if (id) {
    const product = await readCatalogProduct(id);
    if (product) return product.isActive ? product : undefined;
  }
  const legacy = (await readTable<AnyRecord>("products"))
    .filter(row => row.barcode === normalized && row.isActive !== false)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!legacy) return undefined;
  return ensureGlobalProduct(legacy);
}

export async function findCatalogProducts(search = "", includeInactive = false): Promise<CatalogProduct[]> {
  const term = search.trim().toLocaleLowerCase();
  const [globalRows, legacyRows] = await Promise.all([readTable<AnyRecord>("catalogProducts"), readTable<AnyRecord>("products")]);
  const byBarcode = new Map<string, CatalogProduct>();
  for (const row of legacyRows) {
    const product = asCatalogProduct(row);
    const previous = byBarcode.get(product.barcode);
    if ((includeInactive || product.isActive) && (!previous || product.updatedAt > previous.updatedAt)) byBarcode.set(product.barcode, product);
  }
  for (const row of globalRows) {
    const product = asCatalogProduct(row);
    byBarcode.set(product.barcode, product);
  }
  return Array.from(byBarcode.values())
    .filter(product => includeInactive || product.isActive)
    .filter(product => !term || [product.name, product.barcode].some(value => value.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export async function createCatalogProduct(input: { name: string; barcode: string; sellingPrice: number }, userId: number) {
  const name = input.name.trim();
  const barcode = input.barcode.trim();
  if (name.length < 2 || barcode.length < 3 || !Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) throw new Error("INVALID_PRODUCT_DATA");
  if (await findCatalogProductByBarcode(barcode)) throw new Error("DUPLICATE_BARCODE");
  const id = randomUUID();
  const timestamp = nowIso();
  const product: CatalogProduct = { id, barcode, name, sellingPrice: input.sellingPrice, isActive: true, createdAt: timestamp, updatedAt: timestamp, createdBy: userId };
  const indexRef = firebaseRealtimeDb().ref(`catalogProductByBarcode/${encodeKey(barcode)}`);
  const reservation = await indexRef.transaction(current => current == null ? id : undefined);
  if (!reservation.committed) throw new Error("DUPLICATE_BARCODE");
  try {
    await firebaseRealtimeDb().ref(tablePath("catalogProducts", id)).set(product);
  } catch (error) {
    await indexRef.transaction(current => current === id ? null : undefined);
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
  const request = { id, productId: product.id, barcode: product.barcode, productName: product.name, currentPrice: product.sellingPrice, proposedPrice: input.proposedPrice, submittedBy: user.id, submittedByName: user.name || user.email || "مستخدم", supermarketId: user.supermarketId ?? null, status: "PENDING", createdAt: timestamp, updatedAt: timestamp };
  await writeRecord("priceChangeRequests", request);
  return request;
}

export async function listPriceChangeRequests(status = "PENDING") {
  return (await readTable<AnyRecord>("priceChangeRequests"))
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
  let existing = await read<AnyRecord>(tablePath("catalogProducts", input.id)).then(row => row ? asCatalogProduct(row) : null);
  if (!existing) {
    const legacyId = Number(input.id);
    const legacy = Number.isInteger(legacyId) ? await read<AnyRecord>(tablePath("products", legacyId)) : null;
    if (legacy) existing = await ensureGlobalProduct(legacy);
  }
  if (!existing) throw new Error("NOT_FOUND");
  const name = input.name.trim(); const barcode = input.barcode.trim();
  if (name.length < 2 || barcode.length < 3 || !Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) throw new Error("INVALID_PRODUCT_DATA");
  const collision = await read<string>(`catalogProductByBarcode/${encodeKey(barcode)}`);
  if (collision && collision !== existing.id) throw new Error("DUPLICATE_BARCODE");
  if (barcode !== existing.barcode) {
    const existingId = existing.id;
    const reservation = await firebaseRealtimeDb().ref(`catalogProductByBarcode/${encodeKey(barcode)}`).transaction(current => current == null || current === existingId ? existingId : undefined);
    if (!reservation.committed) throw new Error("DUPLICATE_BARCODE");
  }
  const timestamp = nowIso();
  const updated = { ...existing, name, barcode, sellingPrice: input.sellingPrice, updatedAt: timestamp };
  const writes: Record<string, unknown> = { [tablePath("catalogProducts", existing.id)]: updated };
  if (barcode !== existing.barcode) {
    writes[`catalogProductByBarcode/${encodeKey(existing.barcode)}`] = null;
    writes[`catalogProductByBarcode/${encodeKey(barcode)}`] = existing.id;
  }
  const auditId = await nextId("auditLogs");
  writes[tablePath("auditLogs", auditId)] = { id: auditId, userId, action: "catalog.product.update", entity: "catalogProduct", entityId: existing.id, createdAt: timestamp };
  await firebaseRealtimeDb().ref().update(writes);
  return updated;
}

export async function getDashboardMetrics(supermarketId: number) {
  const [allProducts, invoiceRows, pendingRequests] = await Promise.all([findCatalogProducts(""), readTable<AnyRecord>("invoices"), listPriceChangeRequests("PENDING")]);
  const allInvoices = invoiceRows.filter(row => Number(row.supermarketId) === supermarketId);
  const paidInvoices = allInvoices.filter(row => row.status !== "VOID" && row.status !== "REFUNDED");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayInvoices = paidInvoices.filter(row => new Date(row.createdAt).getTime() >= todayStart);
  return { products: allProducts.length, invoices: allInvoices.length, sales: paidInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0), todaySales: todayInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0), pendingPriceChanges: pendingRequests.length, lowStock: 0, recentInvoices: allInvoices.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5) };
}

export async function getTenantSubscription(supermarketId: number) {
  const subscriptions = (await readTable<AnyRecord>("subscriptions")).filter(row => Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const subscription = subscriptions[0];
  if (!subscription) return null;
  const plan = await read<AnyRecord>(tablePath("subscriptionPlans", subscription.planId));
  const effectiveEnd = asDate(subscription.endDate || new Date(asDate(subscription.createdAt).getTime() + TRIAL_DAYS * 86400000));
  const paymentValid = Number(plan?.price || 0) <= 0 || subscription.paymentStatus === "PAID";
  return { subscription: withDates(subscription), plan: withDates(plan), effectiveEnd, isActive: subscription.status === "ACTIVE" && effectiveEnd.getTime() > Date.now() && paymentValid };
}

export async function createProduct(supermarketId: number, input: AnyRecord, userId: number, branchId: number | null) {
  const barcode = String(input.barcode || "").trim();
  const name = String(input.name || "").trim();
  const sellingPrice = Number(input.sellingPrice);
  if (barcode.length < 3 || name.length < 2 || !Number.isFinite(sellingPrice)) throw new Error("INVALID_PRODUCT_DATA");
  const duplicate = await findProductByBarcode(supermarketId, barcode);
  if (duplicate) throw new Error("DUPLICATE_BARCODE");
  const id = await nextId("products"); const timestamp = nowIso();
  const product = { id, supermarketId, branchId: input.branchId ?? branchId, categoryId: input.categoryId ?? null, name, barcode, sku: input.sku ?? null, brand: input.brand ?? null, unit: input.unit || "قطعة", sellingPrice, costPrice: Number(input.costPrice || 0), stockQuantity: Number(input.stockQuantity || 0), minimumStock: Number(input.minimumStock || 5), description: input.description ?? null, isActive: true, createdAt: timestamp, updatedAt: timestamp };
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb().ref().update({ [tablePath("products", id)]: product, [tablePath("auditLogs", auditId)]: { id: auditId, supermarketId, userId, action: "product.create", entity: "product", entityId: String(id), metadata: { barcode: input.barcode }, createdAt: timestamp } });
  return { id, success: true };
}

export async function updateProduct(supermarketId: number, input: AnyRecord, userId: number, branchId: number | null) {
  const existing = await read<AnyRecord>(tablePath("products", input.id));
  if (!existing || Number(existing.supermarketId) !== supermarketId) throw new Error("NOT_FOUND");
  const barcode = String(input.barcode || "").trim();
  const name = String(input.name || "").trim();
  const sellingPrice = Number(input.sellingPrice);
  if (barcode.length < 3 || name.length < 2 || !Number.isFinite(sellingPrice)) throw new Error("INVALID_PRODUCT_DATA");
  const duplicate = await findProductByBarcode(supermarketId, barcode);
  if (duplicate && Number(duplicate.id) !== Number(input.id)) throw new Error("DUPLICATE_BARCODE");
  const product = { ...existing, ...input, name, barcode, branchId: input.branchId ?? branchId, categoryId: input.categoryId ?? null, costPrice: Number(input.costPrice || 0), sellingPrice, stockQuantity: Number(input.stockQuantity || 0), minimumStock: Number(input.minimumStock || 5), updatedAt: nowIso() };
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb().ref().update({ [tablePath("products", input.id)]: product, [tablePath("auditLogs", auditId)]: { id: auditId, supermarketId, userId, action: "product.update", entity: "product", entityId: String(input.id), metadata: { barcode: input.barcode }, createdAt: nowIso() } });
  return { success: true, id: input.id };
}

export async function updateProductPrice(supermarketId: number, id: number, sellingPrice: number, userId: number) { return updateProduct(supermarketId, { id, sellingPrice }, userId, null); }

export async function listInvoices(supermarketId: number, search = "") { const term = search.trim().toLowerCase(); return (await readTable<AnyRecord>("invoices")).filter(row => Number(row.supermarketId) === supermarketId && (!term || String(row.invoiceNumber).toLowerCase().includes(term))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100); }
export async function invoiceDetail(supermarketId: number, id: number) { const invoice = await read<AnyRecord>(tablePath("invoices", id)); if (!invoice || Number(invoice.supermarketId) !== supermarketId) return null; const items = (await readTable<AnyRecord>("invoiceItems")).filter(row => Number(row.invoiceId) === id); return { invoice, items }; }
export async function lowStock(supermarketId: number) { return (await readTable<AnyRecord>("products")).filter(row => Number(row.supermarketId) === supermarketId && Number(row.stockQuantity || 0) <= Number(row.minimumStock || 0)); }

export async function createInvoice(supermarketId: number, user: User, input: AnyRecord) {
  const grouped = new Map<string, number>();
  for (const requested of input.items as Array<{ productId: string | number; quantity: number }>) {
    const key = String(requested.productId);
    grouped.set(key, (grouped.get(key) || 0) + Number(requested.quantity));
  }
  const lines: AnyRecord[] = [];
  const groupedEntries = Array.from(grouped.entries());
  for (let index = 0; index < groupedEntries.length; index += 1) {
    const [productId, quantity] = groupedEntries[index];
    const product = await readCatalogProduct(productId);
    if (!product || !product.isActive) throw new Error("PRODUCT_NOT_FOUND");
    lines.push({ product, quantity, unitPrice: Number(product.sellingPrice), total: Number(product.sellingPrice) * quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0); const total = Math.max(0, subtotal - Number(input.discount || 0) + Number(input.tax || 0));
  const invoiceId = await nextId("invoices"); const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`; const timestamp = nowIso();
  const writes: Record<string, unknown> = { [tablePath("invoices", invoiceId)]: { id: invoiceId, supermarketId, branchId: user.branchId ?? null, cashierId: user.id, customerId: input.customerId ?? null, invoiceNumber, subtotal, discount: Number(input.discount || 0), tax: Number(input.tax || 0), total, paymentMethod: input.paymentMethod || "CASH", status: "PAID", createdAt: timestamp } };
  for (const line of lines) {
    const itemId = await nextId("invoiceItems");
    writes[tablePath("invoiceItems", itemId)] = { id: itemId, invoiceId, productId: line.product.id, productNameSnapshot: line.product.name, barcodeSnapshot: line.product.barcode, unitPrice: line.unitPrice, quantity: line.quantity, total: line.total };
  }
  const auditId = await nextId("auditLogs"); writes[tablePath("auditLogs", auditId)] = { id: auditId, supermarketId, userId: user.id, action: "invoice.create", entity: "invoice", entityId: String(invoiceId), metadata: { invoiceNumber, total }, createdAt: timestamp };
  await firebaseRealtimeDb().ref().update(writes);
  return { success: true, invoiceId, invoiceNumber, total };
}

export async function adjustInventory(supermarketId: number, user: User, input: AnyRecord) {
  const product = await read<AnyRecord>(tablePath("products", input.productId)); if (!product || Number(product.supermarketId) !== supermarketId) throw new Error("NOT_FOUND");
  const previous = Number(product.stockQuantity || 0); const next = previous + Number(input.quantity); if (next < 0) throw new Error("NEGATIVE_STOCK");
  const movementId = await nextId("inventoryMovements"); const timestamp = nowIso();
  await firebaseRealtimeDb().ref().update({ [tablePath("products", product.id)]: { ...product, stockQuantity: next, updatedAt: timestamp }, [tablePath("inventoryMovements", movementId)]: { id: movementId, supermarketId, branchId: user.branchId ?? null, productId: product.id, userId: user.id, type: Number(input.quantity) >= 0 ? "PURCHASE" : "ADJUSTMENT", quantity: Number(input.quantity), previousQuantity: previous, newQuantity: next, reason: input.reason, createdAt: timestamp } });
  return { success: true, stockQuantity: next };
}

export async function updateStore(supermarketId: number, input: AnyRecord, userId: number): Promise<any> { const store = await read<AnyRecord>(tablePath("supermarkets", supermarketId)); if (!store) throw new Error("NOT_FOUND"); const updated: AnyRecord = { ...store, ...input, updatedAt: nowIso() }; await writeRecord("supermarkets", updated); return updated; }
export async function listUsers(supermarketId?: number) { const rows = await readTable<AnyRecord>("users"); const filtered = rows.filter(row => supermarketId === undefined || Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); return supermarketId === undefined ? filtered : filtered.slice(0, 500); }
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
export async function setUserRole(id: number, role: string) { const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, role, updatedAt: nowIso() }); return { id, role }; }
export async function updateUserDisplayName(id: number, name: string) {
  const user = await read<AnyRecord>(tablePath("users", id));
  if (!user) throw new Error("NOT_FOUND");
  const updatedAt = nowIso();
  const updated = { ...user, name: name.trim(), updatedAt };
  const writes: Record<string, unknown> = { [tablePath("users", id)]: updated };
  writes[tablePath("profiles", user.openId)] = { id: user.openId, uid: user.openId, email: user.email ?? null, name: updated.name, supermarketId: user.supermarketId ?? null, updatedAt };
  await firebaseRealtimeDb().ref().update(writes);
  return { id, name: updated.name };
}
export async function setUserActive(id: number, isActive: boolean) { const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, isActive, updatedAt: nowIso() }); return { id, isActive }; }
export async function setSubscription(supermarketId: number, status: string, endDate: Date | null) { const rows = (await readTable<AnyRecord>("subscriptions")).filter(row => Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const current = rows[0]; if (!current) throw new Error("NOT_FOUND"); const updated: AnyRecord = { ...current, status, endDate: endDate?.toISOString() ?? null, updatedAt: nowIso() }; await writeRecord("subscriptions", updated); return { id: Number(updated.id), status: String(updated.status), endDate: updated.endDate ? new Date(updated.endDate) : null, paymentStatus: updated.paymentStatus || "UNPAID" }; }
export async function setSubscriptionPaymentStatus(supermarketId: number, paymentStatus: "PAID" | "UNPAID") {
  const rows = (await readTable<AnyRecord>("subscriptions")).filter(row => Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const current = rows[0];
  if (!current) throw new Error("NOT_FOUND");
  const updated = { ...current, paymentStatus, paidAt: paymentStatus === "PAID" ? nowIso() : null, updatedAt: nowIso() };
  await writeRecord("subscriptions", updated);
  return { supermarketId, paymentStatus };
}
export async function setProductActive(id: string | number, isActive: boolean) {
  let product = await read<AnyRecord>(tablePath("catalogProducts", String(id)));
  if (!product) {
    const legacyId = Number(id);
    const legacy = Number.isInteger(legacyId) ? await read<AnyRecord>(tablePath("products", legacyId)) : null;
    if (legacy) product = await ensureGlobalProduct(legacy);
  }
  if (!product) throw new Error("NOT_FOUND");
  const updated = { ...product, isActive, updatedAt: nowIso() };
  await firebaseRealtimeDb().ref(tablePath("catalogProducts", String(product.id))).set(updated);
  return { id: String(product.id), isActive };
}
export async function setInvoiceStatus(id: number, status: string) { const invoice = await read<AnyRecord>(tablePath("invoices", id)); if (!invoice) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("invoices", id)).set({ ...invoice, status }); return { id, status }; }

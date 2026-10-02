import type { User } from "../drizzle/schema";
import { firebaseRealtimeDb } from "./firebase";
import { ENV } from "./_core/env";

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

export async function upsertUser(input: Partial<User> & { openId: string; name?: string | null; email?: string | null; loginMethod?: string | null }) {
  const existing = await getUserByOpenId(input.openId);
  if (existing) {
    const updated = { ...existing, name: input.name ?? existing.name, email: input.email ?? existing.email, loginMethod: input.loginMethod ?? existing.loginMethod, lastSignedIn: nowIso(), updatedAt: nowIso() };
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
  const isSuperAdmin = input.openId === ENV.ownerOpenId || input.email === ENV.ownerEmail;
  const tenant = { id: supermarketId, name, slug: tenantSlug(name, input.openId), phone: null, address: null, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
  const branch = { id: branchId, supermarketId, name: "الفرع الرئيسي", address: null, phone: null, status: "ACTIVE", createdAt: timestamp };
  const user = { id: userId, openId: input.openId, name: input.name ?? null, email: input.email ?? null, loginMethod: input.loginMethod ?? "firebase", role: isSuperAdmin ? "SUPER_ADMIN" : "OWNER", supermarketId, branchId, permissions: [], isActive: true, createdAt: timestamp, updatedAt: timestamp, lastSignedIn: timestamp };
  const plan = { id: planId, name: "مجاني", code: `FREE-${supermarketId}`, price: 0, durationDays: 15, maxProducts: 250, maxUsers: 3, maxBranches: 1, maxInvoices: null, features: ["pos", "products", "invoices"], isActive: true, createdAt: timestamp, updatedAt: timestamp };
  const subscription = { id: subscriptionId, supermarketId, planId, status: "ACTIVE", startDate: timestamp, endDate: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(), createdAt: timestamp, updatedAt: timestamp };
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

export async function getDashboardMetrics(supermarketId: number) {
  const allProducts = (await readTable<AnyRecord>("products")).filter(row => Number(row.supermarketId) === supermarketId);
  const allInvoices = (await readTable<AnyRecord>("invoices")).filter(row => Number(row.supermarketId) === supermarketId);
  return { products: allProducts.length, invoices: allInvoices.length, sales: allInvoices.reduce((sum, row) => sum + Number(row.total || 0), 0), lowStock: allProducts.filter(row => Number(row.stockQuantity || 0) <= Number(row.minimumStock || 0)).length, recentInvoices: allInvoices.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5) };
}

export async function getTenantSubscription(supermarketId: number) {
  const subscriptions = (await readTable<AnyRecord>("subscriptions")).filter(row => Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const subscription = subscriptions[0];
  if (!subscription) return null;
  const plan = await read<AnyRecord>(tablePath("subscriptionPlans", subscription.planId));
  const effectiveEnd = asDate(subscription.endDate || new Date(asDate(subscription.createdAt).getTime() + TRIAL_DAYS * 86400000));
  return { subscription: withDates(subscription), plan: withDates(plan), effectiveEnd, isActive: subscription.status === "ACTIVE" && effectiveEnd.getTime() > Date.now() };
}

export async function createProduct(supermarketId: number, input: AnyRecord, userId: number, branchId: number | null) {
  const duplicate = await findProductByBarcode(supermarketId, input.barcode);
  if (duplicate) throw new Error("DUPLICATE_BARCODE");
  const id = await nextId("products"); const timestamp = nowIso();
  const product = { id, supermarketId, branchId: input.branchId ?? branchId, categoryId: input.categoryId ?? null, name: input.name, barcode: input.barcode, sku: input.sku ?? null, brand: input.brand ?? null, unit: input.unit || "قطعة", sellingPrice: Number(input.sellingPrice), costPrice: Number(input.costPrice || 0), stockQuantity: Number(input.stockQuantity || 0), minimumStock: Number(input.minimumStock || 5), description: input.description ?? null, isActive: true, createdAt: timestamp, updatedAt: timestamp };
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb().ref().update({ [tablePath("products", id)]: product, [tablePath("auditLogs", auditId)]: { id: auditId, supermarketId, userId, action: "product.create", entity: "product", entityId: String(id), metadata: { barcode: input.barcode }, createdAt: timestamp } });
  return { id, success: true };
}

export async function updateProduct(supermarketId: number, input: AnyRecord, userId: number, branchId: number | null) {
  const existing = await read<AnyRecord>(tablePath("products", input.id));
  if (!existing || Number(existing.supermarketId) !== supermarketId) throw new Error("NOT_FOUND");
  const duplicate = await findProductByBarcode(supermarketId, input.barcode);
  if (duplicate && Number(duplicate.id) !== Number(input.id)) throw new Error("DUPLICATE_BARCODE");
  const product = { ...existing, ...input, branchId: input.branchId ?? branchId, categoryId: input.categoryId ?? null, costPrice: Number(input.costPrice || 0), sellingPrice: Number(input.sellingPrice), stockQuantity: Number(input.stockQuantity || 0), minimumStock: Number(input.minimumStock || 5), updatedAt: nowIso() };
  const auditId = await nextId("auditLogs");
  await firebaseRealtimeDb().ref().update({ [tablePath("products", input.id)]: product, [tablePath("auditLogs", auditId)]: { id: auditId, supermarketId, userId, action: "product.update", entity: "product", entityId: String(input.id), metadata: { barcode: input.barcode }, createdAt: nowIso() } });
  return { success: true, id: input.id };
}

export async function updateProductPrice(supermarketId: number, id: number, sellingPrice: number, userId: number) { return updateProduct(supermarketId, { id, sellingPrice }, userId, null); }

export async function listInvoices(supermarketId: number, search = "") { const term = search.trim().toLowerCase(); return (await readTable<AnyRecord>("invoices")).filter(row => Number(row.supermarketId) === supermarketId && (!term || String(row.invoiceNumber).toLowerCase().includes(term))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100); }
export async function invoiceDetail(supermarketId: number, id: number) { const invoice = await read<AnyRecord>(tablePath("invoices", id)); if (!invoice || Number(invoice.supermarketId) !== supermarketId) return null; const items = (await readTable<AnyRecord>("invoiceItems")).filter(row => Number(row.invoiceId) === id); return { invoice, items }; }
export async function lowStock(supermarketId: number) { return (await readTable<AnyRecord>("products")).filter(row => Number(row.supermarketId) === supermarketId && Number(row.stockQuantity || 0) <= Number(row.minimumStock || 0)); }

export async function createInvoice(supermarketId: number, user: User, input: AnyRecord) {
  const lines: AnyRecord[] = [];
  for (const requested of input.items) {
    const product = await read<AnyRecord>(tablePath("products", requested.productId));
    if (!product || Number(product.supermarketId) !== supermarketId || product.isActive === false) throw new Error("PRODUCT_NOT_FOUND");
    const previous = Number(product.stockQuantity || 0); const quantity = Number(requested.quantity); const next = previous - quantity;
    if (next < 0) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
    lines.push({ product, previous, next, quantity, unitPrice: Number(product.sellingPrice), total: Number(product.sellingPrice) * quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0); const total = Math.max(0, subtotal - Number(input.discount || 0) + Number(input.tax || 0));
  const invoiceId = await nextId("invoices"); const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`; const timestamp = nowIso();
  const writes: Record<string, unknown> = { [tablePath("invoices", invoiceId)]: { id: invoiceId, supermarketId, branchId: user.branchId ?? null, cashierId: user.id, customerId: input.customerId ?? null, invoiceNumber, subtotal, discount: Number(input.discount || 0), tax: Number(input.tax || 0), total, paymentMethod: input.paymentMethod || "CASH", status: "PAID", createdAt: timestamp } };
  for (const line of lines) {
    const itemId = await nextId("invoiceItems"); const movementId = await nextId("inventoryMovements");
    writes[tablePath("invoiceItems", itemId)] = { id: itemId, invoiceId, productId: line.product.id, productNameSnapshot: line.product.name, barcodeSnapshot: line.product.barcode, unitPrice: line.unitPrice, quantity: line.quantity, total: line.total };
    writes[tablePath("inventoryMovements", movementId)] = { id: movementId, supermarketId, branchId: user.branchId ?? null, productId: line.product.id, userId: user.id, type: "SALE", quantity: -line.quantity, previousQuantity: line.previous, newQuantity: line.next, reason: `فاتورة ${invoiceNumber}`, createdAt: timestamp };
    writes[tablePath("products", line.product.id, )] = { ...line.product, stockQuantity: line.next, updatedAt: timestamp };
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
export async function listUsers(supermarketId?: number) { const rows = await readTable<AnyRecord>("users"); return rows.filter(row => supermarketId === undefined || Number(row.supermarketId) === supermarketId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 500); }
export async function listAllProducts() { return (await readTable<AnyRecord>("products")).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 1000); }
export async function listAllCategories() { return (await readTable<AnyRecord>("categories")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1000); }
export async function listAllInvoices() { return (await readTable<AnyRecord>("invoices")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1000); }
export async function listPlans() { return (await readTable<AnyRecord>("subscriptionPlans")).filter(row => row.isActive !== false).sort((a, b) => Number(a.price || 0) - Number(b.price || 0)); }
export async function listAccounts() { const stores = await readTable<AnyRecord>("supermarkets"); return Promise.all(stores.map(async store => ({ store, access: await getTenantSubscription(Number(store.id)) }))); }
export async function globalMetrics() { const stores = await readTable<AnyRecord>("supermarkets"); const users = await readTable<AnyRecord>("users"); const products = await readTable<AnyRecord>("products"); const invoices = await readTable<AnyRecord>("invoices"); return { supermarkets: stores.length, users: users.length, products: products.length, invoices: invoices.length, sales: invoices.reduce((sum, row) => sum + Number(row.total || 0), 0) }; }
export async function setUserRole(id: number, role: string) { const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, role, updatedAt: nowIso() }); return { id, role }; }
export async function setUserActive(id: number, isActive: boolean) { const user = await read<AnyRecord>(tablePath("users", id)); if (!user) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("users", id)).set({ ...user, isActive, updatedAt: nowIso() }); return { id, isActive }; }
export async function setSubscription(supermarketId: number, status: string, endDate: Date | null) { const rows = (await readTable<AnyRecord>("subscriptions")).filter(row => Number(row.supermarketId) === supermarketId); const current = rows[0]; if (!current) throw new Error("NOT_FOUND"); const updated: AnyRecord = { ...current, status, endDate: endDate?.toISOString() ?? null, updatedAt: nowIso() }; await writeRecord("subscriptions", updated); return { id: Number(updated.id), status: String(updated.status), endDate: updated.endDate ? new Date(updated.endDate) : null }; }
export async function setProductActive(id: number, isActive: boolean) { const product = await read<AnyRecord>(tablePath("products", id)); if (!product) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("products", id)).set({ ...product, isActive, updatedAt: nowIso() }); return { id, isActive }; }
export async function setInvoiceStatus(id: number, status: string) { const invoice = await read<AnyRecord>(tablePath("invoices", id)); if (!invoice) throw new Error("NOT_FOUND"); await firebaseRealtimeDb().ref(tablePath("invoices", id)).set({ ...invoice, status }); return { id, status }; }

import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 128 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).default("OWNER").notNull(),
  supermarketId: integer("supermarketId"),
  branchId: integer("branchId"),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: utcTimestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: utcTimestamp("lastSignedIn").defaultNow().notNull(),
}, table => ({ tenantIdx: index("users_tenant_idx").on(table.supermarketId) }));

export const supermarkets = pgTable("supermarkets", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 40 }),
  address: text("address"),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: utcTimestamp("updatedAt").defaultNow().notNull(),
});

export const branches = pgTable("branches", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 40 }),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantIdx: index("branches_tenant_idx").on(table.supermarketId) }));

export const subscriptionPlans = pgTable("subscription_plans", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  price: decimal("price", { precision: 12, scale: 2 }).default("0").notNull(),
  durationDays: integer("durationDays").default(30).notNull(),
  maxProducts: integer("maxProducts"),
  maxUsers: integer("maxUsers"),
  maxBranches: integer("maxBranches"),
  maxInvoices: integer("maxInvoices"),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: utcTimestamp("updatedAt").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  planId: integer("planId").notNull(),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
  startDate: utcTimestamp("startDate").defaultNow().notNull(),
  endDate: utcTimestamp("endDate"),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: utcTimestamp("updatedAt").defaultNow().notNull(),
}, table => ({ tenantIdx: index("subscriptions_tenant_idx").on(table.supermarketId) }));

export const categories = pgTable("categories", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantNameIdx: uniqueIndex("categories_tenant_name_idx").on(table.supermarketId, table.name) }));

export const products = pgTable("products", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  branchId: integer("branchId"),
  categoryId: integer("categoryId"),
  name: varchar("name", { length: 200 }).notNull(),
  barcode: varchar("barcode", { length: 80 }).notNull(),
  sku: varchar("sku", { length: 80 }),
  brand: varchar("brand", { length: 120 }),
  unit: varchar("unit", { length: 40 }).default("قطعة").notNull(),
  sellingPrice: decimal("sellingPrice", { precision: 12, scale: 2 }).notNull(),
  costPrice: decimal("costPrice", { precision: 12, scale: 2 }).default("0").notNull(),
  stockQuantity: decimal("stockQuantity", { precision: 12, scale: 3 }).default("0").notNull(),
  minimumStock: decimal("minimumStock", { precision: 12, scale: 3 }).default("5").notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: utcTimestamp("updatedAt").defaultNow().notNull(),
}, table => ({
  tenantBarcodeIdx: uniqueIndex("products_tenant_barcode_idx").on(table.supermarketId, table.barcode),
  tenantSearchIdx: index("products_tenant_search_idx").on(table.supermarketId, table.name),
}));

export const customers = pgTable("customers", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantIdx: index("customers_tenant_idx").on(table.supermarketId) }));

export const invoices = pgTable("invoices", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  branchId: integer("branchId"),
  cashierId: integer("cashierId"),
  customerId: integer("customerId"),
  invoiceNumber: varchar("invoiceNumber", { length: 80 }).notNull().unique(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0").notNull(),
  tax: decimal("tax", { precision: 12, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 32 }).default("CASH").notNull(),
  status: varchar("status", { length: 32 }).default("PAID").notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantDateIdx: index("invoices_tenant_date_idx").on(table.supermarketId, table.createdAt) }));

export const invoiceItems = pgTable("invoice_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  productId: integer("productId").notNull(),
  productNameSnapshot: varchar("productNameSnapshot", { length: 200 }).notNull(),
  barcodeSnapshot: varchar("barcodeSnapshot", { length: 80 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
}, table => ({ invoiceIdx: index("invoice_items_invoice_idx").on(table.invoiceId) }));

export const inventoryMovements = pgTable("inventory_movements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId").notNull(),
  branchId: integer("branchId"),
  productId: integer("productId").notNull(),
  userId: integer("userId"),
  type: varchar("type", { length: 32 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  previousQuantity: decimal("previousQuantity", { precision: 12, scale: 3 }).notNull(),
  newQuantity: decimal("newQuantity", { precision: 12, scale: 3 }).notNull(),
  reason: text("reason"),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantDateIdx: index("inventory_movements_tenant_date_idx").on(table.supermarketId, table.createdAt) }));

export const auditLogs = pgTable("audit_logs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  supermarketId: integer("supermarketId"),
  userId: integer("userId"),
  action: varchar("action", { length: 120 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 80 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
}, table => ({ dateIdx: index("audit_logs_date_idx").on(table.createdAt) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;

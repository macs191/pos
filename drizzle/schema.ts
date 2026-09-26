import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: varchar("role", { length: 32 }).default("OWNER").notNull(),
    supermarketId: int("supermarketId"),
    branchId: int("branchId"),
    permissions: json("permissions").$type<string[]>(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({
    tenantIdx: index("users_tenant_idx").on(table.supermarketId),
  }),
);

export const supermarkets = mysqlTable("supermarkets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 40 }),
  address: text("address"),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const branches = mysqlTable(
  "branches",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 40 }),
    status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantIdx: index("branches_tenant_idx").on(table.supermarketId),
  }),
);

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  price: decimal("price", { precision: 12, scale: 2 }).default("0").notNull(),
  durationDays: int("durationDays").default(30).notNull(),
  maxProducts: int("maxProducts"),
  maxUsers: int("maxUsers"),
  maxBranches: int("maxBranches"),
  maxInvoices: int("maxInvoices"),
  features: json("features").$type<string[]>(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    planId: int("planId").notNull(),
    status: varchar("status", { length: 32 }).default("ACTIVE").notNull(),
    startDate: timestamp("startDate").defaultNow().notNull(),
    endDate: timestamp("endDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tenantIdx: index("subscriptions_tenant_idx").on(table.supermarketId),
  }),
);

export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantNameIdx: uniqueIndex("categories_tenant_name_idx").on(table.supermarketId, table.name),
  }),
);

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    branchId: int("branchId"),
    categoryId: int("categoryId"),
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tenantBarcodeIdx: uniqueIndex("products_tenant_barcode_idx").on(table.supermarketId, table.barcode),
    tenantSearchIdx: index("products_tenant_search_idx").on(table.supermarketId, table.name),
  }),
);

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantIdx: index("customers_tenant_idx").on(table.supermarketId),
  }),
);

export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    branchId: int("branchId"),
    cashierId: int("cashierId"),
    customerId: int("customerId"),
    invoiceNumber: varchar("invoiceNumber", { length: 80 }).notNull().unique(),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 12, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 12, scale: 2 }).default("0").notNull(),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar("paymentMethod", { length: 32 }).default("CASH").notNull(),
    status: varchar("status", { length: 32 }).default("PAID").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantDateIdx: index("invoices_tenant_date_idx").on(table.supermarketId, table.createdAt),
  }),
);

export const invoiceItems = mysqlTable(
  "invoice_items",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull(),
    productId: int("productId").notNull(),
    productNameSnapshot: varchar("productNameSnapshot", { length: 200 }).notNull(),
    barcodeSnapshot: varchar("barcodeSnapshot", { length: 80 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  },
  table => ({
    invoiceIdx: index("invoice_items_invoice_idx").on(table.invoiceId),
  }),
);

export const inventoryMovements = mysqlTable(
  "inventory_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId").notNull(),
    branchId: int("branchId"),
    productId: int("productId").notNull(),
    userId: int("userId"),
    type: varchar("type", { length: 32 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    previousQuantity: decimal("previousQuantity", { precision: 12, scale: 3 }).notNull(),
    newQuantity: decimal("newQuantity", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantDateIdx: index("inventory_movements_tenant_date_idx").on(table.supermarketId, table.createdAt),
  }),
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    supermarketId: int("supermarketId"),
    userId: int("userId"),
    action: varchar("action", { length: 120 }).notNull(),
    entity: varchar("entity", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    dateIdx: index("audit_logs_date_idx").on(table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;

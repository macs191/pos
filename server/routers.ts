import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  auditLogs,
  branches,
  categories,
  customers,
  inventoryMovements,
  invoiceItems,
  invoices,
  products,
  subscriptionPlans,
  subscriptions,
  supermarkets,
  users,
} from "../drizzle/schema";
import {
  findProductByBarcode,
  findProducts,
  getDashboardMetrics,
  getDb,
  getTenantBranches,
  getTenantById,
  getTenantSubscription,
} from "./db";

const catalogRoles = new Set(["OWNER", "ADMIN", "SUPER_ADMIN"]);
const managerRoles = new Set(["OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN"]);

function tenantId(user: { supermarketId: number | null }) {
  if (!user.supermarketId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لم يتم ربط حسابك بمتجر بعد." });
  }
  return user.supermarketId;
}

function requireRole(role: string, allowed: Set<string>) {
  if (!allowed.has(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذا الإجراء." });
  }
}

const productInput = z.object({
  name: z.string().trim().min(2).max(200),
  barcode: z.string().trim().min(3).max(80),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().default(0),
  stockQuantity: z.number().nonnegative().default(0),
  minimumStock: z.number().nonnegative().default(5),
  unit: z.string().trim().min(1).max(40).default("قطعة"),
  categoryId: z.number().int().positive().nullable().optional(),
  branchId: z.number().int().positive().nullable().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  bootstrap: protectedProcedure.query(async ({ ctx }) => {
    const supermarketId = tenantId(ctx.user);
    const [tenant, branchesList, metrics] = await Promise.all([
      getTenantById(supermarketId),
      getTenantBranches(supermarketId),
      getDashboardMetrics(supermarketId),
    ]);
    return { tenant, branches: branchesList, metrics };
  }),
  dashboard: router({
    metrics: protectedProcedure.query(async ({ ctx }) => getDashboardMetrics(tenantId(ctx.user))),
  }),
  products: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(100).default("") }))
      .query(async ({ ctx, input }) => findProducts(tenantId(ctx.user), input.search)),
    lookupByBarcode: protectedProcedure
      .input(z.object({ barcode: z.string().trim().min(1).max(80) }))
      .mutation(async ({ ctx, input }) => {
        const product = await findProductByBarcode(tenantId(ctx.user), input.barcode);
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
        }
        return product;
      }),
    create: protectedProcedure.input(productInput).mutation(async ({ ctx, input }) => {
      const supermarketId = tenantId(ctx.user);
      requireRole(ctx.user.role, catalogRoles);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
      try {
        const [created] = await db.insert(products).values({
          supermarketId,
          branchId: input.branchId ?? ctx.user.branchId ?? null,
          categoryId: input.categoryId ?? null,
          name: input.name,
          barcode: input.barcode,
          sku: input.sku ?? null,
          brand: input.brand ?? null,
          unit: input.unit,
          sellingPrice: input.sellingPrice.toFixed(2),
          costPrice: input.costPrice.toFixed(2),
          stockQuantity: input.stockQuantity.toFixed(3),
          minimumStock: input.minimumStock.toFixed(3),
          description: input.description ?? null,
        }).returning({ id: products.id });
        const id = created?.id ?? 0;
        await db.insert(auditLogs).values({
          supermarketId,
          userId: ctx.user.id,
          action: "product.create",
          entity: "product",
          entityId: String(id),
          metadata: { barcode: input.barcode },
        });
        return { id, success: true };
      } catch (error) {
        const message = String(error);
        if (message.includes("Duplicate") || message.includes("duplicate") || message.includes("23505") || message.includes("unique")) {
          throw new TRPCError({ code: "CONFLICT", message: "هذا الباركود محفوظ بالفعل." });
        }
        throw error;
      }
    }),
    updatePrice: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), sellingPrice: z.number().nonnegative() }))
      .mutation(async ({ ctx, input }) => {
        const supermarketId = tenantId(ctx.user);
        requireRole(ctx.user.role, catalogRoles);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const result = await db
          .update(products)
          .set({ sellingPrice: input.sellingPrice.toFixed(2) })
          .where(and(eq(products.id, input.id), eq(products.supermarketId, supermarketId)))
          .returning({ id: products.id });
        if (!result[0]) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
        }
        await db.insert(auditLogs).values({
          supermarketId,
          userId: ctx.user.id,
          action: "product.price_update",
          entity: "product",
          entityId: String(input.id),
          metadata: { sellingPrice: input.sellingPrice },
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(productInput.extend({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const supermarketId = tenantId(ctx.user);
        requireRole(ctx.user.role, catalogRoles);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const result = await db
          .update(products)
          .set({
            branchId: input.branchId ?? ctx.user.branchId ?? null,
            categoryId: input.categoryId ?? null,
            name: input.name,
            barcode: input.barcode,
            sku: input.sku ?? null,
            brand: input.brand ?? null,
            unit: input.unit,
            sellingPrice: input.sellingPrice.toFixed(2),
            costPrice: input.costPrice.toFixed(2),
            stockQuantity: input.stockQuantity.toFixed(3),
            minimumStock: input.minimumStock.toFixed(3),
            description: input.description ?? null,
          })
          .where(and(eq(products.id, input.id), eq(products.supermarketId, supermarketId)))
          .returning({ id: products.id });
        if (!result[0]) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
        }
        await db.insert(auditLogs).values({
          supermarketId,
          userId: ctx.user.id,
          action: "product.update",
          entity: "product",
          entityId: String(input.id),
          metadata: { barcode: input.barcode },
        });
        return { success: true, id: input.id };
      }),
  }),
  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(categories).where(eq(categories.supermarketId, tenantId(ctx.user))).orderBy(desc(categories.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const supermarketId = tenantId(ctx.user);
        requireRole(ctx.user.role, catalogRoles);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        try {
          const [created] = await db.insert(categories).values({ supermarketId, name: input.name }).returning({ id: categories.id });
          return { id: created?.id ?? 0, success: true };
        } catch {
          throw new TRPCError({ code: "CONFLICT", message: "القسم موجود بالفعل." });
        }
      }),
  }),
  pos: router({
    createInvoice: protectedProcedure
      .input(
        z.object({
          items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive() })).min(1),
          discount: z.number().nonnegative().default(0),
          tax: z.number().nonnegative().default(0),
          paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
          customerId: z.number().int().positive().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const supermarketId = tenantId(ctx.user);
        requireRole(ctx.user.role, new Set(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });

        return db.transaction(async tx => {
          const lineItems: Array<{
            productId: number;
            name: string;
            barcode: string;
            unitPrice: number;
            quantity: number;
            total: number;
            previousStock: number;
            newStock: number;
          }> = [];

          for (const requested of input.items) {
            const result = await tx
              .select()
              .from(products)
              .where(and(eq(products.id, requested.productId), eq(products.supermarketId, supermarketId), eq(products.isActive, true)))
              .limit(1);
            const product = result[0];
            if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "أحد المنتجات لم يعد متاحًا." });
            const unitPrice = Number(product.sellingPrice);
            const previousStock = Number(product.stockQuantity);
            const newStock = previousStock - requested.quantity;
            if (newStock < 0) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `المخزون غير كافٍ للمنتج: ${product.name}` });
            }
            lineItems.push({
              productId: product.id,
              name: product.name,
              barcode: product.barcode,
              unitPrice,
              quantity: requested.quantity,
              total: unitPrice * requested.quantity,
              previousStock,
              newStock,
            });
          }

          const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
          const total = Math.max(0, subtotal - input.discount + input.tax);
          const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${nanoid(7).toUpperCase()}`;
          const [createdInvoice] = await tx.insert(invoices).values({
            supermarketId,
            branchId: ctx.user.branchId ?? null,
            cashierId: ctx.user.id,
            customerId: input.customerId ?? null,
            invoiceNumber,
            subtotal: subtotal.toFixed(2),
            discount: input.discount.toFixed(2),
            tax: input.tax.toFixed(2),
            total: total.toFixed(2),
            paymentMethod: input.paymentMethod,
            status: "PAID",
          }).returning({ id: invoices.id });
          const invoiceId = createdInvoice?.id ?? 0;
          if (!invoiceId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء الفاتورة." });

          for (const item of lineItems) {
            const updateResult = await tx
              .update(products)
              .set({ stockQuantity: item.newStock.toFixed(3) })
              .where(and(eq(products.id, item.productId), eq(products.supermarketId, supermarketId), sql`${products.stockQuantity} >= ${item.quantity}`))
              .returning({ id: products.id });
            if (!updateResult[0]) {
              throw new TRPCError({ code: "CONFLICT", message: `تغير المخزون أثناء الحفظ: ${item.name}` });
            }
            await tx.insert(invoiceItems).values({
              invoiceId,
              productId: item.productId,
              productNameSnapshot: item.name,
              barcodeSnapshot: item.barcode,
              unitPrice: item.unitPrice.toFixed(2),
              quantity: item.quantity.toFixed(3),
              total: item.total.toFixed(2),
            });
            await tx.insert(inventoryMovements).values({
              supermarketId,
              branchId: ctx.user.branchId ?? null,
              productId: item.productId,
              userId: ctx.user.id,
              type: "SALE",
              quantity: (-item.quantity).toFixed(3),
              previousQuantity: item.previousStock.toFixed(3),
              newQuantity: item.newStock.toFixed(3),
              reason: `فاتورة ${invoiceNumber}`,
            });
          }
          await tx.insert(auditLogs).values({
            supermarketId,
            userId: ctx.user.id,
            action: "invoice.create",
            entity: "invoice",
            entityId: String(invoiceId),
            metadata: { invoiceNumber, total },
          });
          return { success: true, invoiceId, invoiceNumber, total };
        });
      }),
  }),
  invoices: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(100).default("") }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const supermarketId = tenantId(ctx.user);
        const term = `%${input.search}%`;
        return db
          .select()
          .from(invoices)
          .where(and(eq(invoices.supermarketId, supermarketId), input.search ? like(invoices.invoiceNumber, term) : undefined))
          .orderBy(desc(invoices.createdAt))
          .limit(100);
      }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
      const supermarketId = tenantId(ctx.user);
      const invoice = await db.select().from(invoices).where(and(eq(invoices.id, input.id), eq(invoices.supermarketId, supermarketId))).limit(1);
      if (!invoice[0]) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة." });
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
      return { invoice: invoice[0], items };
    }),
  }),
  inventory: router({
    lowStock: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const supermarketId = tenantId(ctx.user);
      return db.select().from(products).where(and(eq(products.supermarketId, supermarketId), sql`${products.stockQuantity} <= ${products.minimumStock}`)).orderBy(products.stockQuantity);
    }),
    adjust: protectedProcedure
      .input(z.object({ productId: z.number().int().positive(), quantity: z.number(), reason: z.string().trim().min(2).max(250) }))
      .mutation(async ({ ctx, input }) => {
        const supermarketId = tenantId(ctx.user);
        requireRole(ctx.user.role, managerRoles);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        return db.transaction(async tx => {
          const result = await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.supermarketId, supermarketId))).limit(1);
          const product = result[0];
          if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
          const previous = Number(product.stockQuantity);
          const next = previous + input.quantity;
          if (next < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يصبح المخزون سالبًا." });
          await tx.update(products).set({ stockQuantity: next.toFixed(3) }).where(eq(products.id, input.productId));
          await tx.insert(inventoryMovements).values({
            supermarketId,
            branchId: ctx.user.branchId ?? null,
            productId: input.productId,
            userId: ctx.user.id,
            type: input.quantity >= 0 ? "PURCHASE" : "ADJUSTMENT",
            quantity: input.quantity.toFixed(3),
            previousQuantity: previous.toFixed(3),
            newQuantity: next.toFixed(3),
            reason: input.reason,
          });
          return { success: true, stockQuantity: next };
        });
      }),
  }),
  branches: router({
    list: protectedProcedure.query(async ({ ctx }) => getTenantBranches(tenantId(ctx.user))),
  }),
  subscription: router({
    current: protectedProcedure.query(async ({ ctx }) => getTenantSubscription(tenantId(ctx.user))),
  }),
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const store = await getTenantById(tenantId(ctx.user));
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود." });
      return store;
    }),
    updateStore: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(180), phone: z.string().trim().max(40).nullable(), address: z.string().trim().max(500).nullable() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        requireRole(ctx.user.role, new Set(["OWNER", "ADMIN", "SUPER_ADMIN"]));
        const [store] = await db.update(supermarkets).set({ name: input.name, phone: input.phone, address: input.address }).where(eq(supermarkets.id, tenantId(ctx.user))).returning();
        if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود." });
        await db.insert(auditLogs).values({ supermarketId: store.id, userId: ctx.user.id, action: "store.update", entity: "supermarket", entityId: String(store.id), metadata: { name: input.name } });
        return store;
      }),
  }),
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).where(eq(users.supermarketId, tenantId(ctx.user))).orderBy(desc(users.createdAt));
    }),
  }),
  superAdmin: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
      const [marketplaces, accountUsers, productCount, invoiceCount, sales] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from((supermarkets)),
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(products),
        db.select({ count: sql<number>`count(*)` }).from(invoices),
        db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices),
      ]);
      return {
        supermarkets: Number(marketplaces[0]?.count ?? 0),
        users: Number(accountUsers[0]?.count ?? 0),
        products: Number(productCount[0]?.count ?? 0),
        invoices: Number(invoiceCount[0]?.count ?? 0),
        sales: Number(sales[0]?.total ?? 0),
      };
    }),
    plans: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.price);
    }),
    accounts: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      const stores = await db.select().from(supermarkets).orderBy(desc(supermarkets.createdAt));
      return Promise.all(stores.map(async store => ({ store, access: await getTenantSubscription(store.id) })));
    }),
    users: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, supermarketId: users.supermarketId, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(500);
    }),
    setUserRole: protectedProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [updated] = await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId)).returning({ id: users.id, role: users.role });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
        return updated;
      }),
    setUserActive: protectedProcedure
      .input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [updated] = await db.update(users).set({ isActive: input.isActive }).where(eq(users.id, input.userId)).returning({ id: users.id, isActive: users.isActive });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود." });
        return updated;
      }),
    setSubscription: protectedProcedure
      .input(z.object({ supermarketId: z.number().int().positive(), status: z.enum(["ACTIVE", "PAUSED", "CANCELED"]), endDate: z.coerce.date().nullable() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [updated] = await db.update(subscriptions).set({ status: input.status, endDate: input.endDate }).where(eq(subscriptions.supermarketId, input.supermarketId)).returning({ id: subscriptions.id, status: subscriptions.status, endDate: subscriptions.endDate });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "اشتراك المتجر غير موجود." });
        return updated;
      }),
    products: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      return db.select().from(products).orderBy(desc(products.updatedAt)).limit(1000);
    }),
    setProductActive: protectedProcedure
      .input(z.object({ productId: z.number().int().positive(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [updated] = await db.update(products).set({ isActive: input.isActive }).where(eq(products.id, input.productId)).returning({ id: products.id, isActive: products.isActive });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
        return updated;
      }),
    categories: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      return db.select().from(categories).orderBy(desc(categories.createdAt)).limit(1000);
    }),
    invoices: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
      const db = await getDb();
      if (!db) return [];
      return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(1000);
    }),
    setInvoiceStatus: protectedProcedure
      .input(z.object({ invoiceId: z.number().int().positive(), status: z.enum(["PAID", "VOID", "REFUNDED"]) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, new Set(["SUPER_ADMIN"]));
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة." });
        const [updated] = await db.update(invoices).set({ status: input.status }).where(eq(invoices.id, input.invoiceId)).returning({ id: invoices.id, status: invoices.status });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة." });
        return updated;
      }),
  }),
});

export type AppRouter = typeof appRouter;

import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  adjustInventory,
  createInvoice,
  createProduct,
  findProductByBarcode,
  findProducts,
  findProductsByName,
  getDashboardMetrics,
  getTenantBranches,
  getTenantById,
  getTenantSubscription,
  globalMetrics,
  invoiceDetail,
  listAccounts,
  listAllCategories,
  listAllInvoices,
  listAllProducts,
  listPlans,
  listInvoices,
  listUsers,
  lowStock,
  setInvoiceStatus,
  setProductActive,
  setSubscription,
  setUserActive,
  setUserRole,
  updateProduct,
  updateStore,
} from "./db.js";

const catalogRoles = new Set(["OWNER", "ADMIN", "SUPER_ADMIN"]);
const managerRoles = new Set(["OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN"]);
const cashierRoles = new Set(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]);

function tenantId(user: { supermarketId: number | null }) {
  if (!user.supermarketId) throw new TRPCError({ code: "FORBIDDEN", message: "لم يتم ربط حسابك بمتجر بعد." });
  return user.supermarketId;
}
function requireRole(role: string, allowed: Set<string>) {
  if (!allowed.has(role)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذا الإجراء." });
}
function mapError(error: unknown): never {
  const message = String(error);
  if (message.includes("DUPLICATE_BARCODE")) throw new TRPCError({ code: "CONFLICT", message: "هذا الباركود محفوظ بالفعل." });
  if (message.includes("NOT_FOUND") || message.includes("PRODUCT_NOT_FOUND")) throw new TRPCError({ code: "NOT_FOUND", message: "العنصر غير موجود." });
  if (message.includes("INSUFFICIENT_STOCK")) throw new TRPCError({ code: "BAD_REQUEST", message: `المخزون غير كافٍ للمنتج: ${message.split(":")[1] || ""}` });
  if (message.includes("NEGATIVE_STOCK")) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يصبح المخزون سالبًا." });
  throw error;
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
    const id = tenantId(ctx.user);
    const [tenant, branches, metrics] = await Promise.all([getTenantById(id), getTenantBranches(id), getDashboardMetrics(id)]);
    return { tenant, branches, metrics };
  }),
  dashboard: router({ metrics: protectedProcedure.query(({ ctx }) => getDashboardMetrics(tenantId(ctx.user))) }),
  products: router({
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(100).default("") })).query(({ ctx, input }) => findProducts(tenantId(ctx.user), input.search)),
    lookupByBarcode: protectedProcedure.input(z.object({ barcode: z.string().trim().min(1).max(80) })).mutation(async ({ ctx, input }) => {
      const product = await findProductByBarcode(tenantId(ctx.user), input.barcode);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
      return product;
    }),
    lookupByName: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(200) })).mutation(({ ctx, input }) => findProductsByName(tenantId(ctx.user), input.name)),
    create: protectedProcedure.input(productInput).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, catalogRoles);
      try { return await createProduct(tenantId(ctx.user), input, ctx.user.id, ctx.user.branchId); } catch (error) { return mapError(error); }
    }),
    updatePrice: protectedProcedure.input(z.object({ id: z.number().int().positive(), sellingPrice: z.number().nonnegative() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, catalogRoles);
      try { return await updateProduct(tenantId(ctx.user), input, ctx.user.id, ctx.user.branchId); } catch (error) { return mapError(error); }
    }),
    update: protectedProcedure.input(productInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, catalogRoles);
      try { return await updateProduct(tenantId(ctx.user), input, ctx.user.id, ctx.user.branchId); } catch (error) { return mapError(error); }
    }),
  }),
  pos: router({
    createInvoice: protectedProcedure.input(z.object({
      items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive() })).min(1),
      discount: z.number().nonnegative().default(0), tax: z.number().nonnegative().default(0),
      paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"), customerId: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, cashierRoles);
      try { return await createInvoice(tenantId(ctx.user), ctx.user, input); } catch (error) { return mapError(error); }
    }),
  }),
  invoices: router({
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(100).default("") })).query(({ ctx, input }) => listInvoices(tenantId(ctx.user), input.search)),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const result = await invoiceDetail(tenantId(ctx.user), input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة." });
      return result;
    }),
  }),
  inventory: router({
    lowStock: protectedProcedure.query(({ ctx }) => lowStock(tenantId(ctx.user))),
    adjust: protectedProcedure.input(z.object({ productId: z.number().int().positive(), quantity: z.number(), reason: z.string().trim().min(2).max(250) })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, managerRoles);
      try { return await adjustInventory(tenantId(ctx.user), ctx.user, input); } catch (error) { return mapError(error); }
    }),
  }),
  branches: router({ list: protectedProcedure.query(({ ctx }) => getTenantBranches(tenantId(ctx.user))) }),
  subscription: router({ current: protectedProcedure.query(({ ctx }) => getTenantSubscription(tenantId(ctx.user))) }),
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const store = await getTenantById(tenantId(ctx.user));
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود." });
      return store;
    }),
    updateStore: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(180), phone: z.string().trim().max(40).nullable(), secondaryPhone: z.string().trim().max(40).nullable().optional(), address: z.string().trim().max(500).nullable(), receiptHeader: z.string().trim().max(500).nullable().optional(), receiptFooter: z.string().trim().max(500).nullable().optional(), receiptWidth: z.enum(["58mm", "80mm", "A4"]).optional(), showReceiptLogo: z.boolean().optional(), printerName: z.string().trim().max(180).nullable().optional() })).mutation(async ({ ctx, input }) => {
      requireRole(ctx.user.role, catalogRoles);
      try { return await updateStore(tenantId(ctx.user), input, ctx.user.id); } catch (error) { return mapError(error); }
    }),
  }),
  users: router({ list: protectedProcedure.query(({ ctx }) => listUsers(tenantId(ctx.user))) }),
  superAdmin: router({
    overview: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return globalMetrics(); }),
    plans: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listPlans(); }),
    accounts: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAccounts(); }),
    users: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listUsers(); }),
    setUserRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setUserRole(input.userId, input.role); } catch (error) { return mapError(error); } }),
    setUserActive: protectedProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setUserActive(input.userId, input.isActive); } catch (error) { return mapError(error); } }),
    setSubscription: protectedProcedure.input(z.object({ supermarketId: z.number().int().positive(), status: z.enum(["ACTIVE", "PAUSED", "CANCELED"]), endDate: z.coerce.date().nullable() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setSubscription(input.supermarketId, input.status, input.endDate); } catch (error) { return mapError(error); } }),
    products: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllProducts(); }),
    categories: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllCategories(); }),
    invoices: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllInvoices(); }),
    setProductActive: protectedProcedure.input(z.object({ productId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setProductActive(input.productId, input.isActive); } catch (error) { return mapError(error); } }),
    setInvoiceStatus: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), status: z.enum(["PAID", "VOID", "REFUNDED"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setInvoiceStatus(input.invoiceId, input.status); } catch (error) { return mapError(error); } }),
  }),
});

export type AppRouter = typeof appRouter;

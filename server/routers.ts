import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { authenticatedProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createCatalogProduct,
  createInvoice,
  findCatalogProductByBarcode,
  findCatalogProducts,
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
  listPriceChangeRequests,
  listInvoices,
  listUsers,
  setInvoiceStatus,
  setProductActive,
  setSubscription,
  setSubscriptionPaymentStatus,
  reviewPriceChangeRequest,
  submitPriceChange,
  upsertPlan,
  setUserActive,
  setUserRole,
  updateUserDisplayName,
  updateCatalogProduct,
  updateStore,
} from "./db.js";

const catalogRoles = new Set(["OWNER", "ADMIN", "SUPER_ADMIN"]);
const cashierRoles = new Set(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]);

function tenantId(user: { supermarketId: number | null } | null | undefined) {
  if (user == null || !Number.isInteger(user.supermarketId) || Number(user.supermarketId) <= 0) throw new TRPCError({ code: "FORBIDDEN", message: "حسابك لم يُربط بمتجر بعد. أعد تسجيل الدخول؛ وإذا استمرت المشكلة تواصل مع المدير." });
  return Number(user.supermarketId);
}
function requireRole(role: string, allowed: Set<string>) {
  if (!allowed.has(role)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لتنفيذ هذا الإجراء." });
}
function mapError(error: unknown): never {
  const message = String(error);
  if (message.includes("FIREBASE_UPDATE_FAILED:401") || message.includes("FIREBASE_WRITE_FAILED:401")) throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة Firebase. سجّل الخروج ثم ادخل مرة أخرى." });
  if (message.includes("FIREBASE_UPDATE_FAILED:403") || message.includes("FIREBASE_WRITE_FAILED:403") || message.includes("FIREBASE_READ_FAILED:403")) throw new TRPCError({ code: "FORBIDDEN", message: "حساب Firebase Admin لا يملك صلاحية الوصول إلى Realtime Database؛ تحقق من حساب الخدمة ورابط قاعدة البيانات." });
  if (message.includes("FIREBASE_READ_FAILED:401")) throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر التحقق من جلسة Firebase؛ سجّل الدخول مرة أخرى." });
  if (message.includes("FIREBASE_") || message.includes("Firebase")) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `تعذر الحفظ في Firebase: ${message.slice(0, 180)}` });
  if (message.includes("INVALID_PRODUCT_DATA")) throw new TRPCError({ code: "BAD_REQUEST", message: "بيانات المنتج غير صحيحة. أدخل اسمًا، باركودًا من 3 أرقام على الأقل، وسعرًا صالحًا." });
  if (message.includes("DUPLICATE_BARCODE")) throw new TRPCError({ code: "CONFLICT", message: "هذا الباركود محفوظ بالفعل." });
  if (message.includes("PRICE_UNCHANGED")) throw new TRPCError({ code: "BAD_REQUEST", message: "السعر المقترح مطابق للسعر الحالي." });
  if (message.includes("REQUEST_ALREADY_REVIEWED")) throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذا الطلب مسبقًا." });
  if (message.includes("NOT_FOUND") || message.includes("PRODUCT_NOT_FOUND")) throw new TRPCError({ code: "NOT_FOUND", message: "العنصر غير موجود." });
  if (message.includes("INSUFFICIENT_STOCK")) throw new TRPCError({ code: "BAD_REQUEST", message: `المخزون غير كافٍ للمنتج: ${message.split(":")[1] || ""}` });
  if (message.includes("NEGATIVE_STOCK")) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يصبح المخزون سالبًا." });
  throw error;
}

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
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(100).default("") })).query(({ input }) => findCatalogProducts(input.search)),
    lookupByBarcode: protectedProcedure.input(z.object({ barcode: z.string().trim().min(1).max(80) })).mutation(async ({ ctx, input }) => {
      const product = await findCatalogProductByBarcode(input.barcode);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود." });
      return product;
    }),
    lookupByName: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(200) })).mutation(async ({ input }) => (await findCatalogProducts(input.name)).slice(0, 5)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(200), barcode: z.string().trim().min(3).max(80), sellingPrice: z.number().nonnegative() })).mutation(async ({ ctx, input }) => {
      try { return await createCatalogProduct(input, ctx.user.id); } catch (error) { return mapError(error); }
    }),
    requestPriceChange: protectedProcedure.input(z.object({ barcode: z.string().trim().min(3).max(80), proposedPrice: z.number().nonnegative() })).mutation(async ({ ctx, input }) => {
      try { return await submitPriceChange(input, ctx.user); } catch (error) { return mapError(error); }
    }),
  }),
  pos: router({
    createInvoice: protectedProcedure.input(z.object({
      items: z.array(z.object({ productId: z.union([z.string().min(1), z.number().int().positive()]), quantity: z.number().positive() })).min(1),
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
  branches: router({ list: protectedProcedure.query(({ ctx }) => getTenantBranches(tenantId(ctx.user))) }),
  subscription: router({ current: authenticatedProcedure.query(({ ctx }) => getTenantSubscription(tenantId(ctx.user))) }),
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
  users: router({
    list: protectedProcedure.query(({ ctx }) => {
      requireRole(ctx.user.role, catalogRoles);
      return listUsers(tenantId(ctx.user));
    }),
  }),
  superAdmin: router({
    overview: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return globalMetrics(); }),
    plans: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listPlans(); }),
    savePlan: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(2).max(100), code: z.string().trim().min(2).max(40), price: z.number().nonnegative(), durationDays: z.number().int().positive(), maxProducts: z.number().int().positive(), maxUsers: z.number().int().positive(), maxBranches: z.number().int().positive() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await upsertPlan(input); } catch (error) { return mapError(error); } }),
    accounts: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAccounts(); }),
    users: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listUsers(); }),
    priceChangeRequests: protectedProcedure.input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") })).query(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listPriceChangeRequests(input.status); }),
    reviewPriceChange: protectedProcedure.input(z.object({ requestId: z.string().min(1), status: z.enum(["APPROVED", "REJECTED"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await reviewPriceChangeRequest(input.requestId, input.status, ctx.user.id); } catch (error) { return mapError(error); } }),
    updateProduct: protectedProcedure.input(z.object({ id: z.string().min(1), name: z.string().trim().min(2).max(200), barcode: z.string().trim().min(3).max(80), sellingPrice: z.number().nonnegative() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await updateCatalogProduct(input, ctx.user.id); } catch (error) { return mapError(error); } }),
    setUserRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setUserRole(input.userId, input.role); } catch (error) { return mapError(error); } }),
    updateUserName: protectedProcedure.input(z.object({ userId: z.number().int().positive(), name: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await updateUserDisplayName(input.userId, input.name); } catch (error) { return mapError(error); } }),
    setUserActive: protectedProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setUserActive(input.userId, input.isActive); } catch (error) { return mapError(error); } }),
    setSubscription: protectedProcedure.input(z.object({ supermarketId: z.number().int().positive(), status: z.enum(["ACTIVE", "PAUSED", "CANCELED"]), endDate: z.coerce.date().nullable() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setSubscription(input.supermarketId, input.status, input.endDate); } catch (error) { return mapError(error); } }),
    setSubscriptionPaymentStatus: protectedProcedure.input(z.object({ supermarketId: z.number().int().positive(), paymentStatus: z.enum(["PAID", "UNPAID"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setSubscriptionPaymentStatus(input.supermarketId, input.paymentStatus); } catch (error) { return mapError(error); } }),
    updateStore: protectedProcedure.input(z.object({ supermarketId: z.number().int().positive(), name: z.string().trim().min(2).max(180), phone: z.string().trim().max(40).nullable(), address: z.string().trim().max(500).nullable() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); const { supermarketId, ...storeInput } = input; try { return await updateStore(supermarketId, storeInput, ctx.user.id); } catch (error) { return mapError(error); } }),
    products: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllProducts(); }),
    categories: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllCategories(); }),
    invoices: protectedProcedure.query(async ({ ctx }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); return listAllInvoices(); }),
    setProductActive: protectedProcedure.input(z.object({ productId: z.union([z.string().min(1), z.number().int().positive()]), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setProductActive(input.productId, input.isActive); } catch (error) { return mapError(error); } }),
    setInvoiceStatus: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), status: z.enum(["PAID", "VOID", "REFUNDED"]) })).mutation(async ({ ctx, input }) => { requireRole(ctx.user.role, new Set(["SUPER_ADMIN"])); try { return await setInvoiceStatus(input.invoiceId, input.status); } catch (error) { return mapError(error); } }),
  }),
});

export type AppRouter = typeof appRouter;

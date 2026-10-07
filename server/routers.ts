import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { User } from "../drizzle/schema.js";
import { getTenantIdFromUser } from "./tenant.js";
import {
  createInvoice,
  createProduct,
  findProductByBarcode,
  findProducts,
  findProductsByName,
  getDashboardMetrics,
  getTenantBranches,
  getLatestSubscriptionRequest,
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
  listSubscriptionRequests,
  listPriceChangeRequests,
  listUsers,
  resolvePriceChangeRequest,
  resolveSubscriptionRequest,
  setInvoiceStatus,
  setProductActive,
  setSubscription,
  setUserActive,
  setUserRole,
  requestSubscriptionRenewal,
  submitPriceChangeRequest,
  updateCatalogProduct,
  updateStore,
} from "./db.js";

const managerRoles = new Set(["OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN"]);
const cashierRoles = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "SUPER_ADMIN",
]);
const superAdminRoles = new Set(["SUPER_ADMIN"]);

function tenantId(user: Pick<User, "supermarketId"> | null | undefined) {
  const id = getTenantIdFromUser(user);
  if (id === null)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "لم يتم ربط حسابك بمتجر بعد. سجّل الخروج ثم الدخول مجددًا، أو اطلب من المدير تفعيل حسابك.",
    });
  return id;
}

function requireRole(role: string, allowed: Set<string>) {
  if (!allowed.has(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
    });
}

function mapError(error: unknown): never {
  const message = String(error);
  if (message.includes("DUPLICATE_BARCODE"))
    throw new TRPCError({
      code: "CONFLICT",
      message: "هذا الباركود محفوظ بالفعل في الكتالوج العام.",
    });
  if (message.includes("PRICE_CHANGE_PENDING"))
    throw new TRPCError({
      code: "CONFLICT",
      message: "يوجد طلب تغيير سعر قيد المراجعة لهذا المنتج بالفعل.",
    });
  if (message.includes("PRICE_UNCHANGED"))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "السعر الجديد مطابق للسعر الحالي.",
    });
  if (message.includes("PRICE_CONFLICT"))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "تغير السعر الحالي منذ إنشاء الطلب؛ راجع المنتج ثم أعد إرسال الطلب.",
    });
  if (message.includes("SUBSCRIPTION_REQUEST_PENDING"))
    throw new TRPCError({
      code: "CONFLICT",
      message: "يوجد بالفعل طلب اشتراك قيد المراجعة لهذا المتجر.",
    });
  if (message.includes("SUBSCRIPTION_REQUEST_ALREADY_RESOLVED"))
    throw new TRPCError({
      code: "CONFLICT",
      message: "تمت معالجة طلب الاشتراك مسبقًا.",
    });
  if (message.includes("SUBSCRIPTION_NOT_FOUND"))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "لا يوجد سجل اشتراك لهذا المتجر؛ راجع إعدادات الإدارة.",
    });
  if (message.includes("REQUEST_ALREADY_RESOLVED"))
    throw new TRPCError({
      code: "CONFLICT",
      message: "تمت معالجة طلب السعر مسبقًا.",
    });
  if (message.includes("INVALID_PRICE"))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "أدخل سعرًا صالحًا غير سالب.",
    });
  if (message.includes("INVALID_QUANTITY"))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "الكمية يجب أن تكون عددًا صحيحًا من القطع.",
    });
  if (message.includes("NOT_FOUND") || message.includes("PRODUCT_NOT_FOUND"))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "المنتج أو الحساب غير موجود.",
    });
  throw error;
}

const newProductInput = z.object({
  name: z.string().trim().min(2).max(200),
  barcode: z.string().trim().min(3).max(80),
  sellingPrice: z.number().finite().nonnegative(),
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
    const tenant = await getTenantById(id);
    if (!tenant)
      throw new TRPCError({ code: "NOT_FOUND", message: "المتجر غير موجود." });
    if (!managerRoles.has(ctx.user.role))
      return { tenant: { name: tenant.name }, branches: [], metrics: null };
    const [branches, metrics] = await Promise.all([
      getTenantBranches(id),
      getDashboardMetrics(id),
    ]);
    return { tenant, branches, metrics };
  }),
  dashboard: router({
    metrics: protectedProcedure.query(({ ctx }) => {
      requireRole(ctx.user.role, managerRoles);
      return getDashboardMetrics(tenantId(ctx.user));
    }),
  }),
  products: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(100).default("") }))
      .query(({ input }) => findProducts(input.search)),
    lookupByBarcode: protectedProcedure
      .input(z.object({ barcode: z.string().trim().min(1).max(80) }))
      .mutation(async ({ input }) => {
        const product = await findProductByBarcode(input.barcode);
        if (!product)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المنتج غير موجود في الكتالوج العام.",
          });
        return product;
      }),
    lookupByName: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(200) }))
      .mutation(({ input }) => findProductsByName(input.name)),
    create: protectedProcedure
      .input(newProductInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await createProduct(input, ctx.user);
        } catch (error) {
          return mapError(error);
        }
      }),
    requestPriceChange: protectedProcedure
      .input(
        z.object({
          barcode: z.string().trim().min(1).max(80),
          requestedPrice: z.number().finite().nonnegative(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await submitPriceChangeRequest(
            input.barcode,
            input.requestedPrice,
            ctx.user
          );
        } catch (error) {
          return mapError(error);
        }
      }),
  }),
  pos: router({
    createInvoice: protectedProcedure
      .input(
        z.object({
          items: z
            .array(
              z.object({
                productId: z.string().min(1).max(120),
                quantity: z.number().int().positive(),
              })
            )
            .min(1)
            .max(100),
          discount: z.number().nonnegative().default(0),
          tax: z.number().nonnegative().default(0),
          paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
          customerId: z.number().int().positive().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, cashierRoles);
        try {
          return await createInvoice(tenantId(ctx.user), ctx.user, input);
        } catch (error) {
          return mapError(error);
        }
      }),
  }),
  invoices: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().trim().max(100).default("") }))
      .query(({ ctx, input }) => {
        requireRole(ctx.user.role, managerRoles);
        return listInvoices(tenantId(ctx.user), input.search);
      }),
    detail: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, managerRoles);
        const result = await invoiceDetail(tenantId(ctx.user), input.id);
        if (!result)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الفاتورة غير موجودة.",
          });
        return result;
      }),
  }),
  branches: router({
    list: protectedProcedure.query(({ ctx }) => {
      requireRole(ctx.user.role, managerRoles);
      return getTenantBranches(tenantId(ctx.user));
    }),
  }),
  subscription: router({
    access: publicProcedure.query(({ ctx }) => {
      const id = getTenantIdFromUser(ctx.user);
      return id === null ? null : getTenantSubscription(id);
    }),
    myRequest: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "سجّل الدخول لعرض طلب الاشتراك.",
        });
      const request = await getLatestSubscriptionRequest(tenantId(ctx.user));
      if (!request) return null;
      return {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt ?? null,
        note: request.note ?? null,
      };
    }),
    request: publicProcedure
      .input(z.object({ note: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "سجّل الدخول أولًا لإرسال طلب الاشتراك.",
          });
        try {
          const request = await requestSubscriptionRenewal(
            tenantId(ctx.user),
            ctx.user,
            input.note ?? null
          );
          return {
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
          };
        } catch (error) {
          return mapError(error);
        }
      }),
    current: protectedProcedure.query(({ ctx }) => {
      requireRole(ctx.user.role, managerRoles);
      return getTenantSubscription(tenantId(ctx.user));
    }),
  }),
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, managerRoles);
      const store = await getTenantById(tenantId(ctx.user));
      if (!store)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المتجر غير موجود.",
        });
      return store;
    }),
    updateStore: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(180),
          phone: z.string().trim().max(40).nullable(),
          secondaryPhone: z.string().trim().max(40).nullable().optional(),
          address: z.string().trim().max(500).nullable(),
          receiptHeader: z.string().trim().max(500).nullable().optional(),
          receiptFooter: z.string().trim().max(500).nullable().optional(),
          receiptWidth: z.enum(["58mm", "80mm", "A4"]).optional(),
          showReceiptLogo: z.boolean().optional(),
          printerName: z.string().trim().max(180).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, managerRoles);
        try {
          return await updateStore(tenantId(ctx.user), input, ctx.user.id);
        } catch (error) {
          return mapError(error);
        }
      }),
  }),
  users: router({
    list: protectedProcedure.query(({ ctx }) => {
      requireRole(ctx.user.role, managerRoles);
      return listUsers(tenantId(ctx.user));
    }),
  }),
  superAdmin: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return globalMetrics();
    }),
    plans: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listPlans();
    }),
    accounts: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listAccounts();
    }),
    users: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listUsers();
    }),
    setUserRole: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await setUserRole(input.userId, input.role);
        } catch (error) {
          return mapError(error);
        }
      }),
    setUserActive: protectedProcedure
      .input(
        z.object({ userId: z.number().int().positive(), isActive: z.boolean() })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await setUserActive(input.userId, input.isActive);
        } catch (error) {
          return mapError(error);
        }
      }),
    setSubscription: protectedProcedure
      .input(
        z.object({
          supermarketId: z.number().int().positive(),
          status: z.enum(["ACTIVE", "PAUSED", "CANCELED"]),
          endDate: z.coerce.date().nullable(),
          isPaid: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await setSubscription(
            input.supermarketId,
            input.status,
            input.endDate,
            input.isPaid
          );
        } catch (error) {
          return mapError(error);
        }
      }),
    subscriptionRequests: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listSubscriptionRequests();
    }),
    resolveSubscriptionRequest: protectedProcedure
      .input(
        z.object({
          requestId: z.string().min(1).max(120),
          decision: z.enum(["APPROVED", "REJECTED"]),
          days: z.number().int().min(1).max(365).default(30),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await resolveSubscriptionRequest(
            input.requestId,
            input.decision,
            input.days,
            ctx.user.id
          );
        } catch (error) {
          return mapError(error);
        }
      }),
    products: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listAllProducts();
    }),
    priceChangeRequests: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listPriceChangeRequests();
    }),
    updateProduct: protectedProcedure
      .input(
        z.object({
          barcode: z.string().trim().min(1).max(80),
          name: z.string().trim().min(2).max(200),
          sellingPrice: z.number().finite().nonnegative(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await updateCatalogProduct(
            input.barcode,
            input.name,
            input.sellingPrice,
            ctx.user.id
          );
        } catch (error) {
          return mapError(error);
        }
      }),
    resolvePriceChange: protectedProcedure
      .input(
        z.object({
          requestId: z.string().min(1).max(120),
          decision: z.enum(["APPROVED", "REJECTED"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await resolvePriceChangeRequest(
            input.requestId,
            input.decision,
            ctx.user.id
          );
        } catch (error) {
          return mapError(error);
        }
      }),
    setProductActive: protectedProcedure
      .input(
        z.object({
          barcode: z.string().trim().min(1).max(80),
          isActive: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await setProductActive(input.barcode, input.isActive);
        } catch (error) {
          return mapError(error);
        }
      }),
    categories: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listAllCategories();
    }),
    invoices: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, superAdminRoles);
      return listAllInvoices();
    }),
    setInvoiceStatus: protectedProcedure
      .input(
        z.object({
          invoiceId: z.number().int().positive(),
          status: z.enum(["PAID", "VOID", "REFUNDED"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, superAdminRoles);
        try {
          return await setInvoiceStatus(input.invoiceId, input.status);
        } catch (error) {
          return mapError(error);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

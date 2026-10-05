import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '../../shared/const.js';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";
import { getTenantSubscription } from "../db.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  const user = ctx.user;
  if (user == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (user.role !== "SUPER_ADMIN") {
    if (user.supermarketId == null || user.supermarketId <= 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "حسابك لم يُربط بمتجر بعد. أعد تسجيل الدخول؛ وإذا استمرت المشكلة تواصل مع المدير." });
    }
    const access = await getTenantSubscription(user.supermarketId);
    if (!access || !access.isActive) {
      throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد اشتراك فعال لهذا المتجر أو انتهت صلاحيته. تواصل مع مدير الموقع لتفعيله." });
    }
  }

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

const requireIdentity = t.middleware(async ({ ctx, next }) => {
  if (ctx.user == null) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const authenticatedProcedure = t.procedure.use(requireIdentity);
export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

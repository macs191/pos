import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  CreditCard,
  LogOut,
  MessageCircle,
  Phone,
  ShieldAlert,
} from "lucide-react";

const contactPhone = "+201033148828";
const whatsappLink = "https://wa.me/201033148828";
const dateLabel = (value: unknown) =>
  value
    ? new Date(value as string | number | Date).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "غير محدد";

export function SubscriptionExpiredView({
  access,
  onLogout,
}: {
  access: any | null | undefined;
  onLogout: () => void;
}) {
  return (
    <div
      className="flex min-h-[75vh] items-center justify-center p-4"
      dir="rtl"
    >
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-[#f0d7d4] bg-white shadow-xl">
        <div className="bg-[#351f25] px-6 py-7 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ffb3aa]/15 text-[#ffb3aa]">
            <ShieldAlert size={24} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">انتهى اشتراك المتجر</h1>
          <p className="mt-2 text-sm leading-7 text-[#f1c6c1]">
            تم إيقاف الوصول إلى شاشات المتجر حتى تجديد الاشتراك. تواصل مع المدير
            لتفعيل الحساب.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="rounded-2xl bg-[#f8fbfa] p-4">
            <div className="text-xs font-bold text-[#819293]">المتجر</div>
            <div className="mt-1 font-extrabold text-[#29464e]">
              {access?.subscription?.supermarketId
                ? `رقم المتجر #${access.subscription.supermarketId}`
                : "حساب المتجر"}
            </div>
            <div className="mt-3 text-xs font-bold text-[#819293]">
              تاريخ الانتهاء
            </div>
            <div className="mt-1 text-sm font-extrabold text-[#a83d42]">
              {dateLabel(access?.effectiveEnd)}
            </div>
            <div className="mt-3 text-xs text-[#829394]">
              حالة الدفع: {access?.isPaid ? "مدفوع" : "غير مدفوع"}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#168b61] px-4 py-3.5 text-sm font-extrabold text-white hover:bg-[#11734f]"
            >
              <MessageCircle size={18} /> تواصل عبر واتساب
            </a>
            <a
              href={`tel:${contactPhone}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe9e5] px-4 py-3.5 text-sm font-extrabold text-[#29464e] hover:bg-[#f4f8f6]"
            >
              <Phone size={18} /> اتصال {contactPhone}
            </a>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3f6f5] px-4 py-3 text-xs font-bold text-[#617679]"
          >
            <LogOut size={15} /> تسجيل الخروج
          </button>
        </div>
      </section>
    </div>
  );
}

export function SubscriptionView() {
  const query = trpc.subscription.access.useQuery(undefined, { retry: false });
  const access = query.data;
  if (query.isLoading)
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-[#829394]">
        جارٍ تحميل حالة الاشتراك...
      </div>
    );
  if (!access)
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-[#829394]">
        لا توجد بيانات اشتراك مرتبطة بهذا الحساب.
      </div>
    );
  return (
    <section
      className="soft-shadow mx-auto max-w-2xl rounded-2xl border border-[#e0e9e6] bg-white p-6"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${access.isActive ? "bg-[#e7f6f0] text-[#267a60]" : "bg-[#fce8e7] text-[#a83d42]"}`}
        >
          {access.isActive ? (
            <CheckCircle2 size={23} />
          ) : (
            <CreditCard size={23} />
          )}
        </div>
        <div>
          <h2 className="font-extrabold text-[#29464e]">اشتراك المتجر</h2>
          <p className="mt-1 text-xs text-[#829394]">
            {access.plan?.name || "الخطة الحالية"}
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[#f8fbfa] p-4">
          <div className="text-[11px] font-bold text-[#829394]">
            حالة الوصول
          </div>
          <div
            className={`mt-1 text-sm font-extrabold ${access.isActive ? "text-[#267a60]" : "text-[#a83d42]"}`}
          >
            {access.isActive ? "نشط" : "منتهي أو موقوف"}
          </div>
        </div>
        <div className="rounded-xl bg-[#f8fbfa] p-4">
          <div className="text-[11px] font-bold text-[#829394]">حالة الدفع</div>
          <div className="mt-1 text-sm font-extrabold text-[#29464e]">
            {access.isPaid ? "مدفوع" : "غير مدفوع"}
          </div>
        </div>
        <div className="rounded-xl bg-[#f8fbfa] p-4 sm:col-span-2">
          <div className="text-[11px] font-bold text-[#829394]">ينتهي في</div>
          <div className="mt-1 text-sm font-extrabold text-[#29464e]">
            {dateLabel(access.effectiveEnd)}
          </div>
        </div>
      </div>
      {!access.isActive && (
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl bg-[#168b61] px-4 py-3 text-xs font-extrabold text-white"
          >
            <MessageCircle size={15} /> واتساب المدير
          </a>
          <a
            href={`tel:${contactPhone}`}
            className="flex items-center gap-2 rounded-xl border border-[#dfe9e5] px-4 py-3 text-xs font-extrabold text-[#29464e]"
          >
            <Phone size={15} /> {contactPhone}
          </a>
        </div>
      )}
    </section>
  );
}

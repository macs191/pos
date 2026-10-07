import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  CreditCard,
  LogOut,
  MessageCircle,
  Phone,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

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

function SubscriptionRequestPanel() {
  const [note, setNote] = useState("");
  const latestRequest = trpc.subscription.myRequest.useQuery(undefined, {
    retry: false,
  });
  const request = trpc.subscription.request.useMutation({
    onSuccess: async () => {
      toast.success("تم إرسال طلب الاشتراك إلى الإدارة");
      setNote("");
      await latestRequest.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const status = latestRequest.data?.status;
  const pending = status === "PENDING" || status === "PROCESSING";
  const statusLabel =
    status === "PENDING"
      ? "طلبك قيد المراجعة"
      : status === "PROCESSING"
        ? "جارٍ معالجة الطلب"
        : status === "APPROVED"
          ? "تمت الموافقة على آخر طلب"
          : status === "REJECTED"
            ? "تم رفض آخر طلب"
            : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate({ note: note.trim() || undefined });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[#dfe9e5] bg-[#f8fbfa] p-4"
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f5f0] text-[#267a60]">
          <CreditCard size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-[#29464e]">طلب اشتراك أو تجديد</h3>
          <p className="mt-1 text-[11px] leading-5 text-[#7e9092]">
            أرسل الطلب ليظهر في لوحة الإدارة. التفعيل ومراجعة الدفع يدويان؛ لا
            يتم تحصيل أي مبلغ من داخل التطبيق.
          </p>
        </div>
      </div>
      {statusLabel && (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${pending ? "bg-[#fff3cf] text-[#8b6500]" : status === "APPROVED" ? "bg-[#e7f6f0] text-[#267a60]" : "bg-[#f3f6f5] text-[#647a7c]"}`}
        >
          {statusLabel}
          {latestRequest.data?.createdAt
            ? ` · ${dateLabel(latestRequest.data.createdAt)}`
            : ""}
        </div>
      )}
      {!pending && (
        <>
          <label
            htmlFor="subscription-request-note"
            className="mt-3 block text-[11px] font-bold text-[#6f8385]"
          >
            ملاحظة للإدارة (اختياري)
          </label>
          <textarea
            id="subscription-request-note"
            value={note}
            onChange={event => setNote(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="اكتب رسالة مختصرة إن لزم"
            className="mt-1 w-full resize-y rounded-xl border border-[#dfe9e5] bg-white px-3 py-2 text-xs text-[#29464e] outline-none focus:border-[#54b393]"
          />
        </>
      )}
      <button
        type="submit"
        disabled={pending || request.isPending || latestRequest.isLoading}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#0b493c] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send size={14} />
        {pending
          ? "تم استلام الطلب"
          : request.isPending
            ? "جارٍ الإرسال..."
            : "إرسال طلب الاشتراك"}
      </button>
    </form>
  );
}

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
            تم إيقاف الوصول إلى شاشات المتجر حتى تجديد الاشتراك. يمكنك إرسال طلب
            إلى الإدارة أو التواصل مباشرة.
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
          <SubscriptionRequestPanel />
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
      <section
        className="soft-shadow mx-auto max-w-2xl space-y-4 rounded-2xl border border-[#e0e9e6] bg-white p-6"
        dir="rtl"
      >
        <p className="text-sm text-[#829394]">
          لا توجد بيانات اشتراك مرتبطة بهذا الحساب. أرسل طلبًا إلى الإدارة
          لمراجعة التفعيل.
        </p>
        <SubscriptionRequestPanel />
      </section>
    );
  return (
    <section
      className="soft-shadow mx-auto max-w-2xl space-y-5 rounded-2xl border border-[#e0e9e6] bg-white p-6"
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
      <div className="grid gap-3 sm:grid-cols-2">
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
      <SubscriptionRequestPanel />
      {!access.isActive && (
        <div className="flex flex-wrap gap-3">
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

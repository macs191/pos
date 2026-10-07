import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import {
  VoiceCommandButton,
  speakArabic,
} from "@/components/VoiceCommandButton";
import { trpc } from "@/lib/trpc";
import { isSaveVoiceCommand, parseVoiceProductPhrase } from "@shared/voice";
import {
  Barcode,
  Boxes,
  Camera,
  Check,
  Loader2,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type DialogMode = "NEW" | "EXISTING" | null;

const money = (value: number | string | null | undefined) =>
  `${Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export function GlobalProductsView() {
  const [search, setSearch] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [voiceField, setVoiceField] = useState<"name" | "price" | null>(null);
  const input = useMemo(() => ({ search }), [search]);
  const products = trpc.products.list.useQuery(input, { retry: false });

  const closeDialog = () => {
    setDialogMode(null);
    setShowPriceForm(false);
    setVoiceField(null);
  };
  const resumeScanner = () => {
    closeDialog();
    setBarcode("");
    setName("");
    setPrice("");
    window.setTimeout(() => setCameraOpen(true), 180);
  };

  const lookup = trpc.products.lookupByBarcode.useMutation({
    onSuccess: product => {
      setBarcode(product.barcode);
      setName(product.name);
      setPrice(String(product.sellingPrice));
      setDialogMode("EXISTING");
      setShowPriceForm(false);
      setVoiceField(null);
    },
    onError: error => {
      if (error.data?.code === "NOT_FOUND") {
        setName("");
        setPrice("");
        setDialogMode("NEW");
        setShowPriceForm(false);
        setVoiceField("name");
        return;
      }
      toast.error(error.message || "تعذر البحث عن الباركود.");
    },
  });

  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      toast.success(
        "تمت إضافة المنتج إلى الكتالوج العام، وأصبح متاحًا لجميع المتاجر."
      );
      void products.refetch();
      resumeScanner();
    },
    onError: error => {
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") lookup.mutate({ barcode });
    },
  });

  const requestPrice = trpc.products.requestPriceChange.useMutation({
    onSuccess: () => {
      toast.success("أُرسل طلب تغيير السعر إلى مدير المنصة للموافقة.");
      resumeScanner();
    },
    onError: error => toast.error(error.message),
  });

  const openScanner = () => {
    closeDialog();
    setBarcode("");
    setName("");
    setPrice("");
    setCameraOpen(true);
  };

  const handleScan = (value: string) => {
    setCameraOpen(false);
    setBarcode(value);
    setDialogMode(null);
    lookup.mutate({ barcode: value });
  };

  const saveNewProduct = (event?: React.FormEvent) => {
    event?.preventDefault();
    const sellingPrice = Number(price);
    if (!name.trim() || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      toast.error("أدخل اسم المنتج وسعرًا صالحًا.");
      return;
    }
    createProduct.mutate({ barcode, name: name.trim(), sellingPrice });
  };

  const sendPriceRequest = (event?: React.FormEvent) => {
    event?.preventDefault();
    const requestedPrice = Number(price);
    if (!Number.isFinite(requestedPrice) || requestedPrice < 0) {
      toast.error("أدخل السعر المقترح بصورة صحيحة.");
      return;
    }
    requestPrice.mutate({ barcode, requestedPrice });
  };

  const handleVoice = (transcript: string) => {
    if (dialogMode === "NEW") {
      if (isSaveVoiceCommand(transcript)) {
        saveNewProduct();
        return;
      }
      if (voiceField === "name" || !name) {
        setName(transcript.trim());
        setVoiceField("price");
        speakArabic("ما سعر المنتج؟");
        return;
      }
      const spokenPrice = parseVoiceProductPhrase(`سعر ${transcript}`).price;
      if (spokenPrice === undefined) {
        speakArabic("قل السعر، ثم قل احفظ.");
        return;
      }
      setPrice(String(spokenPrice));
      setVoiceField(null);
      speakArabic("تم تسجيل السعر. قل احفظ لإضافة المنتج.");
      return;
    }
    if (dialogMode === "EXISTING") {
      if (isSaveVoiceCommand(transcript)) {
        if (showPriceForm) sendPriceRequest();
        else resumeScanner();
        return;
      }
      const spokenPrice = parseVoiceProductPhrase(`سعر ${transcript}`).price;
      if (spokenPrice === undefined) {
        speakArabic("قل السعر الجديد أو قل احفظ لإنهاء المسح.");
        return;
      }
      setPrice(String(spokenPrice));
      setShowPriceForm(true);
    }
  };

  const currentPrice = Number(lookup.data?.sellingPrice ?? 0);
  const saving = createProduct.isPending || requestPrice.isPending;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-[#071723] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#b8efdc]">
              <Boxes size={15} /> كتالوج مشترك بين المتاجر
            </div>
            <h2 className="mt-2 text-xl font-extrabold sm:text-2xl">
              المنتجات والأسعار العامة
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-[#a9c0c1]">
              امسح الباركود؛ أضف الاسم والسعر إذا كان جديدًا. طلب تغيير سعر منتج
              موجود يظل معلقًا حتى موافقة مدير المنصة.
            </p>
          </div>
          <button
            type="button"
            onClick={openScanner}
            className="flex items-center gap-2 rounded-xl bg-[#b8efdc] px-4 py-3 text-sm font-extrabold text-[#08231e] hover:bg-[#d4faec]"
          >
            <Camera size={17} /> إضافة منتج بالباركود
          </button>
        </div>
      </section>

      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8efed] px-5 py-4">
          <div>
            <h3 className="font-extrabold text-[#29464e]">كتالوج المنتجات</h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              كل منتج يظهر لجميع المستخدمين بعد حفظه
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]"
              size={16}
            />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الباركود"
              className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]"
            />
          </div>
        </div>
        {products.isLoading ? (
          <div className="p-10 text-center text-xs text-[#829394]">
            جارٍ تحميل الكتالوج...
          </div>
        ) : products.isError ? (
          <div className="p-8 text-center text-xs text-[#a83d42]">
            تعذر تحميل المنتجات. تحقق من الاتصال ثم أعد المحاولة.
          </div>
        ) : products.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
                <tr>
                  <th className="px-5 py-3">المنتج</th>
                  <th className="px-5 py-3">الباركود</th>
                  <th className="px-5 py-3">السعر العام</th>
                  <th className="px-5 py-3">نوع المنتج</th>
                </tr>
              </thead>
              <tbody>
                {products.data.map(product => (
                  <tr
                    key={product.id}
                    className="border-t border-[#eef3f1] text-xs"
                  >
                    <td className="px-5 py-3 font-extrabold text-[#34515a]">
                      {product.name}
                    </td>
                    <td className="mono px-5 py-3 text-[#819293]">
                      {product.barcode}
                    </td>
                    <td className="px-5 py-3 font-extrabold text-[#29464e]">
                      {money(product.sellingPrice)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">
                        قطعة · مشترك
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f6f1] text-[#0f6e58]">
              <Barcode size={22} />
            </div>
            <div className="font-extrabold text-[#304b52]">
              لا توجد منتجات في هذا البحث
            </div>
            <p className="mt-2 max-w-sm text-xs leading-6 text-[#7b8d8e]">
              امسح باركود منتج لإضافته إلى الكتالوج العام. لا يتم حفظ المخزون أو
              الوزن.
            </p>
          </div>
        )}
      </section>

      <VoiceCommandButton
        onTranscript={handleVoice}
        prompt={
          dialogMode === "NEW"
            ? voiceField === "price"
              ? "قل السعر، ثم قل احفظ"
              : "قل اسم المنتج"
            : "تحدث لإدخال السعر أو قل احفظ"
        }
        className="fixed bottom-20 left-4 z-[45] shadow-xl lg:bottom-5"
      />
      <BarcodeCameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={handleScan}
        scanMode="single"
      />

      {dialogMode && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#031018]/75 p-4 backdrop-blur-sm"
          dir="rtl"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-dialog-title"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-[#dce9e4] bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e8efed] px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#287e64]">
                  <Tag size={14} />{" "}
                  {dialogMode === "NEW"
                    ? "منتج جديد"
                    : "منتج موجود في الكتالوج"}
                </div>
                <h2
                  id="catalog-dialog-title"
                  className="mt-1 text-lg font-extrabold text-[#29464e]"
                >
                  {dialogMode === "NEW"
                    ? "إضافة بيانات المنتج"
                    : "بيانات المنتج والسعر"}
                </h2>
              </div>
              <button
                type="button"
                onClick={resumeScanner}
                aria-label="إغلاق والعودة للماسح"
                className="rounded-lg p-2 text-[#819293] hover:bg-[#f1f6f4]"
              >
                <X size={18} />
              </button>
            </header>
            {dialogMode === "NEW" ? (
              <form onSubmit={saveNewProduct} className="space-y-4 p-5">
                <div className="rounded-xl bg-[#f4f8f6] px-3 py-2">
                  <div className="text-[10px] font-bold text-[#829394]">
                    الباركود الممسوح
                  </div>
                  <div className="mono mt-1 text-sm font-extrabold text-[#29464e]">
                    {barcode}
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
                    اسم المنتج
                  </span>
                  <input
                    required
                    autoFocus
                    minLength={2}
                    maxLength={200}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="مثال: مياه معدنية"
                    className="w-full rounded-xl border border-[#dfe9e5] px-3 py-3 text-sm outline-none focus:border-[#77bca8]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
                    السعر فقط
                  </span>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={price}
                    onChange={event => setPrice(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-[#dfe9e5] px-3 py-3 text-sm outline-none focus:border-[#77bca8]"
                  />
                </label>
                <p className="text-[11px] leading-5 text-[#849596]">
                  سيظهر هذا المنتج وسعره مباشرة لجميع المتاجر بعد الحفظ. لا يتم
                  تسجيل كمية أو وزن.
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] py-3 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}{" "}
                    حفظ والعودة للمسح
                  </button>
                  <button
                    type="button"
                    onClick={resumeScanner}
                    className="rounded-xl border border-[#dfe9e5] px-4 text-xs font-bold text-[#526c70]"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 p-5">
                <div className="rounded-xl bg-[#f4f8f6] px-3 py-3">
                  <div className="mono text-[11px] text-[#819293]">
                    {barcode}
                  </div>
                  <div className="mt-1 font-extrabold text-[#29464e]">
                    {name || lookup.data?.name}
                  </div>
                  <div className="mt-1 text-xs font-bold text-[#287e64]">
                    السعر الحالي: {money(currentPrice)}
                  </div>
                </div>
                {showPriceForm ? (
                  <form onSubmit={sendPriceRequest} className="space-y-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
                        السعر الجديد المقترح
                      </span>
                      <input
                        required
                        min="0"
                        step="0.01"
                        type="number"
                        value={price}
                        onChange={event => setPrice(event.target.value)}
                        className="w-full rounded-xl border border-[#dfe9e5] px-3 py-3 text-sm outline-none focus:border-[#77bca8]"
                      />
                    </label>
                    <div className="rounded-xl border border-[#f0dca6] bg-[#fff8e7] px-3 py-2 text-[11px] leading-5 text-[#8c690f]">
                      لن يتغير السعر المشترك الآن؛ سيصل الطلب إلى مدير المنصة
                      للمراجعة والموافقة.
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={requestPrice.isPending}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] py-3 text-sm font-extrabold text-white disabled:opacity-50"
                      >
                        {requestPrice.isPending ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Check size={16} />
                        )}{" "}
                        إرسال طلب الموافقة
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPriceForm(false)}
                        className="rounded-xl border border-[#dfe9e5] px-4 text-xs font-bold text-[#526c70]"
                      >
                        رجوع
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPriceForm(true);
                        setPrice("");
                        setVoiceField("price");
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#fff3cf] py-3 text-sm font-extrabold text-[#8b6500]"
                    >
                      هل تغير سعر المنتج؟ اقترح سعرًا جديدًا
                    </button>
                    <button
                      type="button"
                      onClick={resumeScanner}
                      className="rounded-xl border border-[#dfe9e5] py-3 text-sm font-bold text-[#526c70]"
                    >
                      السعر صحيح — مسح منتج آخر
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

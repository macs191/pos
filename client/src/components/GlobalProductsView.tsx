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
  Edit3,
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
  const [manualEntry, setManualEntry] = useState(false);
  const [voiceField, setVoiceField] = useState<"name" | "price" | null>(null);
  const input = useMemo(() => ({ search }), [search]);
  const products = trpc.products.list.useQuery(input, { retry: false });
  const myPriceRequests = trpc.products.myPriceChangeRequests.useQuery(undefined, { retry: false });
  const [recentlyAddedBarcode, setRecentlyAddedBarcode] = useState<string | null>(null);
  const latestPriceRequestByBarcode = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof myPriceRequests.data>[number]>();
    for (const request of myPriceRequests.data ?? []) {
      if (!request?.barcode || latest.has(request.barcode)) continue;
      latest.set(request.barcode, request);
    }
    return latest;
  }, [myPriceRequests.data]);

  const closeDialog = () => {
    setDialogMode(null);
    setShowPriceForm(false);
    setVoiceField(null);
  };
  const clearProductFields = () => {
    setBarcode("");
    setName("");
    setPrice("");
  };
  const closeManualEntry = () => {
    closeDialog();
    setCameraOpen(false);
    setManualEntry(false);
    clearProductFields();
  };
  const resumeScanner = () => {
    closeDialog();
    setManualEntry(false);
    clearProductFields();
    window.setTimeout(() => setCameraOpen(true), 180);
  };
  const finishCurrentFlow = () => {
    if (manualEntry) closeManualEntry();
    else resumeScanner();
  };
  const cancelDialog = () => {
    if (manualEntry) closeManualEntry();
    else resumeScanner();
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
      setRecentlyAddedBarcode(barcode);
      window.setTimeout(() => setRecentlyAddedBarcode(current => current === barcode ? null : current), 10000);
      void products.refetch();
      finishCurrentFlow();
    },
    onError: error => {
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") lookup.mutate({ barcode });
    },
  });

  const requestPrice = trpc.products.requestPriceChange.useMutation({
    onSuccess: () => {
      toast.success("أُرسل طلب تغيير السعر إلى مدير المنصة للموافقة.");
      void myPriceRequests.refetch();
      finishCurrentFlow();
    },
    onError: error => toast.error(error.message),
  });

  const openScanner = () => {
    closeDialog();
    setManualEntry(false);
    clearProductFields();
    setCameraOpen(true);
  };

  const openManualEntry = () => {
    closeDialog();
    setCameraOpen(false);
    setManualEntry(true);
    clearProductFields();
    setVoiceField("name");
    setDialogMode("NEW");
  };

  const handleScan = (value: string) => {
    setCameraOpen(false);
    setManualEntry(false);
    setBarcode(value);
    setDialogMode(null);
    lookup.mutate({ barcode: value });
  };

  const saveNewProduct = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (createProduct.isPending) return;
    if (!barcode.trim()) {
      toast.error("أدخل رقم الباركود أو امسحه بالكاميرا.");
      return;
    }
    const sellingPrice = Number(price);
    if (!name.trim() || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      toast.error("أدخل اسم المنتج وسعرًا صالحًا.");
      return;
    }
    createProduct.mutate({ barcode, name: name.trim(), sellingPrice });
  };

  const sendPriceRequest = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (requestPrice.isPending) return;
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
      const phrase = parseVoiceProductPhrase(transcript);
      const spokenPrice =
        phrase.price ?? parseVoiceProductPhrase(`سعر ${transcript}`).price;
      if (spokenPrice !== undefined) {
        const recognizedName = phrase.price !== undefined ? phrase.name : "";
        if (recognizedName) setName(recognizedName);
        setPrice(String(spokenPrice));
        setVoiceField(recognizedName || name.trim() ? null : "name");
        speakArabic(
          recognizedName || name.trim()
            ? "تم تسجيل اسم المنتج وسعره. قل احفظ لإضافته."
            : "تم تسجيل السعر. قل اسم المنتج."
        );
        return;
      }
      if (voiceField === "name" || !name.trim()) {
        const spokenName = phrase.name || transcript.trim();
        setName(spokenName);
        setVoiceField("price");
        speakArabic("تم تسجيل الاسم. ما سعر المنتج؟");
        return;
      }
      speakArabic("قل السعر بالأرقام أو بالكلمات، ثم قل احفظ.");
      return;
    }
    if (dialogMode === "EXISTING") {
      if (isSaveVoiceCommand(transcript)) {
        if (showPriceForm) sendPriceRequest();
        else resumeScanner();
        return;
      }
      const spokenPrice =
        parseVoiceProductPhrase(transcript).price ??
        parseVoiceProductPhrase(`سعر ${transcript}`).price;
      if (spokenPrice === undefined) {
        speakArabic("قل السعر الجديد أو قل احفظ لإنهاء المسح.");
        return;
      }
      setPrice(String(spokenPrice));
      setShowPriceForm(true);
    }
  };

  const currentPrice = Number(lookup.data?.sellingPrice ?? 0);
  const currentPriceRequest = latestPriceRequestByBarcode.get(barcode);
  const saving = createProduct.isPending || requestPrice.isPending;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#071723] via-[#0b2a38] to-[#0d5948] p-5 text-white shadow-[0_18px_55px_rgba(7,23,35,0.16)] sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-24 h-64 w-64 rounded-full border-[34px] border-[#b8efdc]/[0.07]" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-48 w-48 rounded-full bg-[#b8efdc]/[0.05] blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#b8efdc]/20 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#c8f4e5]">
              <Boxes size={14} /> كتالوج مشترك بين المتاجر
            </div>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              المنتجات والأسعار العامة
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-6 text-[#bfd2d2]">
              امسح الباركود بالكاميرا الخلفية افتراضيًا (مع إمكانية التبديل للأمامية) أو أدخله يدويًا، ثم اكتب أو
              استخدم الإملاء الصوتي لاسم المنتج وسعره. طلبات تغيير الأسعار تظل
              بانتظار موافقة المدير.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-black/15 px-3 py-1.5 text-[11px] text-[#c4d9d6]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b8efdc]" />
              {products.data?.length ?? 0} منتج ظاهر في هذا البحث
            </div>
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-[330px] lg:grid-cols-1">
            <button
              type="button"
              onClick={openScanner}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#b8efdc] px-5 py-3.5 text-sm font-extrabold text-[#08231e] shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#d4faec]"
            >
              <Camera size={18} /> مسح بالكاميرا
            </button>
            <button
              type="button"
              onClick={openManualEntry}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.08] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.14]"
            >
              <Edit3 size={17} /> إضافة يدويًا أو بالصوت
            </button>
          </div>
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
                  <th className="px-5 py-3">حالة السعر</th>
                </tr>
              </thead>
              <tbody>
                {products.data.map(product => {
                  const request = latestPriceRequestByBarcode.get(product.barcode);
                  const status = recentlyAddedBarcode === product.barcode
                    ? { label: "أُضيف الآن · مشترك", style: "bg-[#e7f6f0] text-[#2a8064]" }
                    : request?.status === "PENDING" || request?.status === "PROCESSING"
                      ? { label: "طلبك قيد المراجعة", style: "bg-[#fff3cf] text-[#8b6500]" }
                      : request?.status === "APPROVED"
                        ? { label: "اعتمد المدير السعر", style: "bg-[#e7f6f0] text-[#2a8064]" }
                        : request?.status === "REJECTED"
                          ? { label: "رُفض آخر مقترح", style: "bg-[#fce8e7] text-[#a83d42]" }
                          : { label: "سعر عام", style: "bg-[#eff4f2] text-[#526c70]" };
                  return (
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
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status.style}`}>
                        {status.label}
                      </span>
                      {request?.status === "PENDING" && (
                        <div className="mt-1 text-[10px] text-[#8a7a4b]">مقترح: {money(request.requestedPrice)}</div>
                      )}
                      {request?.reviewedAt && (request.status === "APPROVED" || request.status === "REJECTED") && (
                        <div className="mt-1 text-[10px] text-[#93a3a3]">{new Date(request.reviewedAt).toLocaleDateString("ar-EG")}</div>
                      )}
                    </td>
                  </tr>
                  );
                })}
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
              ابدأ بمسح الباركود أو أدخله يدويًا لإضافة المنتج إلى الكتالوج
              العام. لا يتم حفظ المخزون أو الوزن.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={openScanner}
                className="flex items-center gap-2 rounded-xl bg-[#0f5d4d] px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <Camera size={15} /> مسح باركود
              </button>
              <button
                type="button"
                onClick={openManualEntry}
                className="flex items-center gap-2 rounded-xl border border-[#dce9e4] bg-white px-4 py-2.5 text-xs font-bold text-[#42615e]"
              >
                <Edit3 size={14} /> إدخال يدوي
              </button>
            </div>
          </div>
        )}
      </section>

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
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-[#dce9e4] bg-white shadow-2xl"
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
                onClick={cancelDialog}
                aria-label={
                  manualEntry ? "إغلاق نموذج الإضافة" : "إغلاق والعودة للماسح"
                }
                className="rounded-lg p-2 text-[#819293] hover:bg-[#f1f6f4]"
              >
                <X size={18} />
              </button>
            </header>
            {dialogMode === "NEW" ? (
              <form onSubmit={saveNewProduct} className="space-y-4 p-5">
                {manualEntry ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
                      رقم الباركود
                    </span>
                    <input
                      required
                      autoFocus
                      inputMode="numeric"
                      minLength={3}
                      maxLength={80}
                      value={barcode}
                      onChange={event => setBarcode(event.target.value)}
                      placeholder="اكتب رقم الباركود"
                      className="mono w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] px-3 py-3 text-sm outline-none focus:border-[#77bca8]"
                    />
                  </label>
                ) : (
                  <div className="rounded-xl bg-[#f4f8f6] px-3 py-2">
                    <div className="text-[10px] font-bold text-[#829394]">
                      الباركود الممسوح
                    </div>
                    <div className="mono mt-1 text-sm font-extrabold text-[#29464e]">
                      {barcode}
                    </div>
                  </div>
                )}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
                    اسم المنتج
                  </span>
                  <input
                    required
                    autoFocus={!manualEntry}
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
                <div className="space-y-3 rounded-2xl border border-[#cfe4dc] bg-gradient-to-br from-[#f0faf5] to-[#f7fbf9] p-3">
                  <div>
                    <div className="text-xs font-extrabold text-[#235d4b]">
                      الإدخال بالصوت
                    </div>
                    <p className="mt-1 text-[10px] leading-5 text-[#6f8982]">
                      {voiceField === "price"
                        ? "قل السعر الآن، أو انطق اسم المنتج والسعر معًا."
                        : !name.trim()
                          ? "قل اسم المنتج، ويمكنك نطق السعر في الجملة نفسها."
                          : !price
                            ? "اكتب أو انطق السعر المقترح للمنتج."
                            : "راجع الاسم والسعر، ثم قل «احفظ» أو اضغط زر الحفظ."}
                    </p>
                  </div>
                  <VoiceCommandButton
                    onTranscript={handleVoice}
                    prompt={
                      voiceField === "price"
                        ? "قل السعر، أو قل اسم المنتج والسعر معًا"
                        : !name.trim()
                          ? "قل اسم المنتج، ويمكنك ذكر السعر معه"
                          : !price
                            ? "قل السعر أو اسم المنتج والسعر معًا"
                            : "قل احفظ لإضافة المنتج"
                    }
                    className="w-full justify-center py-2.5"
                    speakPrompt={false}
                  />
                </div>
                <p className="text-[11px] leading-5 text-[#849596]">
                  سيظهر المنتج وسعره لجميع المتاجر بعد الحفظ. لا يتم تسجيل كمية
                  أو وزن.
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
                    {manualEntry ? "حفظ المنتج" : "حفظ والعودة للمسح"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDialog}
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
                {currentPriceRequest && (
                  <div className={`rounded-xl px-3 py-2 text-[11px] leading-5 ${currentPriceRequest.status === "PENDING" || currentPriceRequest.status === "PROCESSING" ? "border border-[#f0dca6] bg-[#fff8e7] text-[#8c690f]" : currentPriceRequest.status === "APPROVED" ? "border border-[#cfe4dc] bg-[#f0faf5] text-[#235d4b]" : "border border-[#f0d8d8] bg-[#fff2ef] text-[#8d3d40]"}`}>
                    {currentPriceRequest.status === "PENDING" || currentPriceRequest.status === "PROCESSING"
                      ? `طلب تغيير السعر الذي أرسله متجرك قيد المراجعة. السعر المقترح ${money(currentPriceRequest.requestedPrice)}.`
                      : currentPriceRequest.status === "APPROVED"
                        ? `اعتمد المدير آخر طلب لمتجرك بتاريخ ${currentPriceRequest.reviewedAt ? new Date(currentPriceRequest.reviewedAt).toLocaleDateString("ar-EG") : "غير محدد"}.`
                        : `رُفض آخر طلب سعر لمتجرك بتاريخ ${currentPriceRequest.reviewedAt ? new Date(currentPriceRequest.reviewedAt).toLocaleDateString("ar-EG") : "غير محدد"}. يمكنك إرسال مقترح جديد.`}
                  </div>
                )}
                <div className="space-y-2 rounded-2xl border border-[#cfe4dc] bg-[#f4faf7] p-3">
                  <p className="text-[10px] leading-5 text-[#6f8982]">
                    استخدم الصوت لنطق السعر المقترح أو لإنهاء المسح صوتيًا.
                  </p>
                  <VoiceCommandButton
                    onTranscript={handleVoice}
                    prompt={
                      showPriceForm
                        ? "قل السعر الجديد أو قل احفظ لإرسال الطلب"
                        : "قل السعر المقترح أو قل احفظ للعودة للماسح"
                    }
                    className="w-full justify-center py-2.5"
                    speakPrompt={false}
                  />
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
                    {currentPriceRequest?.status === "PENDING" || currentPriceRequest?.status === "PROCESSING" ? null : (
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
                    )}
                    <button
                      type="button"
                      onClick={cancelDialog}
                      className="rounded-xl border border-[#dfe9e5] py-3 text-sm font-bold text-[#526c70]"
                    >
                      {manualEntry
                        ? "السعر صحيح — إغلاق"
                        : "السعر صحيح — مسح منتج آخر"}
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

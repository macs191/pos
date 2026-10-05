import { useCallback, useMemo, useState } from "react";
import { Camera, Check, PackagePlus, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";

type CatalogItem = { id: string; name: string; barcode: string; sellingPrice: number | string; isActive?: boolean };

const money = (value: number | string) => `${Number(value).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export function CatalogProductsView() {
  const [search, setSearch] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [matchedProduct, setMatchedProduct] = useState<CatalogItem | null>(null);
  const input = useMemo(() => ({ search }), [search]);
  const products = trpc.products.list.useQuery(input, { retry: false });
  const lookup = trpc.products.lookupByBarcode.useMutation({
    onSuccess: product => {
      setMatchedProduct(product as CatalogItem);
      setName(product.name);
      setPrice("");
      setDialogOpen(true);
    },
    onError: error => {
      if (error.data?.code === "NOT_FOUND") {
        setMatchedProduct(null);
        setName("");
        setPrice("");
        setDialogOpen(true);
      } else {
        toast.error(error.message);
      }
    },
  });
  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      toast.success("تمت إضافة المنتج إلى الكتالوج المشترك");
      void products.refetch();
      continueScanning();
    },
    onError: error => toast.error(error.message),
  });
  const requestPrice = trpc.products.requestPriceChange.useMutation({
    onSuccess: () => {
      toast.success("أُرسل طلب تغيير السعر إلى مدير الموقع للمراجعة");
      continueScanning();
    },
    onError: error => toast.error(error.message),
  });

  const continueScanning = useCallback(() => {
    setDialogOpen(false);
    setMatchedProduct(null);
    setBarcode("");
    setName("");
    setPrice("");
    window.setTimeout(() => setCameraOpen(true), 120);
  }, []);

  const onDetected = useCallback((value: string) => {
    const scanned = value.trim();
    if (!scanned) return;
    setCameraOpen(false);
    setBarcode(scanned);
    lookup.mutate({ barcode: scanned });
  }, [lookup]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("أدخل سعرًا صحيحًا.");
      return;
    }
    if (matchedProduct) requestPrice.mutate({ barcode: matchedProduct.barcode, proposedPrice: parsedPrice });
    else createProduct.mutate({ barcode, name: name.trim(), sellingPrice: parsedPrice });
  };

  const closeDialog = () => continueScanning();
  const saving = createProduct.isPending || requestPrice.isPending || lookup.isPending;

  return <div className="space-y-5">
    <section className="flex flex-col gap-4 rounded-2xl bg-[#0e4d45] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-2 text-sm font-extrabold"><Tag size={17} /> كتالوج موحّد لجميع المستخدمين</div><p className="mt-1 text-xs leading-6 text-[#c4e3dc]">المنتج والباركود والسعر الأساسي مشتركة. تغيير سعر منتج موجود يحتاج اعتماد مدير الموقع.</p></div>
      <button type="button" onClick={() => setCameraOpen(true)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#b8efdc] px-5 py-3 text-sm font-extrabold text-[#08231e]"><Camera size={17} /> إضافة منتج / مسح باركود</button>
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8efed] px-5 py-4"><div><h3 className="font-extrabold text-[#29464e]">المنتجات العامة</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">{products.data?.length ?? 0} منتج ظاهر للمستخدمين</p></div><div className="relative w-full max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الباركود" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" /></div></div>
      {products.isLoading ? <div className="p-10 text-center text-xs text-[#829394]">جارٍ تحميل الكتالوج...</div> : products.data?.length ? <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">اسم المنتج</th><th className="px-5 py-3">الباركود / رقم المنتج</th><th className="px-5 py-3">السعر المعتمد</th><th className="px-5 py-3">الحالة</th></tr></thead><tbody>{products.data.map(product => <tr key={product.id} className="border-t border-[#eef3f1] text-xs"><td className="px-5 py-4 font-extrabold text-[#34515a]">{product.name}</td><td className="mono px-5 py-4 text-[#819293]">{product.barcode}</td><td className="px-5 py-4 font-extrabold text-[#29464e]">{money(product.sellingPrice)}</td><td className="px-5 py-4"><span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">متاح للجميع</span></td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><PackagePlus className="mx-auto mb-3 text-[#4e9a7d]" size={28} /><p className="font-extrabold text-[#34515a]">لا توجد منتجات مطابقة</p><p className="mt-1 text-xs text-[#829394]">امسح الباركود لإضافة منتج جديد إلى الكتالوج المشترك.</p></div>}
    </section>

    <BarcodeCameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={onDetected} mode="catalog" />
    {dialogOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#031018]/75 p-4 backdrop-blur-sm" dir="rtl"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#dce9e4] bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><div className="text-lg font-extrabold text-[#193a40]">{matchedProduct ? "طلب تغيير سعر المنتج" : "إضافة منتج جديد"}</div><p className="mt-1 text-xs text-[#758b8d]">الباركود / رقم المنتج</p></div><button type="button" onClick={closeDialog} className="rounded-lg px-2 text-xl text-[#789092]" aria-label="إغلاق">×</button></div>
      <div className="mono mt-4 rounded-xl bg-[#edf7f3] px-4 py-3 text-center text-lg font-extrabold tracking-wide text-[#17664f]">{barcode}</div>
      {matchedProduct ? <><div className="mt-4 rounded-xl border border-[#e5eeea] bg-[#f8fbfa] p-3"><div className="text-sm font-extrabold text-[#34515a]">{matchedProduct.name}</div><div className="mt-1 text-xs text-[#718588]">السعر الحالي: <strong>{money(matchedProduct.sellingPrice)}</strong></div></div><p className="mt-3 text-xs leading-5 text-[#718588]">هل تغيّر السعر؟ أدخل السعر المقترح. لن يتغير السعر العام قبل موافقة مدير الموقع.</p></> : <p className="mt-4 text-xs leading-5 text-[#718588]">هذا الباركود غير موجود. أضف الاسم والسعر فقط؛ وسيظهر المنتج في الكتالوج المشترك.</p>}
      {!matchedProduct && <label className="mt-4 block text-xs font-bold text-[#597175]">اسم المنتج<input required minLength={2} maxLength={200} value={name} onChange={event => setName(event.target.value)} autoFocus className="mt-1.5 w-full rounded-xl border border-[#dfe9e5] px-3 py-3 text-sm outline-none focus:border-[#77bca8]" placeholder="مثال: مياه معدنية" /></label>}
      <label className="mt-4 block text-xs font-bold text-[#597175]">{matchedProduct ? "السعر الجديد المقترح" : "السعر"}<input required min="0" step="0.01" type="number" value={price} onChange={event => setPrice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe9e5] px-3 py-3 text-sm outline-none focus:border-[#77bca8]" placeholder="0.00" /></label>
      <div className="mt-6 flex gap-2"><button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] py-3 text-sm font-extrabold text-white disabled:opacity-50"><Check size={16} />{saving ? "جارٍ الحفظ..." : matchedProduct ? "إرسال للموافقة" : "حفظ وفتح الكاميرا"}</button><button type="button" onClick={closeDialog} className="rounded-xl border border-[#dbe5e1] px-4 text-xs font-bold text-[#617679]">إلغاء</button></div>
    </form></div>}
  </div>;
}

import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { addProductToCart, cartSubtotal } from "@shared/pos";
import { buildInvoiceAnnouncement } from "@shared/voice";
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpLeft,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronLeft,
  Camera,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type CartLine = {
  id: number;
  name: string;
  barcode: string;
  price: number;
  qty: number;
  stock: number;
  unit: string;
};

type NavItem = { path: string; label: string; icon: typeof LayoutDashboard; group?: string };

const navItems: NavItem[] = [
  { path: "/pos", label: "نقطة البيع", icon: ShoppingCart, group: "التشغيل" },
  { path: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, group: "التشغيل" },
  { path: "/products", label: "المنتجات", icon: Boxes, group: "إدارة المتجر" },
  { path: "/inventory", label: "المخزون", icon: ClipboardList, group: "إدارة المتجر" },
  { path: "/invoices", label: "الفواتير", icon: Receipt, group: "إدارة المتجر" },
  { path: "/reports", label: "التقارير", icon: BarChart3, group: "إدارة المتجر" },
  { path: "/users", label: "المستخدمون", icon: Users, group: "الإعدادات" },
  { path: "/branches", label: "الفروع", icon: Building2, group: "الإعدادات" },
  { path: "/subscriptions", label: "الاشتراك", icon: CreditCard, group: "الإعدادات" },
  { path: "/settings", label: "إعدادات المتجر", icon: Settings, group: "الإعدادات" },
];

const money = (value: number | string | null | undefined) => `${Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const integer = (value: number | string | null | undefined) => Number(value ?? 0).toLocaleString("ar-EG");
const today = () => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return <button onClick={onClick} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dbe5e1] bg-white text-[#466269] hover:border-[#94c6b7] hover:text-[#0f5d4d]">{children}</button>;
}

function PublicWelcome({ loading }: { loading: boolean }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#071723] text-[#effbf7]" dir="rtl">
      <div className="absolute inset-0 dot-grid" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b8efdc] text-[#08231e]"><Store size={22} /></div><div><div className="font-extrabold tracking-tight">سوقي</div><div className="text-xs text-[#9ab3b6]">نظام تشغيل متجرك</div></div></div>
          <button onClick={() => startLogin()} className="rounded-xl border border-[#3b5964] px-4 py-2 text-sm font-bold text-[#d7e9e4] hover:bg-[#123245]">{loading ? "جارٍ التحميل" : "تسجيل الدخول"}</button>
        </header>
        <main className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#335469] bg-[#0d2a3a] px-3 py-1.5 text-xs font-bold text-[#b8efdc]"><Zap size={14} /> كاشير أسرع. قرارات أوضح.</div>
            <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.18] tracking-[-0.04em] md:text-7xl">كل عملية بيع،<br /><span className="text-[#b8efdc]">في نبضة واحدة.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#a9c0c1]">من أول مسح للباركود حتى طباعة الفاتورة وتحديث المخزون. منصة تشغيل عربية مصممة لتبقى يد الكاشير على الماسح.</p>
            <div className="mt-9 flex flex-wrap gap-3"><button onClick={() => startLogin()} className="flex items-center gap-2 rounded-xl bg-[#b8efdc] px-5 py-3.5 font-extrabold text-[#08231e] shadow-[0_12px_30px_rgba(184,239,220,0.16)] hover:bg-[#d4faec]">ابدأ الآن <ChevronLeft size={18} /></button><div className="flex items-center gap-2 rounded-xl border border-[#294958] px-4 py-3 text-sm text-[#b7cacc]"><ShieldCheck size={16} className="text-[#ffda73]" /> عزل بيانات كل متجر</div></div>
            <div className="mt-14 grid max-w-lg grid-cols-3 gap-5 border-t border-[#244250] pt-6"><div><div className="text-2xl font-extrabold">0.2s</div><div className="mt-1 text-xs text-[#8ca7a9]">استجابة المسح</div></div><div><div className="text-2xl font-extrabold">100%</div><div className="mt-1 text-xs text-[#8ca7a9]">حفظ ذري للفواتير</div></div><div><div className="text-2xl font-extrabold">RTL</div><div className="mt-1 text-xs text-[#8ca7a9]">واجهة عربية أصلية</div></div></div>
          </section>
          <section className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 rounded-[3rem] bg-[#b8efdc]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-[#2b4b58] bg-[#0b2534] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between border-b border-[#254450] pb-4"><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-[#b8efdc]" /><span className="text-xs font-bold text-[#b1c8c7]">نقطة البيع · الفرع الرئيسي</span></div><span className="mono text-xs text-[#6d8b8f]">09:41:24</span></div>
              <div className="py-6"><div className="mb-3 text-xs font-bold text-[#9cb7b7]">جاهز للمسح</div><div className="rounded-2xl border border-[#5da993] bg-[#0e3341] p-5"><div className="flex items-center gap-3"><Search size={21} className="text-[#b8efdc]" /><span className="mono text-lg text-[#e8f8f2]">6221234567890</span><div className="mr-auto h-2 w-2 animate-pulse rounded-full bg-[#b8efdc]" /></div></div></div>
              <div className="space-y-2"><MiniReceipt name="مياه معدنية ١.٥ لتر" price="5.00" qty="2" /><MiniReceipt name="أرز بسمتي ٥ كجم" price="185.00" qty="1" /><MiniReceipt name="مناديل مطبخ" price="42.50" qty="1" /></div>
              <div className="mt-6 flex items-end justify-between border-t border-[#254450] pt-5"><div><div className="text-xs text-[#8fa9aa]">إجمالي الفاتورة</div><div className="mt-1 text-3xl font-extrabold text-[#b8efdc]">237.50 <span className="text-sm font-semibold">ج.م</span></div></div><div className="rounded-xl bg-[#b8efdc] px-4 py-2 text-xs font-extrabold text-[#08231e]">تمت الإضافة ✓</div></div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function MiniReceipt({ name, price, qty }: { name: string; price: string; qty: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-[#102e3d] px-3 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#183b4b] text-[#b8efdc]"><PackagePlus size={15} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[#e5f1ee]">{name}</div><div className="text-[11px] text-[#87a2a6]">الكمية: {qty}</div></div><div className="mono text-sm font-semibold text-[#d8eee8]">{price}</div></div>;
}

function Sidebar({ path, navigate, role, onLogout }: { path: string; navigate: (path: string) => void; role: string; onLogout: () => void }) {
  const groups = Array.from(new Set(navItems.map(item => item.group)));
  return <aside className="hidden w-[264px] shrink-0 flex-col bg-[#071723] text-[#e5f3ef] lg:flex">
    <div className="flex items-center gap-3 px-6 py-7"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b8efdc] text-[#08231e]"><Store size={20} /></div><div><div className="font-extrabold tracking-tight">سوقي</div><div className="text-[11px] text-[#86a3a6]">إدارة المتجر بوضوح</div></div></div>
    <div className="mx-4 mb-5 rounded-2xl border border-[#214150] bg-[#0d2938] p-3"><div className="flex items-center gap-2 text-xs font-bold"><div className="h-2 w-2 rounded-full bg-[#b8efdc]" /> متجر النور</div><div className="mt-2 flex items-center justify-between text-[11px] text-[#86a3a6]"><span>الخطة المجانية</span><span className="rounded-full bg-[#173c4b] px-2 py-0.5 text-[#b8efdc]">نشطة</span></div></div>
    <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">{groups.map(group => <div key={group} className="mb-5"><div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#648286]">{group}</div>{navItems.filter(item => item.group === group).map(item => { const Icon = item.icon; const active = path === item.path || (path === "/" && item.path === "/pos"); return <button key={item.path} onClick={() => navigate(item.path)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-[#b8efdc] text-[#08231e] shadow-[0_8px_20px_rgba(184,239,220,0.1)]" : "text-[#a4babc] hover:bg-[#123245] hover:text-white"}`}><Icon size={17} /><span>{item.label}</span>{item.path === "/pos" && <span className={`mr-auto rounded-md px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-[#d5faed]" : "bg-[#193e4d] text-[#98b7b6]"}`}>F2</span>}</button>; })}</div>)}</nav>
    <div className="border-t border-[#193745] p-4"><div className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffda73] font-extrabold text-[#573c00]">م</div><div className="min-w-0"><div className="truncate text-xs font-bold">مدير المتجر</div><div className="truncate text-[10px] text-[#86a3a6]">{role === "SUPER_ADMIN" ? "مسؤول المنصة" : "مالك المتجر"}</div></div></div><button onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#9ab2b4] hover:bg-[#123245] hover:text-white"><LogOut size={15} /> تسجيل الخروج</button></div>
  </aside>;
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: ReactNode; tone: "mint" | "yellow" | "blue" | "red" }) {
  const tones = { mint: "bg-[#e4f7f0] text-[#0f6e58]", yellow: "bg-[#fff4cf] text-[#8b6500]", blue: "bg-[#e4eef7] text-[#2d6090]", red: "bg-[#fce8e7] text-[#a83d42]" };
  return <div className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-4 sm:p-5"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><span className="text-[10px] font-bold text-[#7d9292]">هذا الشهر</span></div><div className="mt-4 text-2xl font-extrabold tracking-tight text-[#172b36]">{value}</div><div className="mt-1 text-xs font-semibold text-[#627477]">{label}</div><div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#3e8a70]"><ArrowUpLeft size={13} /> {note}</div></div>;
}

function Header({ title, subtitle, navigate, onLogout }: { title: string; subtitle: string; navigate: (path: string) => void; onLogout: () => void }) {
  return <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#dfe9e5] bg-[#f2f6f4]/95 px-4 backdrop-blur sm:px-8"><div className="flex items-center gap-3"><button onClick={() => navigate("/pos")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#071723] text-[#b8efdc] lg:hidden"><Menu size={19} /></button><div><h1 className="text-lg font-extrabold tracking-tight text-[#172b36] sm:text-xl">{title}</h1><p className="mt-0.5 text-[11px] font-semibold text-[#7b8c8e]">{subtitle}</p></div></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden text-left sm:block"><div className="text-xs font-bold text-[#4d656a]">{today()}</div><div className="mt-0.5 text-[10px] text-[#92a1a2]">آخر مزامنة منذ لحظات</div></div><IconButton label="الإشعارات"><Bell size={18} /></IconButton><button onClick={onLogout} className="hidden h-10 items-center gap-2 rounded-xl border border-[#dbe5e1] bg-white px-3 text-xs font-bold text-[#587074] hover:text-[#bd4448] md:flex"><LogOut size={15} /> خروج</button></div></header>;
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#cbdad5] bg-white px-6 py-16 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f6f1] text-[#0f6e58]">{icon}</div><div className="font-extrabold text-[#304b52]">{title}</div><div className="mt-2 max-w-sm text-xs leading-6 text-[#7b8d8e]">{body}</div></div>;
}

function PosView({ role, userId }: { role: string; userId: number }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcode, setBarcode] = useState("");
  const [scanStatus, setScanStatus] = useState("بانتظار المسح التالي");
  const [cameraOpen, setCameraOpen] = useState(true);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const lookup = trpc.products.lookupByBarcode.useMutation();
  const createInvoice = trpc.pos.createInvoice.useMutation();
  const canPay = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"].includes(role);
  const total = cartSubtotal(cart);

  useEffect(() => {
    const focus = () => scanInputRef.current?.focus();
    focus();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanStatus("جاري إضافة المنتجات...");
    while (queueRef.current.length > 0) {
      const nextBarcode = queueRef.current.shift();
      if (!nextBarcode) continue;
      try {
        const product = await lookup.mutateAsync({ barcode: nextBarcode });
        setCart(current => addProductToCart(current, product));
        setScanStatus(`تمت إضافة ${product.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "المنتج غير موجود.";
        toast.error(message.includes("المنتج") ? message : "المنتج غير موجود.", { description: `الباركود: ${nextBarcode}` });
        setScanStatus("لم يتم العثور على المنتج — جاهز للمسح التالي");
      } finally {
        setBarcode("");
        requestAnimationFrame(() => scanInputRef.current?.focus());
      }
    }
    processingRef.current = false;
    setScanStatus("جاهز للمسح التالي");
  }, [lookup]);

  const onBarcodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = barcode.trim();
    if (!value) return;
    queueRef.current.push(value);
    setBarcode("");
    void drainQueue();
  };

  const removeItem = (id: number) => setCart(current => current.filter(item => item.id !== id));
  const clearCart = () => { setCart([]); setBarcode(""); setScanStatus("جاهز للمسح التالي"); requestAnimationFrame(() => scanInputRef.current?.focus()); };
  const submitInvoice = async () => {
    if (!cart.length) { toast.error("أضف منتجًا واحدًا على الأقل إلى السلة."); return; }
    if (!canPay) { toast.error("لا تملك صلاحية إنشاء فاتورة."); return; }
    try {
      const result = await createInvoice.mutateAsync({ items: cart.map(item => ({ productId: item.id, quantity: item.qty })), discount: 0, tax: 0, paymentMethod: "CASH" });
      announceInvoiceTotal(result.total);
      toast.success("تم حفظ الفاتورة بنجاح", { description: `${result.invoiceNumber} · ${money(result.total)}` });
      clearCart();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة.");
      requestAnimationFrame(() => scanInputRef.current?.focus());
    }
  };

  const announceInvoiceTotal = (invoiceTotal: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setScanStatus(`تم حفظ الفاتورة · الإجمالي ${money(invoiceTotal)}`);
      return;
    }
    window.speechSynthesis.cancel();
    const announcement = new SpeechSynthesisUtterance(buildInvoiceAnnouncement(invoiceTotal));
    announcement.lang = "ar-EG";
    announcement.rate = 0.88;
    announcement.pitch = 1;
    announcement.volume = 1;
    window.speechSynthesis.speak(announcement);
    setScanStatus(`تم حفظ الفاتورة · الإجمالي ${money(invoiceTotal)}`);
  };

  const handleCameraDetected = useCallback((value: string) => {
    setBarcode("");
    queueRef.current.push(value);
    void drainQueue();
  }, [drainQueue]);

  return <div className="space-y-5">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.38fr)_minmax(340px,0.62fr)]">
      <section className="soft-shadow overflow-hidden rounded-2xl border border-[#d9e6e0] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edeb] px-5 py-4"><div><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#36a77f]" /><h2 className="font-extrabold text-[#183741]">ماسح الباركود</h2></div><p className="mt-1 text-[11px] font-semibold text-[#809194]">امسح المنتجات بالتتابع دون لمس الشاشة</p></div><div className="flex items-center gap-2 rounded-lg bg-[#edf7f3] px-2.5 py-1.5 text-[10px] font-extrabold text-[#20765d]"><Zap size={13} /> معالجة فورية · {queueRef.current.length} في الانتظار</div></div>
        <div className="relative bg-[#f8fcfa] p-5 sm:p-8"><div className="absolute inset-0 dot-grid" /><div className="relative"><div className="flex items-center justify-between gap-3"><label htmlFor="barcode" className="label-caps">Barcode input · جاهز</label><button onClick={() => setCameraOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#0f5d4d] px-3 py-2 text-[11px] font-extrabold text-white hover:bg-[#0b493c]"><Camera size={15} /> فتح الكاميرا</button></div><div className="mt-2 flex items-center gap-3 rounded-2xl border-2 border-[#54b393] bg-white px-4 py-4 shadow-[0_0_0_4px_rgba(84,179,147,0.1)]"><Search size={21} className="shrink-0 text-[#2e9a77]" /><input id="barcode" ref={scanInputRef} autoFocus value={barcode} onChange={event => setBarcode(event.target.value)} onKeyDown={onBarcodeKeyDown} placeholder="امسح الباركود هنا ثم اضغط Enter" className="mono min-w-0 flex-1 bg-transparent text-base font-semibold text-[#19383e] outline-none placeholder:font-sans placeholder:text-sm placeholder:text-[#a5b5b2]" /><kbd className="hidden rounded-md border border-[#dce8e3] bg-[#f3f8f6] px-2 py-1 text-[10px] font-bold text-[#718784] sm:inline">ENTER</kbd></div><div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#66807b]"><Activity size={14} className="text-[#3aa580]" /> {scanStatus}<span className="mr-auto text-[#9aa9a7]">جلسة الكاشير #{userId}</span></div></div></div>
        <div className="flex items-center justify-between border-b border-[#e5edeb] px-5 py-3"><div className="flex items-center gap-2 text-sm font-extrabold text-[#304b52]"><ShoppingCart size={17} className="text-[#0f6e58]" /> السلة <span className="rounded-full bg-[#e6f5ef] px-2 py-0.5 text-[10px] text-[#267a60]">{cart.length} أصناف</span></div><button onClick={clearCart} disabled={!cart.length} className="text-[11px] font-bold text-[#ad5a59] hover:text-[#8d3437] disabled:opacity-30">تفريغ السلة</button></div>
        <div className="scroll-thin max-h-[360px] overflow-y-auto px-5 py-2">{cart.length === 0 ? <div className="flex min-h-[235px] flex-col items-center justify-center text-center"><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf5f2] text-[#7ba49b]"><ShoppingCart size={25} /></div><div className="text-sm font-extrabold text-[#547077]">السلة فارغة</div><div className="mt-1 text-xs text-[#99a9a9]">ابدأ بمسح أول منتج لإضافته تلقائيًا</div></div> : cart.map(item => <div key={item.id} className="flex items-center gap-3 border-b border-[#edf2f0] py-3 last:border-0"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff7f4] text-[#267a60]"><Tag size={17} /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold text-[#29464f]">{item.name}</div><div className="mono mt-0.5 text-[10px] text-[#91a2a3]">{item.barcode}</div></div><div className="flex items-center gap-2 rounded-lg bg-[#f1f6f4] px-2.5 py-1.5"><span className="text-xs font-extrabold text-[#3e5b60]">{integer(item.qty)}</span><span className="text-[10px] text-[#8ba09e]">×</span></div><div className="w-24 text-left font-extrabold text-[#24444c]">{money(item.price * item.qty)}</div><button onClick={() => removeItem(item.id)} aria-label={`حذف ${item.name}`} className="text-[#aebcba] hover:text-[#bd4e51]"><Trash2 size={16} /></button></div>)}</div>
      </section>
      <aside className="soft-shadow flex flex-col rounded-2xl border border-[#173645] bg-[#071723] text-white">
        <div className="flex items-center justify-between border-b border-[#1c3b49] px-5 py-4"><div><div className="text-sm font-extrabold">ملخص الفاتورة</div><div className="mt-1 text-[10px] text-[#7f9b9e]">فاتورة جديدة · نقدي</div></div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#123447] text-[#b8efdc]"><Receipt size={17} /></div></div>
        <div className="flex-1 space-y-4 px-5 py-6"><div className="flex items-center justify-between text-xs text-[#9bb1b2]"><span>المجموع الفرعي</span><span className="mono text-[#d7e8e4]">{money(total)}</span></div><div className="flex items-center justify-between text-xs text-[#9bb1b2]"><span>الخصم</span><span className="mono text-[#b8efdc]">0.00 ج.م</span></div><div className="flex items-center justify-between text-xs text-[#9bb1b2]"><span>الضريبة</span><span className="mono text-[#d7e8e4]">0.00 ج.م</span></div><div className="border-t border-[#214351] pt-5"><div className="text-[11px] font-bold text-[#91a9a9]">الإجمالي المستحق</div><div className="mt-1 text-4xl font-extrabold tracking-tight text-[#b8efdc]">{Number(total).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}<span className="mr-2 text-sm font-bold text-[#94b8ae]">ج.م</span></div></div><div className="rounded-xl border border-[#244957] bg-[#0d2a39] p-3 text-[11px] leading-5 text-[#94aeae]"><div className="mb-1 flex items-center gap-2 font-extrabold text-[#c8dcd7]"><CreditCard size={14} className="text-[#ffda73]" /> طريقة الدفع</div>نقدي · يمكنك التبديل لاحقًا إلى بطاقة أو طرق أخرى</div></div>
        <div className="border-t border-[#1c3b49] p-5"><button onClick={submitInvoice} disabled={createInvoice.isPending || !cart.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b8efdc] px-4 py-3.5 text-sm font-extrabold text-[#08231e] shadow-[0_10px_25px_rgba(184,239,220,0.14)] hover:bg-[#d2faec] disabled:cursor-not-allowed disabled:opacity-40">{createInvoice.isPending ? "جارٍ حفظ الفاتورة..." : "إنشاء الفاتورة"}<ChevronLeft size={18} /></button><div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-[#789397]"><Printer size={13} /> يمكن الطباعة بعد الحفظ · Ctrl + P</div></div>
      </aside>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="flex items-center gap-3 rounded-2xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff3cf] text-[#a37400]"><Zap size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">مسح متواصل</div><div className="text-[10px] text-[#8b9a9a]">Queue sequential processing</div></div></div><div className="flex items-center gap-3 rounded-2xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e6f6f0] text-[#287e64]"><ShieldCheck size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">حفظ ذري</div><div className="text-[10px] text-[#8b9a9a]">Invoice + stock transaction</div></div></div><div className="flex items-center gap-3 rounded-2xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8eef7] text-[#3d6793]"><History size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">سجل كامل</div><div className="text-[10px] text-[#8b9a9a]">كل حركة قابلة للتتبع</div></div></div></div><BarcodeCameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={handleCameraDetected} />
  </div>;
}

function DashboardView({ metrics }: { metrics: any }) {
  const recent = metrics?.recentInvoices ?? [];
  return <div className="space-y-5"><div className="relative overflow-hidden rounded-2xl bg-[#0e4d45] px-5 py-6 text-white sm:px-7"><div className="absolute -left-10 -top-16 h-52 w-52 rounded-full border-[28px] border-[#b8efdc]/10" /><div className="absolute bottom-[-65px] right-20 h-44 w-44 rounded-full border-[24px] border-[#ffda73]/10" /><div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#b8efdc]"><Activity size={14} /> صباح الخير، مدير المتجر</div><h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">صورة واضحة لمتجرك اليوم</h2><p className="mt-2 max-w-lg text-xs leading-6 text-[#b7d6cf]">تابع المبيعات والمخزون والعمليات من مكان واحد، واترك للكاشير مساحة للتركيز.</p></div><div className="grid grid-cols-2 gap-2 sm:w-64"><div className="rounded-xl border border-white/10 bg-white/10 p-3"><div className="text-[10px] text-[#b7d6cf]">مبيعات اليوم</div><div className="mt-1 text-lg font-extrabold">{money(metrics?.sales)}</div></div><div className="rounded-xl border border-white/10 bg-white/10 p-3"><div className="text-[10px] text-[#b7d6cf]">فواتير محفوظة</div><div className="mt-1 text-lg font-extrabold">{integer(metrics?.invoices)}</div></div></div></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="إجمالي المبيعات" value={money(metrics?.sales)} note="12.4%" tone="mint" icon={<BarChart3 size={18} />} /><StatCard label="عدد المنتجات" value={integer(metrics?.products)} note="8 منتجات جديدة" tone="blue" icon={<Boxes size={18} />} /><StatCard label="الفواتير" value={integer(metrics?.invoices)} note="هذا الشهر" tone="yellow" icon={<Receipt size={18} />} /><StatCard label="تنبيهات المخزون" value={integer(metrics?.lowStock)} note={Number(metrics?.lowStock) ? "تحتاج متابعة" : "كل شيء جيد"} tone={Number(metrics?.lowStock) ? "red" : "mint"} icon={<CircleAlert size={18} />} /></div>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]"><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white"><div className="flex items-center justify-between border-b border-[#e8efed] px-5 py-4"><div><h3 className="font-extrabold text-[#29464e]">آخر الفواتير</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">حركة المبيعات الأخيرة في متجرك</p></div><div className="rounded-lg bg-[#eaf6f1] px-2.5 py-1 text-[10px] font-extrabold text-[#287e64]">مباشر</div></div>{recent.length === 0 ? <EmptyState icon={<Receipt size={20} />} title="لا توجد فواتير بعد" body="ابدأ من شاشة نقطة البيع، وستظهر الفواتير هنا مع تحديث المخزون تلقائيًا." /> : <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">رقم الفاتورة</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">الدفع</th><th className="px-5 py-3">الإجمالي</th><th className="px-5 py-3">الحالة</th></tr></thead><tbody>{recent.map((invoice: any) => <tr key={invoice.id} className="border-t border-[#eef3f1] text-xs"><td className="mono px-5 py-3 font-semibold text-[#36535a]">{invoice.invoiceNumber}</td><td className="px-5 py-3 text-[#76888a]">{new Date(invoice.createdAt).toLocaleString("ar-EG")}</td><td className="px-5 py-3 text-[#76888a]">{invoice.paymentMethod === "CASH" ? "نقدي" : invoice.paymentMethod}</td><td className="px-5 py-3 font-extrabold text-[#29464e]">{money(invoice.total)}</td><td className="px-5 py-3"><span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">مدفوعة</span></td></tr>)}</tbody></table></div>}</section><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white"><div className="border-b border-[#e8efed] px-5 py-4"><h3 className="font-extrabold text-[#29464e]">مؤشرات التشغيل</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">صحة العمليات الأساسية</p></div><div className="space-y-4 p-5"><HealthRow label="نقطة البيع" value="متصل ويعمل" color="green" /><HealthRow label="قاعدة البيانات" value="مزامنة" color="green" /><HealthRow label="المخزون" value={Number(metrics?.lowStock) ? `${metrics.lowStock} تنبيهات` : "مستقر"} color={Number(metrics?.lowStock) ? "yellow" : "green"} /><HealthRow label="الفترة الحالية" value="الخطة المجانية" color="blue" /></div><div className="mx-5 mb-5 rounded-xl bg-[#f7faf9] p-3 text-[11px] leading-5 text-[#778b8c]"><div className="mb-1 flex items-center gap-2 font-extrabold text-[#3f5f65]"><ShieldCheck size={14} className="text-[#309a76]" /> حماية المستأجر</div>كل استعلامات المتجر مقيدة بمعرّف المتجر.</div></section></div>
  </div>;
}

function HealthRow({ label, value, color }: { label: string; value: string; color: "green" | "yellow" | "blue" }) {
  const colors = { green: "bg-[#e3f6ef] text-[#2c8c6d]", yellow: "bg-[#fff3cf] text-[#a37400]", blue: "bg-[#e6eef8] text-[#4778a8]" };
  return <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#61777a]">{label}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${colors[color]}`}>{value}</span></div>;
}

function ProductsView() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [form, setForm] = useState({ name: "", barcode: "", sellingPrice: "", stockQuantity: "", minimumStock: "5" });
  const input = useMemo(() => ({ search }), [search]);
  const products = trpc.products.list.useQuery(input, { retry: false });
  const duplicateLookup = trpc.products.lookupByBarcode.useMutation({
    onSuccess: product => {
      setEditingId(product.id);
      setForm({ name: product.name, barcode: product.barcode, sellingPrice: String(product.sellingPrice), stockQuantity: String(product.stockQuantity), minimumStock: String(product.minimumStock) });
      toast.info("هذا الباركود محفوظ بالفعل", { description: "تم فتح المنتج للتعديل مباشرة." });
    },
  });
  const handleProductCamera = (value: string) => { setCameraOpen(false); setForm(current => ({ ...current, barcode: value })); duplicateLookup.mutate({ barcode: value }); };
  const resetForm = () => { setEditingId(null); setForm({ name: "", barcode: "", sellingPrice: "", stockQuantity: "", minimumStock: "5" }); };
  const create = trpc.products.create.useMutation({ onSuccess: () => { toast.success("تمت إضافة المنتج"); resetForm(); void products.refetch(); }, onError: error => toast.error(error.message) });
  const update = trpc.products.update.useMutation({ onSuccess: () => { toast.success("تم تعديل المنتج"); resetForm(); void products.refetch(); }, onError: error => toast.error(error.message) });
  const payload = { name: form.name, barcode: form.barcode, sellingPrice: Number(form.sellingPrice), costPrice: 0, stockQuantity: Number(form.stockQuantity || 0), minimumStock: Number(form.minimumStock || 5), unit: "قطعة" as const };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (editingId) update.mutate({ ...payload, id: editingId }); else create.mutate(payload); };
  const checkBarcode = () => { const value = form.barcode.trim(); if (value.length >= 3) duplicateLookup.mutate({ barcode: value }); };
  const saving = create.isPending || update.isPending;
  return <div className="space-y-5"><div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]"><form onSubmit={submit} className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f6f0] text-[#287e64]"><PackagePlus size={18} /></div><div><h3 className="font-extrabold text-[#29464e]">{editingId ? "تعديل المنتج المحفوظ" : "إضافة منتج سريع"}</h3><p className="text-[11px] text-[#8a9c9c]">امسح الباركود؛ إذا كان محفوظًا سيفتح للتعديل تلقائيًا</p></div></div><div className="mt-5 space-y-3"><Field label="اسم المنتج"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: مياه معدنية" /></Field><Field label="الباركود"><div className="flex gap-2"><input required value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} onBlur={checkBarcode} placeholder="6221234567890" className="mono min-w-0 flex-1" /><button type="button" onClick={() => setCameraOpen(true)} className="flex shrink-0 items-center gap-1 rounded-xl bg-[#0f5d4d] px-3 text-[11px] font-extrabold text-white"><Camera size={14} /> كاميرا</button></div></Field>{editingId && <div className="rounded-xl border border-[#f0dca6] bg-[#fff8e7] px-3 py-2 text-[11px] font-bold text-[#8c690f]">هذا المنتج محفوظ بالفعل. أي تعديل هنا سيحدّث السجل الموجود بدل إنشاء نسخة جديدة.</div>}<div className="grid grid-cols-2 gap-3"><Field label="سعر البيع"><input required min="0" step="0.01" type="number" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} placeholder="0.00" /></Field><Field label="المخزون"><input min="0" step="1" type="number" value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: e.target.value })} placeholder="0" /></Field></div><div className="flex gap-2"><button disabled={saving} className="mt-2 flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] py-3 text-sm font-extrabold text-white hover:bg-[#0b493c] disabled:opacity-50"><Plus size={16} /> {saving ? "جارٍ الحفظ" : editingId ? "حفظ التعديل" : "حفظ المنتج"}</button>{editingId && <button type="button" onClick={resetForm} className="mt-2 rounded-xl border border-[#dbe5e1] px-4 text-xs font-bold text-[#617679]">إلغاء</button>}</div></div></form><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8efed] px-5 py-4"><div><h3 className="font-extrabold text-[#29464e]">كتالوج المنتجات</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">بحث سريع بالاسم أو الباركود أو SKU</p></div><div className="relative w-full max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في المنتجات" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" /></div></div>{products.isLoading ? <div className="p-8 text-center text-xs text-[#829394]">جارٍ تحميل المنتجات...</div> : products.data?.length ? <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">المنتج</th><th className="px-5 py-3">الباركود</th><th className="px-5 py-3">السعر</th><th className="px-5 py-3">المخزون</th><th className="px-5 py-3">الحالة</th></tr></thead><tbody>{products.data.map(product => <tr key={product.id} className="border-t border-[#eef3f1] text-xs"><td className="px-5 py-3 font-extrabold text-[#34515a]">{product.name}</td><td className="mono px-5 py-3 text-[#819293]">{product.barcode}</td><td className="px-5 py-3 font-extrabold text-[#29464e]">{money(product.sellingPrice)}</td><td className="px-5 py-3 text-[#657d80]">{integer(product.stockQuantity)} {product.unit}</td><td className="px-5 py-3">{Number(product.stockQuantity) <= Number(product.minimumStock) ? <span className="rounded-full bg-[#fff3cf] px-2 py-1 text-[10px] font-bold text-[#9b7000]">مخزون منخفض</span> : <span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">متاح</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<Boxes size={20} />} title="لا توجد منتجات" body="أضف منتجك الأول ليبدأ الكاشير في استقبال عمليات المسح." />}</section></div><BarcodeCameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={handleProductCamera} /></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">{label}</span>{children}</label>; }

function InvoicesView() {
  const [search, setSearch] = useState("");
  const input = useMemo(() => ({ search }), [search]);
  const invoices = trpc.invoices.list.useQuery(input, { retry: false });
  return <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8efed] px-5 py-4"><div><h3 className="font-extrabold text-[#29464e]">سجل الفواتير</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">كل عملية محفوظة مع وقتها وطريقة الدفع</p></div><div className="flex w-full max-w-md items-center gap-2"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]" size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث برقم الفاتورة" className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]" /></div><button onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 text-xs font-bold text-[#526c70] hover:border-[#9dc8ba]"><Printer size={15} /> طباعة</button></div></div>{invoices.isLoading ? <div className="p-12 text-center text-xs text-[#829394]">جارٍ تحميل الفواتير...</div> : invoices.data?.length ? <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">رقم الفاتورة</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">الفرع</th><th className="px-5 py-3">طريقة الدفع</th><th className="px-5 py-3">الإجمالي</th><th className="px-5 py-3">الحالة</th></tr></thead><tbody>{invoices.data.map(invoice => <tr key={invoice.id} className="border-t border-[#eef3f1] text-xs"><td className="mono px-5 py-4 font-semibold text-[#36535a]">{invoice.invoiceNumber}</td><td className="px-5 py-4 text-[#76888a]">{new Date(invoice.createdAt).toLocaleString("ar-EG")}</td><td className="px-5 py-4 text-[#76888a]">الفرع الرئيسي</td><td className="px-5 py-4 text-[#76888a]">{invoice.paymentMethod === "CASH" ? "نقدي" : invoice.paymentMethod}</td><td className="px-5 py-4 font-extrabold text-[#29464e]">{money(invoice.total)}</td><td className="px-5 py-4"><span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">مدفوعة</span></td></tr>)}</tbody></table></div> : <EmptyState icon={<FileText size={20} />} title="لا توجد فواتير" body="بعد إنشاء أول فاتورة من شاشة نقطة البيع، ستظهر تفاصيلها هنا." />}</section>;
}

function InventoryView() {
  const lowStock = trpc.inventory.lowStock.useQuery(undefined, { retry: false });
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><StatCard label="حركات اليوم" value="—" note="تظهر بعد أول عملية" tone="blue" icon={<Activity size={18} />} /><StatCard label="منتجات منخفضة" value={integer(lowStock.data?.length)} note={lowStock.data?.length ? "تحتاج إجراء" : "مستقر"} tone={lowStock.data?.length ? "red" : "mint"} icon={<CircleAlert size={18} />} /><StatCard label="قيمة المخزون" value="—" note="قريبًا" tone="yellow" icon={<Boxes size={18} />} /></div><section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white"><div className="border-b border-[#e8efed] px-5 py-4"><h3 className="font-extrabold text-[#29464e]">تنبيهات المخزون</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">المنتجات التي وصلت إلى الحد الأدنى أو أقل</p></div>{lowStock.isLoading ? <div className="p-10 text-center text-xs text-[#829394]">جارٍ فحص المخزون...</div> : lowStock.data?.length ? <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">المنتج</th><th className="px-5 py-3">المتاح</th><th className="px-5 py-3">الحد الأدنى</th><th className="px-5 py-3">الإجراء</th></tr></thead><tbody>{lowStock.data.map(product => <tr key={product.id} className="border-t border-[#eef3f1] text-xs"><td className="px-5 py-4 font-extrabold text-[#34515a]">{product.name}</td><td className="px-5 py-4 font-extrabold text-[#b4484b]">{integer(product.stockQuantity)} {product.unit}</td><td className="px-5 py-4 text-[#76888a]">{integer(product.minimumStock)} {product.unit}</td><td className="px-5 py-4"><span className="rounded-lg bg-[#fff3cf] px-2 py-1 text-[10px] font-bold text-[#9b7000]">اطلب توريدًا</span></td></tr>)}</tbody></table></div> : <EmptyState icon={<Check size={20} />} title="المخزون مستقر" body="لا توجد منتجات تحت الحد الأدنى حاليًا. ستظهر التنبيهات هنا تلقائيًا." />}</section></div>;
}

function UsersView() {
  const users = trpc.users.list.useQuery(undefined, { retry: false });
  return <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white"><div className="flex items-center justify-between border-b border-[#e8efed] px-5 py-4"><div><h3 className="font-extrabold text-[#29464e]">فريق العمل</h3><p className="mt-1 text-[11px] text-[#8a9c9c]">الأدوار والصلاحيات داخل المتجر</p></div><button className="flex items-center gap-2 rounded-xl bg-[#0f5d4d] px-3 py-2 text-xs font-extrabold text-white"><Plus size={15} /> مستخدم جديد</button></div>{users.isLoading ? <div className="p-10 text-center text-xs text-[#829394]">جارٍ تحميل المستخدمين...</div> : users.data?.length ? <div className="overflow-x-auto"><table className="w-full text-right"><thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]"><tr><th className="px-5 py-3">المستخدم</th><th className="px-5 py-3">البريد</th><th className="px-5 py-3">الدور</th><th className="px-5 py-3">الحالة</th></tr></thead><tbody>{users.data.map(user => <tr key={user.id} className="border-t border-[#eef3f1] text-xs"><td className="flex items-center gap-3 px-5 py-3 font-extrabold text-[#34515a]"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f4f0] text-xs font-extrabold text-[#287e64]">{(user.name || "م").slice(0, 1)}</div>{user.name || "مستخدم"}</td><td className="px-5 py-3 text-[#76888a]">{user.email || "—"}</td><td className="px-5 py-3"><span className="rounded-full bg-[#e8eef7] px-2 py-1 text-[10px] font-bold text-[#486e96]">{user.role}</span></td><td className="px-5 py-3"><span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">نشط</span></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={20} />} title="لا يوجد مستخدمون بعد" body="سيتولى نظام المصادقة إنشاء مالك المتجر عند أول تسجيل دخول." />}</section>;
}

function SettingsView() {
  return <div className="grid gap-4 xl:grid-cols-2"><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7eef8] text-[#476f9b]"><Settings size={18} /></div><div><h3 className="font-extrabold text-[#29464e]">إعدادات التشغيل</h3><p className="text-[11px] text-[#8a9c9c]">تهيئة المتجر وطباعة الفواتير</p></div></div><div className="mt-6 space-y-3"><SettingRow label="العملة" value="جنيه مصري (ج.م)" /><SettingRow label="اللغة" value="العربية · RTL" /><SettingRow label="الطابعة" value="غير مهيأة" action="تهيئة" /><SettingRow label="ترقيم الفواتير" value="INV-YYYYMMDD-XXXXXXX" /></div></section><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff3cf] text-[#9a7100]"><Zap size={18} /></div><div><h3 className="font-extrabold text-[#29464e]">اختصارات الكاشير</h3><p className="text-[11px] text-[#8a9c9c]">لتقليل استخدام الماوس</p></div></div><div className="mt-6 space-y-3"><Shortcut keys="F2" label="فتح نقطة البيع" /><Shortcut keys="Enter" label="إضافة الباركود" /><Shortcut keys="Ctrl + P" label="طباعة الفاتورة" /><Shortcut keys="Esc" label="إلغاء الحقل الحالي" /></div></section></div>;
}
function SettingRow({ label, value, action }: { label: string; value: string; action?: string }) { return <div className="flex items-center justify-between border-b border-[#edf2f0] py-3 last:border-0"><span className="text-xs font-bold text-[#637a7d]">{label}</span><div className="flex items-center gap-2 text-xs font-extrabold text-[#34545c]">{value}{action && <button className="rounded-lg bg-[#e7f5f0] px-2 py-1 text-[10px] text-[#267a60]">{action}</button>}</div></div>; }
function Shortcut({ keys, label }: { keys: string; label: string }) { return <div className="flex items-center justify-between rounded-xl bg-[#f8fbfa] px-3 py-2.5"><span className="text-xs font-bold text-[#5e777a]">{label}</span><kbd className="rounded-md border border-[#d7e3df] bg-white px-2 py-1 text-[10px] font-extrabold text-[#557074]">{keys}</kbd></div>; }

function SuperAdminView() {
  const overview = trpc.superAdmin.overview.useQuery(undefined, { retry: false });
  const cards = [{ label: "السوبر ماركت", value: overview.data?.supermarkets, icon: <Building2 size={18} /> }, { label: "المستخدمون", value: overview.data?.users, icon: <Users size={18} /> }, { label: "المنتجات", value: overview.data?.products, icon: <Boxes size={18} /> }, { label: "إجمالي المبيعات", value: money(overview.data?.sales), icon: <BarChart3 size={18} /> }];
  return <div className="space-y-5"><div className="rounded-2xl bg-[#071723] p-6 text-white"><div className="flex items-center gap-2 text-xs font-bold text-[#b8efdc]"><ShieldCheck size={15} /> منصة الإدارة العليا</div><h2 className="mt-2 text-2xl font-extrabold">مرحبًا بك في مركز التحكم</h2><p className="mt-1 text-xs text-[#94afb1]">نظرة مجمعة على الحسابات والاشتراكات والنشاط التشغيلي.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <div key={card.label} className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f4f0] text-[#267a60]">{card.icon}</div><div className="mt-4 text-2xl font-extrabold text-[#29464e]">{card.value ?? "—"}</div><div className="mt-1 text-xs font-semibold text-[#73888a]">{card.label}</div></div>)}</div><section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5"><h3 className="font-extrabold text-[#29464e]">حالة المنصة</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><HealthRow label="العزل بين المستأجرين" value="مفعل" color="green" /><HealthRow label="المصادقة" value="Manus OAuth" color="blue" /><HealthRow label="الفواتير الذرية" value="مفعل" color="green" /></div></section></div>;
}

function MobileBottomNav({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const items = [
    { path: "/pos", label: "البيع", icon: ShoppingCart },
    { path: "/products", label: "المنتجات", icon: Boxes },
    { path: "/inventory", label: "المخزون", icon: ClipboardList },
    { path: "/invoices", label: "الفواتير", icon: Receipt },
  ];
  return <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[#d7e6e0] bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(21,55,61,0.18)] backdrop-blur lg:hidden" aria-label="التنقل السريع">
    {items.map(item => { const Icon = item.icon; const active = path === item.path; return <button key={item.path} onClick={() => navigate(item.path)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold ${active ? "bg-[#b8efdc] text-[#08231e]" : "text-[#718688]"}`}><Icon size={18} /><span>{item.label}</span></button>; })}
  </nav>;
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const bootstrap = trpc.bootstrap.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const metrics = trpc.dashboard.metrics.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const role = String(user?.role || "OWNER");
  const section = location === "/" ? (isAuthenticated ? "/pos" : "/") : location;
  const current = navItems.find(item => item.path === section);
  useEffect(() => { if (isAuthenticated && location === "/") navigate("/pos"); }, [isAuthenticated, location, navigate]);
  if (!isAuthenticated) return <PublicWelcome loading={loading} />;
  const title = section === "/pos" ? "نقطة البيع" : section === "/dashboard" ? "نظرة عامة" : section === "/products" ? "المنتجات" : section === "/inventory" ? "المخزون" : section === "/invoices" ? "الفواتير" : section === "/reports" ? "التقارير" : section === "/users" ? "المستخدمون" : section === "/branches" ? "الفروع" : section === "/subscriptions" ? "الاشتراك" : section === "/settings" ? "إعدادات المتجر" : section === "/super-admin" ? "الإدارة العليا" : current?.label || "المتجر";
  const subtitle = section === "/pos" ? "امسح، أضف، احفظ — بدون توقف" : section === "/dashboard" ? "ملخص أداء المتجر وحركة التشغيل" : "إدارة بيانات المتجر بصلاحيات واضحة";
  const view = section === "/pos" ? <PosView role={role} userId={user?.id || 0} /> : section === "/dashboard" ? <DashboardView metrics={metrics.data || bootstrap.data?.metrics} /> : section === "/products" ? <ProductsView /> : section === "/invoices" ? <InvoicesView /> : section === "/inventory" ? <InventoryView /> : section === "/users" ? <UsersView /> : section === "/settings" ? <SettingsView /> : section === "/super-admin" && role === "SUPER_ADMIN" ? <SuperAdminView /> : <DashboardView metrics={metrics.data || bootstrap.data?.metrics} />;
  return <div className="flex min-h-screen bg-[#f2f6f4]" dir="rtl"><Sidebar path={section} navigate={navigate} role={role} onLogout={() => void logout()} /><main className="min-w-0 flex-1"><Header title={title} subtitle={subtitle} navigate={navigate} onLogout={() => void logout()} /><div className="container pb-24 pt-5 sm:py-7">{metrics.isError && section !== "/pos" ? <div className="mb-4 rounded-xl border border-[#f1d7b3] bg-[#fff8e9] px-4 py-3 text-xs font-semibold text-[#8b6500]">تعذر تحميل بعض الإحصاءات الآن، لكن يمكنك متابعة العمل من نقطة البيع.</div> : null}{view}</div></main><MobileBottomNav path={section} navigate={navigate} /></div>;
}

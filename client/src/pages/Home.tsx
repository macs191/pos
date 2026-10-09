import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PosView } from "@/components/PosView";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { GlobalProductsView } from "@/components/GlobalProductsView";
import { SuperAdminPanel } from "@/components/SuperAdminPanel";
import {
  SubscriptionExpiredView,
  SubscriptionView,
} from "@/components/SubscriptionStatus";
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type NavItem = {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  group?: string;
};

const navItems: NavItem[] = [
  { path: "/pos", label: "نقطة البيع", icon: ShoppingCart, group: "التشغيل" },
  {
    path: "/dashboard",
    label: "نظرة عامة",
    icon: LayoutDashboard,
    group: "التشغيل",
  },
  { path: "/products", label: "المنتجات", icon: Boxes, group: "إدارة المتجر" },
  {
    path: "/invoices",
    label: "الفواتير",
    icon: Receipt,
    group: "إدارة المتجر",
  },
  {
    path: "/reports",
    label: "التقارير",
    icon: BarChart3,
    group: "إدارة المتجر",
  },
  { path: "/users", label: "المستخدمون", icon: Users, group: "الإعدادات" },
  { path: "/branches", label: "الفروع", icon: Building2, group: "الإعدادات" },
  {
    path: "/subscriptions",
    label: "الاشتراك",
    icon: CreditCard,
    group: "الإعدادات",
  },
  {
    path: "/settings",
    label: "إعدادات المتجر",
    icon: Settings,
    group: "الإعدادات",
  },
  {
    path: "/super-admin",
    label: "الإدارة العليا",
    icon: ShieldCheck,
    group: "الإدارة العليا",
  },
];
const managerOnlyPaths = new Set([
  "/dashboard",
  "/invoices",
  "/reports",
  "/users",
  "/branches",
  "/subscriptions",
  "/settings",
]);

const money = (value: number | string | null | undefined) =>
  `${Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const integer = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("ar-EG");
const today = () =>
  new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#dbe5e1] bg-white text-[#466269] hover:border-[#94c6b7] hover:text-[#0f5d4d]"
    >
      {children}
    </button>
  );
}

function PublicWelcome({
  loading,
  signIn,
  signUp,
  firebaseConfigured,
  sessionIssue,
}: {
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  firebaseConfigured: boolean;
  sessionIssue?: string | null;
}) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else {
        await signUp(email.trim(), password, fullName.trim());
        setAuthMessage("تم إنشاء الحساب في Firebase. يمكنك الدخول مباشرة.");
        setMode("signin");
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "تعذر تنفيذ تسجيل الدخول."
      );
    }
  };
  const openLogin = () => {
    setLoginOpen(true);
    setAuthError("");
    setAuthMessage("");
  };
  return (
    <div
      className="min-h-screen overflow-hidden bg-[#071723] text-[#effbf7]"
      dir="rtl"
    >
      <div className="absolute inset-0 dot-grid" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b8efdc] text-[#08231e]">
              <Store size={22} />
            </div>
            <div>
              <div className="font-extrabold tracking-tight">سوقي</div>
              <div className="text-xs text-[#9ab3b6]">نظام تشغيل متجرك</div>
            </div>
          </div>
          <button
            onClick={openLogin}
            className="rounded-xl border border-[#3b5964] px-4 py-2 text-sm font-bold text-[#d7e9e4] hover:bg-[#123245]"
          >
            {loading ? "جارٍ التحميل" : "تسجيل الدخول"}
          </button>
        </header>
        <main className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#335469] bg-[#0d2a3a] px-3 py-1.5 text-xs font-bold text-[#b8efdc]">
              <Zap size={14} /> كاشير أسرع. قرارات أوضح.
            </div>
            <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.18] tracking-[-0.04em] md:text-7xl">
              كل عملية بيع،
              <br />
              <span className="text-[#b8efdc]">في نبضة واحدة.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#a9c0c1]">
              من مسح الباركود إلى الفاتورة، مع كتالوج وأسعار مشتركة بين المتاجر.
              منصة عربية مصممة لتبقى يد الكاشير على الماسح.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button
                onClick={openLogin}
                className="flex items-center gap-2 rounded-xl bg-[#b8efdc] px-5 py-3.5 font-extrabold text-[#08231e] shadow-[0_12px_30px_rgba(184,239,220,0.16)] hover:bg-[#d4faec]"
              >
                ابدأ الآن <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-[#294958] px-4 py-3 text-sm text-[#b7cacc]">
                <ShieldCheck size={16} className="text-[#ffda73]" /> عزل بيانات
                كل متجر
              </div>
            </div>
            <div className="mt-14 grid max-w-lg grid-cols-3 gap-5 border-t border-[#244250] pt-6">
              <div>
                <div className="text-2xl font-extrabold">0.2s</div>
                <div className="mt-1 text-xs text-[#8ca7a9]">استجابة المسح</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold">100%</div>
                <div className="mt-1 text-xs text-[#8ca7a9]">
                  حفظ ذري للفواتير
                </div>
              </div>
              <div>
                <div className="text-2xl font-extrabold">RTL</div>
                <div className="mt-1 text-xs text-[#8ca7a9]">
                  واجهة عربية أصلية
                </div>
              </div>
            </div>
          </section>
          <section className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 rounded-[3rem] bg-[#b8efdc]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-[#2b4b58] bg-[#0b2534] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between border-b border-[#254450] pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#b8efdc]" />
                  <span className="text-xs font-bold text-[#b1c8c7]">
                    نقطة البيع · الفرع الرئيسي
                  </span>
                </div>
                <span className="mono text-xs text-[#6d8b8f]">09:41:24</span>
              </div>
              <div className="py-6">
                <div className="mb-3 text-xs font-bold text-[#9cb7b7]">
                  جاهز للمسح
                </div>
                <div className="rounded-2xl border border-[#5da993] bg-[#0e3341] p-5">
                  <div className="flex items-center gap-3">
                    <Search size={21} className="text-[#b8efdc]" />
                    <span className="mono text-lg text-[#e8f8f2]">
                      6221234567890
                    </span>
                    <div className="mr-auto h-2 w-2 animate-pulse rounded-full bg-[#b8efdc]" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <MiniReceipt name="مياه معدنية ١.٥ لتر" price="5.00" qty="2" />
                <MiniReceipt name="أرز بسمتي ٥ كجم" price="185.00" qty="1" />
                <MiniReceipt name="مناديل مطبخ" price="42.50" qty="1" />
              </div>
              <div className="mt-6 flex items-end justify-between border-t border-[#254450] pt-5">
                <div>
                  <div className="text-xs text-[#8fa9aa]">إجمالي الفاتورة</div>
                  <div className="mt-1 text-3xl font-extrabold text-[#b8efdc]">
                    237.50 <span className="text-sm font-semibold">ج.م</span>
                  </div>
                </div>
                <div className="rounded-xl bg-[#b8efdc] px-4 py-2 text-xs font-extrabold text-[#08231e]">
                  تمت الإضافة ✓
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#031018]/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitAuth}
            className="w-full max-w-sm rounded-3xl border border-[#315362] bg-[#0b2534] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold">
                  {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
                </h2>
                <p className="mt-1 text-xs text-[#9eb7b7]">
                  الدخول الآمن عبر Firebase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(false)}
                className="text-[#a7c2c1]"
              >
                ✕
              </button>
            </div>
            {!firebaseConfigured && (
              <div className="mt-4 rounded-xl border border-[#8c5a58] bg-[#3b2228] p-3 text-xs leading-5 text-[#ffd8d3]">
                أضف متغيرات VITE_FIREBASE_* إلى Vercel.
              </div>
            )}
            {sessionIssue && (
              <div className="mt-4 rounded-xl border border-[#8c5a58] bg-[#3b2228] p-3 text-xs leading-5 text-[#ffd8d3]">
                {sessionIssue}
              </div>
            )}
            <div className="mt-5 space-y-3">
              {mode === "signup" && (
                <input
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="الاسم"
                  className="w-full rounded-xl border border-[#315362] bg-[#071723] px-3 py-3 text-sm text-white outline-none"
                />
              )}
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني"
                className="w-full rounded-xl border border-[#315362] bg-[#071723] px-3 py-3 text-sm text-white outline-none"
              />
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full rounded-xl border border-[#315362] bg-[#071723] px-3 py-3 text-sm text-white outline-none"
              />
            </div>
            {authError && (
              <p className="mt-3 text-xs leading-5 text-[#ffb3aa]">
                {authError}
              </p>
            )}
            {authMessage && (
              <p className="mt-3 text-xs leading-5 text-[#b8efdc]">
                {authMessage}
              </p>
            )}
            <button
              disabled={!firebaseConfigured}
              className="mt-5 w-full rounded-xl bg-[#b8efdc] py-3 text-sm font-extrabold text-[#08231e] disabled:opacity-50"
            >
              {mode === "signin" ? "دخول" : "إنشاء الحساب"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setAuthError("");
              }}
              className="mt-3 w-full text-xs font-bold text-[#b8efdc]"
            >
              {mode === "signin"
                ? "ليس لديك حساب؟ إنشاء حساب"
                : "لديك حساب؟ تسجيل الدخول"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MiniReceipt({
  name,
  price,
  qty,
}: {
  name: string;
  price: string;
  qty: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#102e3d] px-3 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#183b4b] text-[#b8efdc]">
        <PackagePlus size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-[#e5f1ee]">{name}</div>
        <div className="text-[11px] text-[#87a2a6]">الكمية: {qty}</div>
      </div>
      <div className="mono text-sm font-semibold text-[#d8eee8]">{price}</div>
    </div>
  );
}

function Sidebar({
  path,
  navigate,
  role,
  onLogout,
  user,
  storeName,
}: {
  path: string;
  navigate: (path: string) => void;
  role: string;
  onLogout: () => void;
  user: { name?: string | null; email?: string | null } | null | undefined;
  storeName?: string;
}) {
  const visibleItems = navItems.filter(
    item =>
      (role !== "CASHIER" || !managerOnlyPaths.has(item.path)) &&
      (item.path !== "/super-admin" || role === "SUPER_ADMIN")
  );
  const groups = Array.from(new Set(visibleItems.map(item => item.group)));
  const displayName = user?.name || user?.email || "حساب المتجر";
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col bg-[#071723] text-[#e5f3ef] lg:flex">
      <div className="flex items-center gap-3 px-6 py-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b8efdc] text-[#08231e]">
          <Store size={20} />
        </div>
        <div>
          <div className="font-extrabold tracking-tight">سوقي</div>
          <div className="text-[11px] text-[#86a3a6]">إدارة المتجر بوضوح</div>
        </div>
      </div>
      <div className="mx-4 mb-5 rounded-2xl border border-[#214150] bg-[#0d2938] p-3">
        <div className="flex items-center gap-2 text-xs font-bold">
          <div className="h-2 w-2 rounded-full bg-[#b8efdc]" />{" "}
          {storeName || "متجري"}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[#86a3a6]">
          <span>الاشتراك</span>
          {role !== "CASHIER" && (
            <button
              onClick={() => navigate("/subscriptions")}
              className="rounded-full bg-[#173c4b] px-2 py-0.5 text-[#b8efdc]"
            >
              عرض الحالة
            </button>
          )}
        </div>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {groups.map(group => (
          <div key={group} className="mb-5">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#648286]">
              {group}
            </div>
            {visibleItems
              .filter(item => item.group === group)
              .map(item => {
                const Icon = item.icon;
                const active =
                  path === item.path || (path === "/" && item.path === "/pos");
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-[#b8efdc] text-[#08231e] shadow-[0_8px_20px_rgba(184,239,220,0.1)]" : "text-[#a4babc] hover:bg-[#123245] hover:text-white"}`}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {item.path === "/pos" && (
                      <span
                        className={`mr-auto rounded-md px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-[#d5faed]" : "bg-[#193e4d] text-[#98b7b6]"}`}
                      >
                        F2
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="border-t border-[#193745] p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffda73] font-extrabold text-[#573c00]">
            {displayName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-bold">{displayName}</div>
            <div className="truncate text-[10px] text-[#86a3a6]">
              {user?.email ||
                (role === "SUPER_ADMIN" ? "مسؤول المنصة" : "حساب المتجر")}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#9ab2b4] hover:bg-[#123245] hover:text-white"
        >
          <LogOut size={15} /> تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone: "mint" | "yellow" | "blue" | "red";
}) {
  const tones = {
    mint: "bg-[#e4f7f0] text-[#0f6e58]",
    yellow: "bg-[#fff4cf] text-[#8b6500]",
    blue: "bg-[#e4eef7] text-[#2d6090]",
    red: "bg-[#fce8e7] text-[#a83d42]",
  };
  return (
    <div className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          {icon}
        </div>
        <span className="text-[10px] font-bold text-[#7d9292]">هذا الشهر</span>
      </div>
      <div className="mt-4 text-2xl font-extrabold tracking-tight text-[#172b36]">
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold text-[#627477]">{label}</div>
      <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#3e8a70]">
        <ArrowUpLeft size={13} /> {note}
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  navigate,
  onLogout,
  online,
}: {
  title: string;
  subtitle: string;
  navigate: (path: string) => void;
  onLogout: () => void;
  online: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#dfe9e5] bg-[#f2f6f4]/95 px-4 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/pos")}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#071723] text-[#b8efdc] lg:hidden"
        >
          <Menu size={19} />
        </button>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#172b36] sm:text-xl">
            {title}
          </h1>
          <p className="mt-0.5 text-[11px] font-semibold text-[#7b8c8e]">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-left sm:block">
          <div className="text-xs font-bold text-[#4d656a]">{today()}</div>
          <div className={`mt-0.5 flex items-center gap-1 text-[10px] ${online ? "text-[#2a8064]" : "text-[#a83d42]"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#3aa580]" : "bg-[#bd4448]"}`} />
            {online ? "اتصال الشبكة متاح" : "لا يوجد اتصال بالإنترنت"}
          </div>
        </div>
        <PwaInstallButton />
        <IconButton label="الإشعارات">
          <Bell size={18} />
        </IconButton>
        <button
          onClick={onLogout}
          className="hidden h-10 items-center gap-2 rounded-xl border border-[#dbe5e1] bg-white px-3 text-xs font-bold text-[#587074] hover:text-[#bd4448] md:flex"
        >
          <LogOut size={15} /> خروج
        </button>
      </div>
    </header>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#cbdad5] bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f6f1] text-[#0f6e58]">
        {icon}
      </div>
      <div className="font-extrabold text-[#304b52]">{title}</div>
      <div className="mt-2 max-w-sm text-xs leading-6 text-[#7b8d8e]">
        {body}
      </div>
    </div>
  );
}

function DashboardView({ metrics }: { metrics: any }) {
  const recent = metrics?.recentInvoices ?? [];
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-[#0e4d45] px-5 py-6 text-white sm:px-7">
        <div className="absolute -left-10 -top-16 h-52 w-52 rounded-full border-[28px] border-[#b8efdc]/10" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#b8efdc]">
              <Activity size={14} /> صباح الخير
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              صورة واضحة لمتجرك اليوم
            </h2>
            <p className="mt-2 max-w-lg text-xs leading-6 text-[#b7d6cf]">
              تابع المبيعات والفواتير والكتالوج المشترك من مكان واحد، دون تتبع
              مخزون أو وزن.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <div className="rounded-xl border border-white/10 bg-white/10 p-3">
              <div className="text-[10px] text-[#b7d6cf]">إجمالي المبيعات</div>
              <div className="mt-1 text-lg font-extrabold">
                {money(metrics?.sales)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 p-3">
              <div className="text-[10px] text-[#b7d6cf]">فواتير محفوظة</div>
              <div className="mt-1 text-lg font-extrabold">
                {integer(metrics?.invoices)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي المبيعات"
          value={money(metrics?.sales)}
          note="المبيعات المسجلة"
          tone="mint"
          icon={<BarChart3 size={18} />}
        />
        <StatCard
          label="المنتجات المشتركة"
          value={integer(metrics?.products)}
          note="متاحة لجميع المتاجر"
          tone="blue"
          icon={<Boxes size={18} />}
        />
        <StatCard
          label="الفواتير"
          value={integer(metrics?.invoices)}
          note="فواتير هذا المتجر"
          tone="yellow"
          icon={<Receipt size={18} />}
        />
        <StatCard
          label="حالة الكتالوج"
          value={Number(metrics?.products) ? "متاح" : "فارغ"}
          note="كتالوج عالمي موحّد"
          tone="mint"
          icon={<Tag size={18} />}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8efed] px-5 py-4">
            <div>
              <h3 className="font-extrabold text-[#29464e]">آخر الفواتير</h3>
              <p className="mt-1 text-[11px] text-[#8a9c9c]">
                حركة المبيعات الأخيرة في متجرك
              </p>
            </div>
            <div className="rounded-lg bg-[#eaf6f1] px-2.5 py-1 text-[10px] font-extrabold text-[#287e64]">
              مباشر
            </div>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Receipt size={20} />}
              title="لا توجد فواتير بعد"
              body="ابدأ من شاشة نقطة البيع؛ ستظهر الفواتير هنا."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
                  <tr>
                    <th className="px-5 py-3">رقم الفاتورة</th>
                    <th className="px-5 py-3">التاريخ</th>
                    <th className="px-5 py-3">الدفع</th>
                    <th className="px-5 py-3">الإجمالي</th>
                    <th className="px-5 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((invoice: any) => (
                    <tr
                      key={invoice.id}
                      className="border-t border-[#eef3f1] text-xs"
                    >
                      <td className="mono px-5 py-3 font-semibold text-[#36535a]">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-5 py-3 text-[#76888a]">
                        {new Date(invoice.createdAt).toLocaleString("ar-EG")}
                      </td>
                      <td className="px-5 py-3 text-[#76888a]">
                        {invoice.paymentMethod === "CASH"
                          ? "نقدي"
                          : invoice.paymentMethod}
                      </td>
                      <td className="px-5 py-3 font-extrabold text-[#29464e]">
                        {money(invoice.total)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">
                          مدفوعة
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white">
          <div className="border-b border-[#e8efed] px-5 py-4">
            <h3 className="font-extrabold text-[#29464e]">مؤشرات التشغيل</h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              حالة الوظائف الأساسية
            </p>
          </div>
          <div className="space-y-4 p-5">
            <HealthRow label="نقطة البيع" value="متصل ويعمل" color="green" />
            <HealthRow label="قاعدة البيانات" value="مزامنة" color="green" />
            <HealthRow
              label="الكتالوج العالمي"
              value="مشترك لجميع المتاجر"
              color="green"
            />
            <HealthRow
              label="الفترة الحالية"
              value="عرض حالة الاشتراك"
              color="blue"
            />
          </div>
          <div className="mx-5 mb-5 rounded-xl bg-[#f7faf9] p-3 text-[11px] leading-5 text-[#778b8c]">
            <div className="mb-1 flex items-center gap-2 font-extrabold text-[#3f5f65]">
              <ShieldCheck size={14} className="text-[#309a76]" /> نطاق البيانات
            </div>
            الفواتير خاصة بكل متجر، والمنتجات والأسعار مشتركة لجميع المستخدمين.
          </div>
        </section>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "green" | "yellow" | "blue";
}) {
  const colors = {
    green: "bg-[#e3f6ef] text-[#2c8c6d]",
    yellow: "bg-[#fff3cf] text-[#a37400]",
    blue: "bg-[#e6eef8] text-[#4778a8]",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-[#61777a]">{label}</span>
      <span
        className={`rounded-full px-2 py-1 text-[10px] font-bold ${colors[color]}`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-extrabold text-[#597175]">
        {label}
      </span>
      {children}
    </label>
  );
}

function InvoicesView() {
  const [search, setSearch] = useState("");
  const input = useMemo(() => ({ search }), [search]);
  const invoices = trpc.invoices.list.useQuery(input, { retry: false });
  return (
    <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8efed] px-5 py-4">
        <div>
          <h3 className="font-extrabold text-[#29464e]">سجل الفواتير</h3>
          <p className="mt-1 text-[11px] text-[#8a9c9c]">
            كل عملية محفوظة مع وقتها وطريقة الدفع
          </p>
        </div>
        <div className="flex w-full max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#93a3a3]"
              size={16}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث برقم الفاتورة"
              className="w-full rounded-xl border border-[#dfe9e5] bg-[#f8fbfa] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-[#77bca8]"
            />
          </div>
          <button
            onClick={() => window.print()}
            className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe9e5] bg-white px-3 text-xs font-bold text-[#526c70] hover:border-[#9dc8ba]"
          >
            <Printer size={15} /> طباعة
          </button>
        </div>
      </div>
      {invoices.isLoading ? (
        <div className="p-12 text-center text-xs text-[#829394]">
          جارٍ تحميل الفواتير...
        </div>
      ) : invoices.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
              <tr>
                <th className="px-5 py-3">رقم الفاتورة</th>
                <th className="px-5 py-3">التاريخ</th>
                <th className="px-5 py-3">الفرع</th>
                <th className="px-5 py-3">طريقة الدفع</th>
                <th className="px-5 py-3">الإجمالي</th>
                <th className="px-5 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.map(invoice => (
                <tr
                  key={invoice.id}
                  className="border-t border-[#eef3f1] text-xs"
                >
                  <td className="mono px-5 py-4 font-semibold text-[#36535a]">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-5 py-4 text-[#76888a]">
                    {new Date(invoice.createdAt).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-5 py-4 text-[#76888a]">الفرع الرئيسي</td>
                  <td className="px-5 py-4 text-[#76888a]">
                    {invoice.paymentMethod === "CASH"
                      ? "نقدي"
                      : invoice.paymentMethod}
                  </td>
                  <td className="px-5 py-4 font-extrabold text-[#29464e]">
                    {money(invoice.total)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-[#e7f6f0] px-2 py-1 text-[10px] font-bold text-[#2a8064]">
                      مدفوعة
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={20} />}
          title="لا توجد فواتير"
          body="بعد إنشاء أول فاتورة من شاشة نقطة البيع، ستظهر تفاصيلها هنا."
        />
      )}
    </section>
  );
}

function UsersView() {
  const users = trpc.users.list.useQuery(undefined, { retry: false });
  return (
    <section className="soft-shadow overflow-hidden rounded-2xl border border-[#e0e9e6] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8efed] px-5 py-4">
        <div>
          <h3 className="font-extrabold text-[#29464e]">فريق العمل</h3>
          <p className="mt-1 text-[11px] text-[#8a9c9c]">
            الأدوار والصلاحيات داخل المتجر
          </p>
        </div>
      </div>
      {users.isLoading ? (
        <div className="p-10 text-center text-xs text-[#829394]">
          جارٍ تحميل المستخدمين...
        </div>
      ) : users.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-[#f8fbfa] text-[10px] font-extrabold text-[#88999a]">
              <tr>
                <th className="px-5 py-3">المستخدم</th>
                <th className="px-5 py-3">البريد</th>
                <th className="px-5 py-3">الدور</th>
                <th className="px-5 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map(user => (
                <tr key={user.id} className="border-t border-[#eef3f1] text-xs">
                  <td className="flex items-center gap-3 px-5 py-3 font-extrabold text-[#34515a]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f4f0] text-xs font-extrabold text-[#287e64]">
                      {(user.name || "م").slice(0, 1)}
                    </div>
                    {user.name || "مستخدم"}
                  </td>
                  <td className="px-5 py-3 text-[#76888a]">
                    {user.email || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-[#e8eef7] px-2 py-1 text-[10px] font-bold text-[#486e96]">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.isActive === false ? "bg-[#fce8e7] text-[#a83d42]" : "bg-[#e7f6f0] text-[#2a8064]"}`}
                    >
                      {user.isActive === false ? "معطّل" : "نشط"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Users size={20} />}
          title="لا يوجد مستخدمون بعد"
          body="سيتولى نظام المصادقة إنشاء مالك المتجر عند أول تسجيل دخول."
        />
      )}
    </section>
  );
}

function SettingsView({
  user,
}: {
  user:
    | { name?: string | null; email?: string | null; role?: string }
    | null
    | undefined;
}) {
  const settings = trpc.settings.get.useQuery();
  const [printerStatus, setPrinterStatus] = useState<"غير محدد" | "تم اختياره">(
    "غير محدد"
  );
  const [form, setForm] = useState({
    name: "",
    phone: "",
    secondaryPhone: "",
    address: "",
    receiptHeader: "",
    receiptFooter: "شكرًا لزيارتكم",
    receiptWidth: "80mm" as "58mm" | "80mm" | "A4",
    showReceiptLogo: false,
    printerName: "",
  });
  useEffect(() => {
    if (settings.data)
      setForm({
        name: settings.data.name ?? "",
        phone: settings.data.phone ?? "",
        secondaryPhone: settings.data.secondaryPhone ?? "",
        address: settings.data.address ?? "",
        receiptHeader: settings.data.receiptHeader ?? "",
        receiptFooter: settings.data.receiptFooter ?? "شكرًا لزيارتكم",
        receiptWidth: settings.data.receiptWidth ?? "80mm",
        showReceiptLogo: Boolean(settings.data.showReceiptLogo),
        printerName: settings.data.printerName ?? "",
      });
  }, [settings.data]);
  const update = trpc.settings.updateStore.useMutation({
    onSuccess: store => {
      setForm(current => ({
        ...current,
        ...store,
        phone: store.phone ?? "",
        secondaryPhone: store.secondaryPhone ?? "",
        address: store.address ?? "",
        receiptHeader: store.receiptHeader ?? "",
        receiptFooter: store.receiptFooter ?? "",
      }));
      toast.success("تم حفظ إعدادات المتجر والفاتورة");
      void settings.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm(current => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    update.mutate({
      ...form,
      phone: form.phone || null,
      secondaryPhone: form.secondaryPhone || null,
      address: form.address || null,
      receiptHeader: form.receiptHeader || null,
      receiptFooter: form.receiptFooter || null,
      printerName: form.printerName || null,
    });
  };
  const connectPrinter = async () => {
    const bluetooth = (
      navigator as Navigator & {
        bluetooth?: {
          requestDevice(options: unknown): Promise<{ name?: string }>;
        };
      }
    ).bluetooth;
    if (!bluetooth) {
      toast.error(
        "المتصفح لا يدعم Bluetooth Web. استخدم Chrome على Android أو استخدم الطباعة النظامية."
      );
      return;
    }
    try {
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["generic_access", "battery_service"],
      });
      set("printerName", device.name || "طابعة Bluetooth");
      setPrinterStatus("تم اختياره");
      toast.success(`تم اختيار ${device.name || "الطابعة"}؛ أكمل الطباعة من نافذة المتصفح.`);
    } catch {
      toast.info("تم إلغاء اختيار الطابعة أو لم يتم منح الإذن.");
    }
  };
  const previewReceipt = () => {
    const popup = window.open("", "_blank", "width=520,height=760");
    if (!popup) {
      toast.error("اسمح بالنوافذ المنبثقة لهذا الموقع لعرض معاينة الإيصال.");
      return;
    }
    const escape = (value: string, fallback: string) =>
      (value || fallback)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    popup.opener = null;
    const pageSize = form.receiptWidth === "A4" ? "A4 portrait" : `${form.receiptWidth} auto`;
    const sampleName = escape(form.name, "اسم النشاط");
    const sampleAddress = escape(form.address, "العنوان");
    const samplePhone = escape(form.phone, "رقم الهاتف");
    const sampleHeader = escape(form.receiptHeader, "معاينة الإيصال");
    const sampleFooter = escape(form.receiptFooter, "شكرًا لزيارتكم");
    popup.document.write(
      `<html dir="rtl"><head><meta charset="UTF-8"><title>معاينة إيصال سوقي</title><style>@page{size:${pageSize};margin:5mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#152d32;margin:0;background:#eef3f1;padding:18px}.controls{display:flex;gap:8px;justify-content:center;margin:0 auto 14px}.controls button{border:0;border-radius:8px;background:#0f5d4d;color:#fff;font-weight:700;padding:10px 14px;cursor:pointer}.controls button:last-child{background:#e3ebe7;color:#34515a}.paper{background:white;margin:auto;padding:14px;width:100%;max-width:${form.receiptWidth === "A4" ? "190mm" : form.receiptWidth};box-shadow:0 5px 22px #17364522;text-align:center}.paper h2{margin:4px 0;font-size:18px}.meta,.footer{font-size:11px;line-height:1.7;color:#526c70}.dash{border:0;border-top:1px dashed #748887;margin:12px 0}.receipt-title{font-weight:bold}.line{display:flex;justify-content:space-between;gap:10px;text-align:right;font-size:12px;margin:8px 0}.total{font-weight:800;font-size:15px}.disclaimer{font-size:10px;color:#8a9c9c;margin-top:10px}@media print{body{background:white;padding:0}.controls,.disclaimer{display:none}.paper{box-shadow:none;max-width:none}}</style></head><body><div class="controls"><button onclick="window.print()">طباعة من المتصفح</button><button onclick="window.close()">إغلاق</button></div><main class="paper"><h2>${sampleName}</h2><div class="meta">${sampleAddress}<br>${samplePhone}</div><hr class="dash"><div class="receipt-title">${sampleHeader}</div><p class="meta">معاينة فقط · ${new Date().toLocaleDateString("ar-EG")}</p><hr class="dash"><div class="line"><span>مياه معدنية · ١ × ١٢٫٥٠</span><strong>١٢٫٥٠ ج.م</strong></div><hr class="dash"><div class="line total"><span>الإجمالي</span><strong>١٢٫٥٠ ج.م</strong></div><div class="footer">${sampleFooter}</div></main><p class="disclaimer">هذه معاينة تجريبية فقط ولا تُنشئ فاتورة أو تحفظ بيعًا.</p></body></html>`
    );
    popup.document.close();
  };
  return (
    <div className="space-y-5">
      <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8eef7] text-[#476f9b]">
            <UserRound size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[#29464e]">الحساب الحالي</h3>
            <p className="mt-1 text-[11px] text-[#8a9c9c]">
              بيانات الدخول وصلاحية الحساب
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-bold text-[#829394]">الاسم</div>
            <div className="mt-1 text-xs font-extrabold text-[#34515a]">
              {user?.name || "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#829394]">
              البريد الإلكتروني
            </div>
            <div className="mt-1 break-all text-xs font-extrabold text-[#34515a]">
              {user?.email || "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#829394]">الصلاحية</div>
            <div className="mt-1 text-xs font-extrabold text-[#34515a]">
              {user?.role || "—"}
            </div>
          </div>
        </div>
      </section>
      <form onSubmit={submit} className="space-y-5">
        <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7eef8] text-[#476f9b]">
              <Store size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-[#29464e]">بيانات النشاط</h3>
              <p className="text-[11px] text-[#8a9c9c]">
                تظهر هذه البيانات في الحساب والفاتورة
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="اسم النشاط">
              <input
                required
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="اسم المتجر أو النشاط"
              />
            </Field>
            <Field label="رقم الهاتف الأساسي">
              <input
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="01xxxxxxxxx"
              />
            </Field>
            <Field label="رقم هاتف إضافي">
              <input
                value={form.secondaryPhone}
                onChange={e => set("secondaryPhone", e.target.value)}
                placeholder="رقم واتساب أو هاتف آخر"
              />
            </Field>
            <Field label="العنوان">
              <input
                value={form.address}
                onChange={e => set("address", e.target.value)}
                placeholder="العنوان بالتفصيل"
              />
            </Field>
          </div>
        </section>
        <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff3cf] text-[#9a7100]">
              <Receipt size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-[#29464e]">تخصيص الفاتورة</h3>
              <p className="text-[11px] text-[#8a9c9c]">
                تحكم في النصوص ومقاس ورقة الطباعة
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="عنوان أعلى الفاتورة">
              <input
                value={form.receiptHeader}
                onChange={e => set("receiptHeader", e.target.value)}
                placeholder="فاتورة مبيعات"
              />
            </Field>
            <Field label="رسالة أسفل الفاتورة">
              <input
                value={form.receiptFooter}
                onChange={e => set("receiptFooter", e.target.value)}
                placeholder="شكرًا لزيارتكم"
              />
            </Field>
            <Field label="مقاس الورق">
              <select
                value={form.receiptWidth}
                onChange={e => set("receiptWidth", e.target.value)}
              >
                <option value="58mm">حراري 58 مم</option>
                <option value="80mm">حراري 80 مم</option>
                <option value="A4">A4</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 self-end rounded-xl bg-[#f8fbfa] p-3 text-xs font-bold text-[#526c70]">
              <input
                type="checkbox"
                checked={form.showReceiptLogo}
                onChange={e => set("showReceiptLogo", e.target.checked)}
              />{" "}
              إظهار شعار النشاط في الفاتورة
            </label>
          </div>
        </section>
        <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f5f0] text-[#267a60]">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-[#29464e]">الطابعة</h3>
              <p className="text-[11px] text-[#8a9c9c]">
                اختر طابعة متوافقة أو استخدم نافذة الطباعة النظامية
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={connectPrinter}
              className="rounded-xl bg-[#0f5d4d] px-4 py-3 text-xs font-extrabold text-white"
            >
                {printerStatus === "تم اختياره"
                ? "اختيار طابعة أخرى"
                : "اختيار طابعة Bluetooth"}
            </button>
            <button
              type="button"
              onClick={previewReceipt}
              className="rounded-xl border border-[#dfe9e5] px-4 py-3 text-xs font-extrabold text-[#526c70]"
            >
              معاينة الإيصال والطباعة
            </button>
            <span
              className={`rounded-full px-3 py-2 text-[11px] font-bold ${printerStatus === "تم اختياره" ? "bg-[#e7f6f0] text-[#267a60]" : "bg-[#fff3cf] text-[#9a7100]"}`}
            >
              {printerStatus} {form.printerName && `· ${form.printerName}`}
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#87999a]">
            اختيار جهاز Bluetooth لا يثبت اتصالًا أو بروتوكول طباعة مباشرًا؛ التوافق يتوقف على الطابعة والمتصفح. زر المعاينة يفتح إيصالًا تجريبيًا غير محفوظ ثم يسمح بالطباعة. إذا لم تظهر النافذة، اسمح بالنوافذ المنبثقة لهذا الموقع.
          </p>
        </section>
        <button
          disabled={update.isPending || settings.isLoading}
          className="w-full rounded-xl bg-[#0f5d4d] py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {update.isPending ? "جارٍ الحفظ..." : "حفظ كل الإعدادات"}
        </button>
      </form>
      <section className="soft-shadow rounded-2xl border border-[#e0e9e6] bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8eef7] text-[#476f9b]">
            <Zap size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[#29464e]">اختصارات الكاشير</h3>
            <p className="text-[11px] text-[#8a9c9c]">لتقليل استخدام الماوس</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Shortcut keys="F2" label="فتح نقطة البيع" />
          <Shortcut keys="Enter" label="إضافة الباركود" />
          <Shortcut keys="Ctrl + P" label="طباعة الفاتورة" />
          <Shortcut keys="Esc" label="إلغاء الحقل الحالي" />
        </div>
      </section>
    </div>
  );
}
function SettingRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf2f0] py-3 last:border-0">
      <span className="text-xs font-bold text-[#637a7d]">{label}</span>
      <div className="flex items-center gap-2 text-xs font-extrabold text-[#34545c]">
        {value}
        {action && (
          <button className="rounded-lg bg-[#e7f5f0] px-2 py-1 text-[10px] text-[#267a60]">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[#f8fbfa] px-3 py-2.5">
      <span className="text-xs font-bold text-[#5e777a]">{label}</span>
      <kbd className="rounded-md border border-[#d7e3df] bg-white px-2 py-1 text-[10px] font-extrabold text-[#557074]">
        {keys}
      </kbd>
    </div>
  );
}

function MobileBottomNav({
  path,
  navigate,
  role,
}: {
  path: string;
  navigate: (path: string) => void;
  role: string;
}) {
  const items: Pick<NavItem, "path" | "label" | "icon">[] = [
    { path: "/pos", label: "البيع", icon: ShoppingCart },
    { path: "/products", label: "المنتجات", icon: Boxes },
  ];
  if (role !== "CASHIER") {
    items.push(
      { path: "/invoices", label: "الفواتير", icon: Receipt },
      { path: "/subscriptions", label: "الاشتراك", icon: CreditCard },
      { path: "/settings", label: "المتجر", icon: Settings }
    );
  }
  if (role === "SUPER_ADMIN")
    items.push({ path: "/super-admin", label: "الإدارة", icon: ShieldCheck });
  const columnsClass =
    items.length === 2
      ? "grid-cols-2"
      : items.length === 5
        ? "grid-cols-5"
        : "grid-cols-6";
  return (
    <nav
      className={`fixed inset-x-3 bottom-3 z-30 grid ${columnsClass} rounded-2xl border border-[#d7e6e0] bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(21,55,61,0.18)] backdrop-blur lg:hidden`}
      aria-label="التنقل السريع"
    >
      {items.map(item => {
        const Icon = item.icon;
        const active = path === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold ${active ? "bg-[#b8efdc] text-[#08231e]" : "text-[#718688]"}`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function Home() {
  const {
    user,
    loading,
    isAuthenticated,
    logout,
    signIn,
    signUp,
    firebaseConfigured,
    sessionIssue,
  } = useAuth();
  const role = String(user?.role || "OWNER");
  const online = useOnlineStatus();
  const [location, navigate] = useLocation();
  const bootstrap = trpc.bootstrap.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const metrics = trpc.dashboard.metrics.useQuery(undefined, {
    enabled: isAuthenticated && role !== "CASHIER",
    retry: false,
  });
  const subscriptionAccess = trpc.subscription.access.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const requestedSection =
    location === "/" ? (isAuthenticated ? "/pos" : "/") : location;
  const section =
    role === "CASHIER" && managerOnlyPaths.has(requestedSection)
      ? "/pos"
      : requestedSection;
  const current = navItems.find(item => item.path === section);
  useEffect(() => {
    if (isAuthenticated && location === "/") navigate("/pos");
    else if (
      isAuthenticated &&
      role === "CASHIER" &&
      managerOnlyPaths.has(location)
    )
      navigate("/pos");
  }, [isAuthenticated, location, role, navigate]);
  if (!isAuthenticated)
    return (
      <PublicWelcome
        loading={loading}
        signIn={signIn}
        signUp={signUp}
        firebaseConfigured={firebaseConfigured}
        sessionIssue={sessionIssue}
      />
    );
  if (
    role !== "SUPER_ADMIN" &&
    subscriptionAccess.isSuccess &&
    !subscriptionAccess.data?.isActive
  )
    return (
      <SubscriptionExpiredView
        access={subscriptionAccess.data}
        onLogout={() => void logout()}
      />
    );
  const title =
    section === "/pos"
      ? "نقطة البيع"
      : section === "/dashboard"
        ? "نظرة عامة"
        : section === "/products"
          ? "المنتجات"
          : section === "/invoices"
            ? "الفواتير"
            : section === "/reports"
              ? "التقارير"
              : section === "/users"
                ? "المستخدمون"
                : section === "/branches"
                  ? "الفروع"
                  : section === "/subscriptions"
                    ? "الاشتراك"
                    : section === "/settings"
                      ? "إعدادات المتجر"
                      : section === "/super-admin"
                        ? "الإدارة العليا"
                        : current?.label || "المتجر";
  const subtitle =
    section === "/pos"
      ? "امسح، أضف، احفظ — بدون توقف"
      : section === "/dashboard"
        ? "ملخص أداء المتجر وحركة التشغيل"
        : "إدارة بيانات المتجر بصلاحيات واضحة";
  const view =
    section === "/pos" ? (
      <PosView role={role} userId={user?.id || 0} online={online} />
    ) : section === "/dashboard" ? (
      <DashboardView metrics={metrics.data || bootstrap.data?.metrics} />
    ) : section === "/products" ? (
      <GlobalProductsView />
    ) : section === "/invoices" ? (
      <InvoicesView />
    ) : section === "/subscriptions" ? (
      <SubscriptionView />
    ) : section === "/users" ? (
      <UsersView />
    ) : section === "/settings" ? (
      <SettingsView user={user} />
    ) : section === "/super-admin" && role === "SUPER_ADMIN" ? (
      <SuperAdminPanel />
    ) : (
      <DashboardView metrics={metrics.data || bootstrap.data?.metrics} />
    );
  return (
    <div className="flex min-h-screen bg-[#f2f6f4]" dir="rtl">
      <Sidebar
        path={section}
        navigate={navigate}
        role={role}
        onLogout={() => void logout()}
        user={user}
        storeName={bootstrap.data?.tenant?.name}
      />
      <main className="min-w-0 flex-1">
        <Header
          title={title}
          subtitle={subtitle}
          navigate={navigate}
          onLogout={() => void logout()}
          online={online}
        />
        <div className="container pb-24 pt-5 sm:py-7">
          {!online && section !== "/pos" ? (
            <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-[#f0d8d8] bg-[#fff2ef] px-4 py-3 text-xs leading-5 text-[#8d3d40]">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#bd4448]" />
              <span><strong>لا يوجد اتصال بالإنترنت.</strong> بيانات الإدارة والبحث عن المنتجات وحفظ الفواتير تحتاج إلى اتصال بالخادم.</span>
            </div>
          ) : null}
          {metrics.isError && section !== "/pos" ? (
            <div className="mb-4 rounded-xl border border-[#f1d7b3] bg-[#fff8e9] px-4 py-3 text-xs font-semibold text-[#8b6500]">
              تعذر تحميل بعض الإحصاءات الآن، لكن يمكنك متابعة العمل من نقطة
              البيع.
            </div>
          ) : null}
          {view}
        </div>
      </main>
      <MobileBottomNav path={section} navigate={navigate} role={role} />
    </div>
  );
}

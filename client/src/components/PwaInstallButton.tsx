import { Download, PlusSquare, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform?: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

let pendingInstallPrompt: BeforeInstallPromptEvent | null = null;
let appWasInstalled = false;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pendingInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("souqi:beforeinstallprompt"));
  });
  window.addEventListener("appinstalled", () => {
    appWasInstalled = true;
    pendingInstallPrompt = null;
    window.dispatchEvent(new Event("souqi:appinstalled"));
  });
}

function isStandaloneMode() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => pendingInstallPrompt);
  const [installed, setInstalled] = useState(() => appWasInstalled || isStandaloneMode());
  const [isIos, setIsIos] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneMode() || appWasInstalled);
    const userAgent = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);

    const onBeforeInstall = () => setDeferredPrompt(pendingInstallPrompt);
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setHelpOpen(false);
    };

    window.addEventListener("souqi:beforeinstallprompt", onBeforeInstall);
    window.addEventListener("souqi:appinstalled", onInstalled);
    return () => {
      window.removeEventListener("souqi:beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("souqi:appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!deferredPrompt) {
      setHelpOpen(current => !current);
      return;
    }
    const prompt = deferredPrompt;
    pendingInstallPrompt = null;
    setDeferredPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setHelpOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        aria-expanded={helpOpen}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#b9dcd0] bg-[#e9f7f1] px-3 text-[11px] font-extrabold text-[#0f5d4d] transition hover:bg-[#d8f2e8]"
      >
        <Download size={15} />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
        <span className="sm:hidden">تثبيت</span>
      </button>

      {helpOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#031018]/65 p-3 backdrop-blur-sm sm:items-center"
          dir="rtl"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            className="w-full max-w-md rounded-3xl border border-[#dce9e4] bg-white p-5 shadow-2xl sm:p-6"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#287e64]">
                  <Download size={15} /> تطبيق سوقي على هاتفك
                </div>
                <h2 id="pwa-install-title" className="mt-2 text-lg font-extrabold text-[#183741]">
                  {isIos ? "أضف سوقي إلى الشاشة الرئيسية" : "ثبّت سوقي كتطبيق"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="إغلاق تعليمات التثبيت"
                className="rounded-xl p-2 text-[#718688] hover:bg-[#f1f6f4]"
              >
                <X size={18} />
              </button>
            </header>

            {isIos ? (
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[#526c70]">
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f6f1] text-[#0f6e58]">١</span><span>افتح الموقع في متصفح Safari؛ تثبيت iPhone لا يبدأ من Chrome أو Edge.</span></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f6f1] text-[#0f6e58]"><Share2 size={15} /></span><span>اضغط زر المشاركة أسفل الشاشة.</span></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f6f1] text-[#0f6e58]"><PlusSquare size={15} /></span><span>اختر «إضافة إلى الشاشة الرئيسية»، ثم اضغط «إضافة».</span></li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[#526c70]">
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f6f1] text-[#0f6e58]">١</span><span>إذا ظهر طلب التثبيت، وافق عليه لإضافة التطبيق إلى الهاتف.</span></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f6f1] text-[#0f6e58]">٢</span><span>إن لم يظهر، افتح قائمة المتصفح ⋮ واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</span></li>
              </ol>
            )}
            <p className="mt-4 rounded-xl bg-[#f5f9f7] p-3 text-[11px] leading-5 text-[#718688]">
              بعد التثبيت سيظهر سوقي كأيقونة مستقلة. يلزم اتصال إنترنت لتسجيل الدخول والبحث وحفظ الفواتير.
            </p>
          </section>
        </div>
      )}
    </>
  );
}

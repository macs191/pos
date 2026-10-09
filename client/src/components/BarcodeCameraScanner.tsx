import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BarcodeCameraScannerProps = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  scanMode?: "single" | "continuous";
  presentation?: "modal" | "inline";
};

type FacingMode = "environment" | "user";

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "لم يُسمح باستخدام الكاميرا. فعّل الإذن من إعدادات الموقع، وتأكد من فتحه عبر HTTPS.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "لم نعثر على هذه الكاميرا. جرّب التبديل بين الخلفية والأمامية أو استخدم الإدخال اليدوي.";
  if (name === "NotReadableError")
    return "الكاميرا مشغولة بتطبيق آخر. أغلق التطبيق الذي يستخدمها ثم أعد المحاولة.";
  return "تعذر تشغيل الكاميرا. استخدم الإدخال اليدوي مؤقتًا أو أبلغ عن المشكلة.";
}

export function BarcodeCameraScanner({
  open,
  onClose,
  onDetected,
  scanMode = "continuous",
  presentation = "modal",
}: BarcodeCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const initializedOpenRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const lastScanRef = useRef<{ value: string } | null>(null);
  const rearmTimerRef = useRef<number | null>(null);
  const completedSingleScanRef = useRef(false);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [visibilityVersion, setVisibilityVersion] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const onVisibilityChange = () => setVisibilityVersion(value => value + 1);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
    if (document.visibilityState === "hidden") return;
    if (!initializedOpenRef.current) {
      initializedOpenRef.current = true;
      if (facingMode !== "environment") {
        setFacingMode("environment");
        return;
      }
    }

    let cancelled = false;
    setError(null);
    setDetected(null);
    setStarting(true);
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    lastScanRef.current = null;
    completedSingleScanRef.current = false;

    const start = async () => {
      if (!videoRef.current) return;
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 80,
          delayBetweenScanSuccess: 150,
          tryPlayVideoTimeout: 7000,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { exact: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 30 },
            },
          },
          videoRef.current,
          (result, _scanError) => {
            if (cancelled) return;
            if (!result) {
              if (
                scanMode === "continuous" &&
                lastScanRef.current &&
                rearmTimerRef.current === null
              ) {
                rearmTimerRef.current = window.setTimeout(() => {
                  lastScanRef.current = null;
                  rearmTimerRef.current = null;
                  setDetected(null);
                }, 900);
              }
              return;
            }
            if (scanMode === "single" && completedSingleScanRef.current) return;
            if (rearmTimerRef.current !== null) {
              window.clearTimeout(rearmTimerRef.current);
              rearmTimerRef.current = null;
            }
            const value = result.getText().trim();
            if (!value) return;
            if (scanMode === "continuous" && lastScanRef.current?.value === value) return;
            lastScanRef.current = { value };
            if (scanMode === "single") completedSingleScanRef.current = true;
            setDetected(value);
            onDetectedRef.current(value);
          }
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
        if (!cancelled) setStarting(false);
      } catch (startError) {
        if (cancelled) return;
        setStarting(false);
        setError(cameraErrorMessage(startError));
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
        rearmTimerRef.current = null;
      }
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, facingMode, scanMode, retryToken, visibilityVersion]);

  if (!open) return null;

  const toggleCamera = () => setFacingMode(current => current === "environment" ? "user" : "environment");
  const cameraLabel = facingMode === "environment" ? "الخلفية" : "الأمامية";
  const title = scanMode === "single" ? "مسح باركود المنتج" : "ماسح البيع المباشر";
  const reportUrl = `https://wa.me/201033148828?text=${encodeURIComponent("أواجه مشكلة في كاميرا ماسح الباركود. الرجاء المساعدة.")}`;

  const frame = (
    <div className={`relative overflow-hidden bg-[#020b10] ${presentation === "inline" ? "aspect-video max-h-[520px]" : "aspect-[4/3]"}`}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={`h-full w-full object-contain ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={`relative rounded-2xl border-2 border-[#b8efdc] shadow-[0_0_0_999px_rgba(0,0,0,0.24)] ${presentation === "inline" ? "h-32 w-64 sm:h-40 sm:w-80" : "h-36 w-64"}`}>
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[#b8efdc]/35" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-[#b8efdc]/35" />
        </div>
      </div>
      {starting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020b10]/75 text-sm font-bold text-white">
          <Loader2 className="animate-spin text-[#b8efdc]" size={28} />
          جارٍ تشغيل الكاميرا {cameraLabel} بجودة عالية...
        </div>
      )}
      {detected && !error && (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-[#b8efdc] px-3 py-2 text-xs font-extrabold text-[#08231e] sm:inset-x-5 sm:bottom-5">
          <CheckCircle2 size={16} /> تمت قراءة {detected} — وجّه الباركود التالي إلى الإطار
        </div>
      )}
      {error && (
        <div className="absolute inset-3 flex flex-col items-center justify-center overflow-y-auto rounded-2xl border border-[#754b4b] bg-[#2a1b21]/95 p-4 text-center sm:inset-6 sm:p-6">
          <CameraOff size={28} className="mb-2 shrink-0 text-[#ffb3aa]" />
          <div className="text-sm font-bold text-[#ffe8e4]">الكاميرا غير متاحة</div>
          <p className="mt-2 max-w-lg text-xs leading-6 text-[#e2c7c4]">{error}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setRetryToken(value => value + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#b8efdc] px-3 py-2 text-xs font-extrabold text-[#08231e]"
            >
              <RefreshCw size={14} /> إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className="rounded-lg border border-[#795d5d] px-3 py-2 text-xs font-bold text-[#ffe8e4]"
            >
              جرّب الكاميرا {facingMode === "environment" ? "الأمامية" : "الخلفية"}
            </button>
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#315362] px-3 py-2 text-xs font-bold text-[#c8dddd] hover:bg-[#123245]"
            >
              الإبلاغ عبر واتساب
            </a>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-[#bda4a2]">يمكنك متابعة البيع الآن بكتابة الباركود في الحقل اليدوي أسفل الكاميرا.</p>
        </div>
      )}
    </div>
  );

  if (presentation === "inline") {
    return (
      <section className="overflow-hidden rounded-2xl border border-[#173645] bg-[#071723] text-white shadow-[0_18px_48px_rgba(7,23,35,0.14)]" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c3b49] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#b8efdc] text-[#08231e]"><Camera size={18} /></div>
            <div>
              <h2 className="text-sm font-extrabold">{title}</h2>
              <p className="mt-0.5 text-[10px] text-[#9bb1b2]">المسح يعمل باستمرار — الوضع {cameraLabel} · وضوح تلقائي عالي</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${error ? "bg-[#5b2c32] text-[#ffd7d2]" : starting ? "bg-[#394044] text-[#d3dedb]" : "bg-[#123e36] text-[#b8efdc]"}`}>
              {error ? "تحتاج إجراء" : starting ? "جارٍ الاتصال" : "الكاميرا نشطة"}
            </span>
            <button type="button" onClick={toggleCamera} className="rounded-lg border border-[#315362] px-3 py-2 text-[10px] font-extrabold text-[#c8dddd] hover:bg-[#123245]" aria-label="تبديل الكاميرا الأمامية والخلفية">
              تبديل · {facingMode === "environment" ? "للأمامية" : "للخلفية"}
            </button>
          </div>
        </header>
        {frame}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[10px] text-[#92aaac] sm:px-5">
          <span>{detected ? `آخر باركود: ${detected}` : "وجّه الباركود داخل الإطار — لا حاجة لالتقاط صورة"}</span>
          <span>تتوقف الكاميرا عند مغادرة شاشة البيع أو إخفاء التطبيق.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#031018]/85 p-4 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#315362] bg-[#071723] text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-[#1e3d4b] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b8efdc] text-[#08231e]"><Camera size={19} /></div>
            <div>
              <h2 className="font-extrabold">{scanMode === "single" ? "مسح باركود المنتج" : "مسح مستمر للفاتورة"}</h2>
              <p className="mt-0.5 text-[11px] text-[#93adb0]">الكاميرا {cameraLabel} · {scanMode === "single" ? "تُفتح تفاصيل المنتج بعد القراءة" : "امسح المنتجات بالتتابع"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleCamera} aria-label="تبديل الكاميرا الأمامية والخلفية" className="rounded-xl border border-[#315362] px-3 py-2 text-[11px] font-bold text-[#c8dddd] hover:bg-[#123245]">تبديل الكاميرا</button>
            <button type="button" onClick={onClose} aria-label="إغلاق الكاميرا" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#123245] text-[#b5cccb] hover:text-white"><X size={18} /></button>
          </div>
        </div>
        {frame}
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="text-[11px] leading-5 text-[#8da7aa]">{scanMode === "single" ? "ستُغلق الكاميرا بعد القراءة وتظهر نافذة بيانات المنتج." : "المسح مستمر؛ انتظر اختفاء الرمز من الإطار قبل مسحه مرة أخرى."}</div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-[#315362] px-3 py-2 text-xs font-bold text-[#c8dddd] hover:bg-[#123245]">إغلاق</button>
        </div>
      </div>
    </div>
  );
}

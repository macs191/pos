import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BarcodeCameraScannerProps = {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  scanMode?: "single" | "continuous";
};

type FacingMode = "environment" | "user";

export function BarcodeCameraScanner({
  open,
  onClose,
  onDetected,
  scanMode = "continuous",
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

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
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
          delayBetweenScanSuccess: 120,
          tryPlayVideoTimeout: 5000,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { exact: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, _error) => {
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
            const last = lastScanRef.current;
            if (scanMode === "continuous" && last?.value === value) return;
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
        const name = startError instanceof DOMException ? startError.name : "";
        setError(
          name === "NotAllowedError"
            ? "لم يتم السماح باستخدام الكاميرا. فعّل الإذن من إعدادات المتصفح ثم حاول مرة أخرى."
            : "تعذر تشغيل هذه الكاميرا. جرّب تبديل الأمامية والخلفية أو استخدم حقل الباركود اليدوي."
        );
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
  }, [open, facingMode, scanMode]);

  if (!open) return null;

  const toggleCamera = () =>
    setFacingMode(current =>
      current === "environment" ? "user" : "environment"
    );
  const facingLabel = facingMode === "environment" ? "الخلفية" : "الأمامية";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#031018]/85 p-4 backdrop-blur-sm"
      dir="rtl"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#315362] bg-[#071723] text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-[#1e3d4b] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b8efdc] text-[#08231e]">
              <Camera size={19} />
            </div>
            <div>
              <h2 className="font-extrabold">
                {scanMode === "single"
                  ? "مسح باركود المنتج"
                  : "مسح مستمر للفاتورة"}
              </h2>
              <p className="mt-0.5 text-[11px] text-[#93adb0]">
                الكاميرا {facingLabel} ·{" "}
                {scanMode === "single"
                  ? "تُفتح تفاصيل المنتج بعد القراءة"
                  : "امسح المنتجات بالتتابع"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCamera}
              aria-label="تبديل الكاميرا الأمامية والخلفية"
              className="rounded-xl border border-[#315362] px-3 py-2 text-[11px] font-bold text-[#c8dddd] hover:bg-[#123245]"
            >
              تبديل الكاميرا
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الكاميرا"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#123245] text-[#b5cccb] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="relative aspect-[4/3] bg-[#020b10]">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-36 w-64 rounded-2xl border-2 border-[#b8efdc] shadow-[0_0_0_999px_rgba(0,0,0,0.28)]">
              <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[#b8efdc]/35" />
              <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-[#b8efdc]/35" />
            </div>
          </div>
          {starting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020b10]/70 text-sm font-bold">
              <Loader2 className="animate-spin text-[#b8efdc]" size={26} />
              جارٍ تشغيل الكاميرا {facingLabel}...
            </div>
          )}
          {detected && (
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-xl bg-[#b8efdc] px-3 py-2 text-xs font-extrabold text-[#08231e]">
              <CheckCircle2 size={16} /> تمت قراءة {detected} — وجّه الباركود
              التالي إلى الإطار
            </div>
          )}
          {error && (
            <div className="absolute inset-4 flex flex-col items-center justify-center rounded-2xl border border-[#754b4b] bg-[#2a1b21]/95 p-6 text-center">
              <CameraOff size={28} className="mb-3 text-[#ffb3aa]" />
              <div className="text-sm font-bold text-[#ffe8e4]">
                الكاميرا غير متاحة
              </div>
              <p className="mt-2 text-xs leading-6 text-[#d7b8b5]">{error}</p>
              <button
                type="button"
                onClick={toggleCamera}
                className="mt-3 rounded-lg border border-[#795d5d] px-3 py-2 text-xs font-bold text-[#ffe8e4]"
              >
                جرّب الكاميرا{" "}
                {facingMode === "environment" ? "الأمامية" : "الخلفية"}
              </button>
              <a
                href={`https://wa.me/201033148828?text=${encodeURIComponent("أواجه مشكلة في كاميرا ماسح الباركود. الرجاء المساعدة.")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 rounded-lg border border-[#315362] px-3 py-2 text-xs font-bold text-[#c8dddd] hover:bg-[#123245]"
              >
                الإبلاغ عن المشكلة عبر واتساب
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="text-[11px] leading-5 text-[#8da7aa]">
            {scanMode === "single"
              ? "ستُغلق الكاميرا بعد القراءة وتظهر نافذة بيانات المنتج."
              : "المسح مستمر. لن يضيف الماسح الرمز نفسه مرة أخرى حتى يختفي من الإطار، ثم يظهر مجددًا."}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-[#315362] px-3 py-2 text-xs font-bold text-[#c8dddd] hover:bg-[#123245]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

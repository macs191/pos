import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import { VoiceCommandButton, speakArabic } from "@/components/VoiceCommandButton";
import { clearPosDraft, loadPosDraft, savePosDraft } from "@/lib/pos-draft";
import { trpc } from "@/lib/trpc";
import { addProductToCart, cartSubtotal, type PosCartLine } from "@shared/pos";
import {
  Activity,
  Check,
  ChevronLeft,
  CreditCard,
  Minus,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildInvoiceAnnouncement,
  isNewInvoiceVoiceCommand,
  isSaveVoiceCommand,
  parseVoiceProductPhrase,
} from "@shared/voice";

type CartLine = PosCartLine;
type PosViewProps = { role: string; userId: number; online: boolean };

const money = (value: number | string | null | undefined) =>
  `${Number(value ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const integer = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("ar-EG");

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function PosView({ role, userId, online }: PosViewProps) {
  const [cart, setCart] = useState<CartLine[]>(() =>
    loadPosDraft(browserStorage(), userId)
  );
  const cartRef = useRef<CartLine[]>(cart);
  const undoStackRef = useRef<CartLine[][]>([]);
  const checkoutPendingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [restoredDraft, setRestoredDraft] = useState(() => cart.length > 0);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanStatus, setScanStatus] = useState("الكاميرا جاهزة للمسح المستمر");
  const [queueLength, setQueueLength] = useState(0);
  const [voiceInvoiceMode, setVoiceInvoiceMode] = useState(false);
  const [pendingVoiceName, setPendingVoiceName] = useState<string | null>(null);
  const [feedbackEnabled, setFeedbackEnabled] = useState(() => {
    const storage = browserStorage();
    try {
      return storage?.getItem(`souqi:scan-feedback:${userId}`) !== "false";
    } catch {
      return true;
    }
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const lookup = trpc.products.lookupByBarcode.useMutation();
  const voiceLookup = trpc.products.lookupByName.useMutation();
  const createInvoice = trpc.pos.createInvoice.useMutation();
  const canPay = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "SUPER_ADMIN"].includes(role);
  const total = cartSubtotal(cart);

  const updateCart = useCallback((transform: (current: CartLine[]) => CartLine[]) => {
    const current = cartRef.current;
    const next = transform(current);
    if (next === current) return;
    undoStackRef.current = [...undoStackRef.current, current.map(line => ({ ...line }))].slice(-20);
    cartRef.current = next;
    setCart(next);
    setUndoCount(undoStackRef.current.length);
  }, []);

  const resetCartAfterSuccess = useCallback(() => {
    cartRef.current = [];
    setCart([]);
    undoStackRef.current = [];
    setUndoCount(0);
    setRestoredDraft(false);
    setBarcode("");
    setScanStatus("تم حفظ الفاتورة — جاهز للمسح التالي");
  }, []);

  useEffect(() => {
    const storage = browserStorage();
    if (!cart.length) {
      clearPosDraft(storage, userId);
      setDraftSaveFailed(false);
      return;
    }
    setDraftSaveFailed(!savePosDraft(storage, userId, cart));
  }, [cart, userId]);

  useEffect(() => {
    const storage = browserStorage();
    try {
      storage?.setItem(`souqi:scan-feedback:${userId}`, String(feedbackEnabled));
    } catch {
      // The choice is optional; feedback still works for this session.
    }
  }, [feedbackEnabled, userId]);

  const focusBarcodeField = useCallback(() => {
    if (isTouchDevice()) return;
    scanInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusBarcodeField();
    const onWindowFocus = () => focusBarcodeField();
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, [focusBarcodeField]);

  const playScanFeedback = useCallback(() => {
    if (!feedbackEnabled || typeof window === "undefined") return;
    try {
      navigator.vibrate?.(35);
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      void context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.11);
    } catch {
      // Camera scanning must continue if audio or vibration is blocked.
    }
  }, [feedbackEnabled]);

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanStatus(online ? "جارٍ البحث عن المنتج وإضافته..." : "غير متصل — يلزم الإنترنت للتعرّف على المنتج");
    while (queueRef.current.length > 0) {
      const nextBarcode = queueRef.current.shift();
      setQueueLength(queueRef.current.length);
      if (!nextBarcode) continue;
      if (!online) {
        setScanStatus("تعذر البحث دون اتصال؛ ستبقى الفاتورة الحالية محفوظة كمسودة");
        toast.error("الإنترنت غير متصل. لم تتم إضافة المنتج.", {
          description: `الباركود: ${nextBarcode}`,
        });
        continue;
      }
      try {
        const product = await lookup.mutateAsync({ barcode: nextBarcode });
        updateCart(current => addProductToCart(current, product));
        setSaveError(null);
        setScanStatus(`تمت إضافة ${product.name} — امسح المنتج التالي`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "المنتج غير موجود.";
        toast.error(message.includes("المنتج") ? message : "تعذر البحث عن المنتج.", {
          description: `الباركود: ${nextBarcode}`,
        });
        setScanStatus("لم يتم العثور على المنتج — تحقق من الاتصال أو أضفه إلى الكتالوج");
      } finally {
        setBarcode("");
        focusBarcodeField();
      }
    }
    processingRef.current = false;
    if (online) setScanStatus("جاهز للمسح التالي");
  }, [focusBarcodeField, lookup, online, updateCart]);

  const queueBarcode = useCallback((value: string, fromCamera = false) => {
    const normalized = value.trim();
    if (!normalized) return;
    if (checkoutPendingRef.current) {
      setScanStatus("انتظر تأكيد حفظ الفاتورة قبل المسح التالي");
      return;
    }
    if (fromCamera) playScanFeedback();
    queueRef.current.push(normalized);
    setQueueLength(queueRef.current.length);
    setBarcode("");
    void drainQueue();
  }, [drainQueue, playScanFeedback]);

  const handleBarcodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    queueBarcode(barcode);
  };

  const undoLastAction = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    cartRef.current = previous;
    setCart(previous);
    setUndoCount(undoStackRef.current.length);
    setRestoredDraft(false);
    setSaveError(null);
    setScanStatus("تم التراجع عن آخر إضافة أو تعديل");
  }, []);

  const clearCart = () => {
    if (!cartRef.current.length) return;
    updateCart(() => []);
    setRestoredDraft(false);
    setBarcode("");
    setScanStatus("تم تفريغ السلة — يمكنك التراجع عن ذلك");
  };

  const changeQuantity = (id: string, change: number) => {
    updateCart(current => current.flatMap(item => {
      if (item.id !== id) return [item];
      const qty = item.qty + change;
      return qty > 0 ? [{ ...item, qty }] : [];
    }));
  };

  const removeItem = (id: string) =>
    updateCart(current => current.filter(item => item.id !== id));

  const submitInvoice = useCallback(async () => {
    const lines = cartRef.current;
    if (!lines.length) {
      toast.error("أضف منتجًا واحدًا على الأقل إلى الفاتورة.");
      return false;
    }
    if (!canPay) {
      toast.error("لا تملك صلاحية إنشاء فاتورة.");
      return false;
    }
    if (!online) {
      setSaveError("لا يمكن تسجيل الفاتورة دون اتصال. احتفظنا بالسلة على هذا الجهاز؛ أعد المحاولة بعد عودة الشبكة.");
      toast.error("الفاتورة لم تُرسل لأن الإنترنت غير متصل.");
      return false;
    }
    if (checkoutPendingRef.current) return false;
    checkoutPendingRef.current = true;
    setCheckoutBusy(true);
    setSaveError(null);
    try {
      const result = await createInvoice.mutateAsync({
        items: lines.map(item => ({
          productId: item.id,
          quantity: item.qty,
          expectedUnitPrice: item.price,
        })),
        discount: 0,
        tax: 0,
        paymentMethod: "CASH",
      });
      announceInvoiceTotal(result.total);
      toast.success("تم حفظ الفاتورة بنجاح", {
        description: `${result.invoiceNumber} · ${money(result.total)}`,
      });
      resetCartAfterSuccess();
      setVoiceInvoiceMode(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ الفاتورة.";
      let recoveryMessage = `${message} احتفظنا بالسلة. إذا انقطع الاتصال أثناء الحفظ، افحص سجل الفواتير قبل إعادة المحاولة لتجنب تكرار الفاتورة.`;
      const priceChanged = message.includes("تغير سعر منتج في الكتالوج");
      if (priceChanged) {
        const refreshedProducts = await Promise.all(lines.map(async line => {
          try {
            return await lookup.mutateAsync({ barcode: line.barcode });
          } catch {
            return null;
          }
        }));
        const latestById = new Map(
          refreshedProducts
            .filter((product): product is NonNullable<typeof product> => product !== null)
            .map(product => [product.id, product])
        );
        if (latestById.size) {
          updateCart(current => current.map(line => {
            const product = latestById.get(line.id);
            return product ? {
              ...line,
              name: product.name,
              price: Number(product.sellingPrice),
              unit: product.unit || line.unit,
            } : line;
          }));
        }
        recoveryMessage = latestById.size === lines.length
          ? "تغير سعر منتج قبل الحفظ؛ لم تُنشأ الفاتورة. حدّثنا أسعار المنتجات المتاحة في السلة. راجع الإجمالي الجديد ثم اضغط حفظ مرة أخرى."
          : "تغير سعر منتج قبل الحفظ؛ لم تُنشأ الفاتورة. تعذر تحديث بعض الأسعار؛ أعد فحص المنتجات المتأثرة قبل المحاولة مرة أخرى.";
      }
      setSaveError(recoveryMessage);
      toast.error(priceChanged ? "تغير سعر منتج قبل الحفظ" : "لم يصل تأكيد حفظ الفاتورة", { description: recoveryMessage });
      return false;
    } finally {
      checkoutPendingRef.current = false;
      setCheckoutBusy(false);
      focusBarcodeField();
    }
  }, [canPay, createInvoice, focusBarcodeField, lookup, online, resetCartAfterSuccess, updateCart]);

  const announceInvoiceTotal = (invoiceTotal: number) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
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
    queueBarcode(value, true);
  }, [queueBarcode]);

  const handleVoiceCommand = useCallback(async (transcript: string) => {
    if (checkoutPendingRef.current) {
      speakArabic("انتظر حتى ينتهي حفظ الفاتورة أو تحديث الأسعار.");
      return;
    }
    if (isNewInvoiceVoiceCommand(transcript)) {
      if (cartRef.current.length) {
        speakArabic("هناك منتجات في الفاتورة الحالية. احفظها أو أفرغ السلة أولًا.");
        toast.info("أفرغ الفاتورة الحالية أو احفظها قبل بدء فاتورة جديدة.");
        return;
      }
      setVoiceInvoiceMode(true);
      setPendingVoiceName(null);
      speakArabic("تم فتح فاتورة جديدة. قل اسم المنتج، ويمكنك ذكر السعر والكمية.");
      return;
    }
    if (isSaveVoiceCommand(transcript) && voiceInvoiceMode) {
      const saved = await submitInvoice();
      if (saved) setVoiceInvoiceMode(false);
      return;
    }
    const phrase = parseVoiceProductPhrase(transcript);
    const spokenName = pendingVoiceName ?? phrase.name;
    if (
      !spokenName ||
      spokenName.length < 2 ||
      /^(خمسة|عشرة|واحد|اثنين|ثلاثة|أربعة|اربعة|ستة|سبعة|ثمانية|تسعة)$/i.test(spokenName)
    ) {
      speakArabic("قل اسم المنتج، مثل مياه معدنية بخمسة جنيه.");
      return;
    }
    setPendingVoiceName(null);
    try {
      const matches = await voiceLookup.mutateAsync({ name: spokenName });
      if (matches.length === 0) {
        speakArabic(`لم أجد منتج ${spokenName}. أضفه أولًا من شاشة المنتجات بالباركود.`);
        return;
      }
      if (matches.length > 1) {
        speakArabic("وجدت أكثر من منتج بهذا الاسم. استخدم الباركود أو قل الاسم بشكل أدق.");
        return;
      }
      const product = matches[0];
      updateCart(current => {
        let next = current;
        for (let index = 0; index < phrase.quantity; index += 1) next = addProductToCart(next, product);
        return next;
      });
      setVoiceInvoiceMode(true);
      speakArabic(`تمت إضافة ${product.name}، الكمية ${phrase.quantity}. قل منتجًا آخر أو قل احفظ.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر البحث عن المنتج بالصوت.");
    }
  }, [pendingVoiceName, submitInvoice, updateCart, voiceInvoiceMode, voiceLookup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !editingText) {
        event.preventDefault();
        undoLastAction();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void submitInvoice();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitInvoice, undoLastAction]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#0e4d45] px-4 py-3 text-white sm:px-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold"><ShoppingCart size={17} /> نقطة بيع سريعة</div>
          <p className="mt-1 text-[10px] text-[#c0ddd6]">امسح كل منتج بالتتابع؛ الفاتورة والكمية تظهران أسفل الكاميرا.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold ${online ? "bg-[#d8f4e9] text-[#146247]" : "bg-[#ffe7df] text-[#a83d42]"}`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? "متصل" : "غير متصل"}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackEnabled(value => !value)}
            aria-pressed={feedbackEnabled}
            aria-label={feedbackEnabled ? "إيقاف صوت واهتزاز نجاح المسح" : "تشغيل صوت واهتزاز نجاح المسح"}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-bold ${feedbackEnabled ? "border-[#b8efdc]/40 bg-white/10 text-[#d8f7eb]" : "border-white/15 text-[#9eb6b6]"}`}
          >
            {feedbackEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span className="hidden sm:inline">{feedbackEnabled ? "صوت/اهتزاز" : "الصوت مكتوم"}</span>
          </button>
        </div>
      </div>

      {!online && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-[#f0d8d8] bg-[#fff2ef] px-4 py-3 text-xs leading-5 text-[#8d3d40]">
          <WifiOff size={17} className="mt-0.5 shrink-0" />
          <div><strong>العمل دون اتصال.</strong> مسودة السلة محفوظة محليًا، لكن البحث عن المنتجات وحفظ الفاتورة يتطلبان الإنترنت. لا تُرسل الفاتورة تلقائيًا عند عودة الشبكة.</div>
        </div>
      )}
      {restoredDraft && cart.length > 0 && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-[#ecdcae] bg-[#fff9e9] px-4 py-3 text-xs leading-5 text-[#806217]">
          <span><strong>استعدنا مسودة من هذا الجهاز.</strong> راجع أسماء المنتجات وأسعارها قبل الحفظ؛ قد تكون تغيرت منذ آخر مزامنة.</span>
          <button type="button" onClick={() => setRestoredDraft(false)} className="shrink-0 font-bold underline">إخفاء</button>
        </div>
      )}
      {draftSaveFailed && (
        <div role="alert" className="rounded-xl border border-[#f0d8d8] bg-[#fff2ef] px-4 py-3 text-xs text-[#8d3d40]">تعذر حفظ المسودة في مساحة المتصفح. لا تغلق الصفحة قبل حفظ الفاتورة عند عودة الاتصال.</div>
      )}

      <BarcodeCameraScanner
        open
        onClose={() => undefined}
        onDetected={handleCameraDetected}
        scanMode="continuous"
        presentation="inline"
      />

      <section className="rounded-2xl border border-[#d9e6e0] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="pos-barcode" className="text-xs font-extrabold text-[#29464e]">الإدخال اليدوي أو قارئ الباركود الخارجي</label>
          <div className="flex items-center gap-2 text-[10px] font-bold text-[#78908d]">
            <Activity size={13} className="text-[#3aa580]" /> {scanStatus}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl border-2 border-[#54b393] bg-white px-3 py-2.5 focus-within:shadow-[0_0_0_4px_rgba(84,179,147,0.1)] sm:px-4">
          <Search size={19} className="shrink-0 text-[#2e9a77]" />
          <input
            id="pos-barcode"
            ref={scanInputRef}
            inputMode="text"
            value={barcode}
            onChange={event => setBarcode(event.target.value)}
            onKeyDown={handleBarcodeKeyDown}
            placeholder="اكتب الباركود أو امسحه ثم اضغط Enter"
            className="mono min-w-0 flex-1 bg-transparent py-1 text-sm font-semibold text-[#19383e] outline-none placeholder:font-sans placeholder:text-xs placeholder:text-[#a5b5b2]"
            aria-describedby="pos-barcode-help"
          />
          <button
            type="button"
            onClick={() => queueBarcode(barcode)}
            disabled={!barcode.trim() || lookup.isPending}
            className="min-h-10 shrink-0 rounded-lg bg-[#0f5d4d] px-3 text-xs font-extrabold text-white disabled:opacity-40"
          >
            إضافة
          </button>
        </div>
        <div id="pos-barcode-help" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8a9c9c]">
          <span><kbd className="rounded border border-[#dce8e3] bg-[#f3f8f6] px-1.5 py-0.5 font-bold">Enter</kbd> إضافة الرمز · <kbd className="rounded border border-[#dce8e3] bg-[#f3f8f6] px-1.5 py-0.5 font-bold">Ctrl+Enter</kbd> حفظ الفاتورة · <kbd className="rounded border border-[#dce8e3] bg-[#f3f8f6] px-1.5 py-0.5 font-bold">Ctrl+Z</kbd> تراجع</span>
          <span>{queueLength ? `${integer(queueLength)} في قائمة المعالجة` : `جلسة الكاشير #${userId}`}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d9e6e0] bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edeb] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f5ef] text-[#0f6e58]"><Receipt size={19} /></div>
            <div>
              <h2 className="font-extrabold text-[#183741]">الفاتورة الحالية</h2>
              <p className="mt-0.5 text-[10px] text-[#839596]">إجمالي الوحدات {integer(cart.reduce((sum, item) => sum + item.qty, 0))} · دون إدارة مخزون أو ميزان</p>
            </div>
            <span className="rounded-full bg-[#e6f5ef] px-2.5 py-1 text-[10px] font-extrabold text-[#267a60]">{integer(cart.length)} أصناف</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undoLastAction} disabled={!undoCount || checkoutBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#dfe9e5] px-3 text-xs font-bold text-[#526c70] disabled:opacity-35" aria-label="التراجع عن آخر إضافة أو تعديل">
              <Undo2 size={15} /> تراجع
            </button>
            <button type="button" onClick={clearCart} disabled={!cart.length || checkoutBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#f0d8d8] px-3 text-xs font-bold text-[#ad5a59] disabled:opacity-35">
              <Trash2 size={14} /> تفريغ الفاتورة
            </button>
          </div>
        </header>

        {cart.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf5f2] text-[#7ba49b]"><ShoppingCart size={22} /></div>
            <div className="text-sm font-extrabold text-[#547077]">الفاتورة فارغة</div>
            <div className="mt-1 text-xs text-[#99a9a9]">ابدأ بالمسح؛ سيظهر كل منتج هنا تحت الكاميرا مباشرة.</div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf2f0]">
            {cart.map((item, index) => (
              <article key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:px-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eff7f4] text-[#267a60]"><Tag size={16} /></div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-[#29464f]">{item.name}</div>
                  <div className="mono mt-0.5 text-[10px] text-[#91a2a3]">{item.barcode} · {money(item.price)} / {item.unit}</div>
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-[#f1f6f4] p-1" aria-label={`الكمية ${integer(item.qty)} ${item.unit}`}>
                  <button type="button" onClick={() => changeQuantity(item.id, 1)} disabled={checkoutBusy} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#267a60] shadow-sm disabled:opacity-40" aria-label={`زيادة كمية ${item.name}`}><Plus size={16} /></button>
                  <span className="min-w-8 text-center text-xs font-extrabold text-[#3e5b60]">{integer(item.qty)}</span>
                  <button type="button" onClick={() => changeQuantity(item.id, -1)} disabled={checkoutBusy} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#526c70] shadow-sm disabled:opacity-40" aria-label={`تقليل كمية ${item.name}`}><Minus size={16} /></button>
                </div>
                <div className="col-start-2 text-xs font-extrabold text-[#24444c] sm:col-start-auto sm:w-28 sm:text-left">{money(item.price * item.qty)}</div>
                <button type="button" onClick={() => removeItem(item.id)} disabled={checkoutBusy} aria-label={`حذف ${item.name}`} className="col-start-3 row-start-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#aebcba] hover:bg-[#fff2ef] hover:text-[#bd4e51] disabled:opacity-40 sm:col-start-auto sm:row-auto"><Trash2 size={16} /></button>
                <span className="sr-only">الصنف رقم {index + 1}</span>
              </article>
            ))}
          </div>
        )}

        <footer className="grid gap-4 border-t border-[#e5edeb] bg-[#f8fbfa] p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-[#718688]"><CreditCard size={14} className="text-[#a37400]" /> الدفع نقدًا · الخصم والضريبة 0.00 ج.م</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xs font-bold text-[#7a8e8d]">الإجمالي المستحق</span>
              <strong className="text-2xl font-extrabold tracking-tight text-[#0e4d45]">{Number(total).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}<span className="mr-1 text-xs">ج.م</span></strong>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {saveError && <div role="alert" className="max-w-md rounded-lg border border-[#f0d8d8] bg-[#fff2ef] px-3 py-2 text-[10px] leading-5 text-[#8d3d40]">{saveError}</div>}
            <button
              type="button"
              onClick={() => void submitInvoice()}
              disabled={checkoutBusy || !cart.length || !online}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f5d4d] px-5 text-sm font-extrabold text-white shadow-[0_10px_25px_rgba(15,93,77,0.17)] transition hover:bg-[#0b493c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {checkoutBusy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> جارٍ حفظ الفاتورة...</> : <><Check size={17} /> حفظ الفاتورة <ChevronLeft size={17} /></>}
            </button>
            {!online && <span className="text-center text-[10px] text-[#a83d42]">سيُتاح الحفظ بعد عودة الإنترنت</span>}
          </div>
        </footer>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff3cf] text-[#a37400]"><Zap size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">مسح متواصل</div><div className="text-[10px] text-[#8b9a9a]">{queueLength ? "تتم معالجة الرموز بالتتابع" : "الكاميرا جاهزة للمنتج التالي"}</div></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e6f6f0] text-[#287e64]"><ShieldCheck size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">حفظ آمن</div><div className="text-[10px] text-[#8b9a9a]">الفاتورة تُحفظ بعد تأكيد الخادم فقط</div></div></div>
        <div className="flex items-center gap-3 rounded-xl border border-[#dce9e4] bg-white px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8eef7] text-[#3d6793]"><Receipt size={15} /></div><div><div className="text-xs font-extrabold text-[#38535a]">مسودة محلية</div><div className="text-[10px] text-[#8b9a9a]">{draftSaveFailed ? "تعذر حفظها في المتصفح" : cart.length ? "تُحفظ على هذا الجهاز لكل مستخدم" : "تُحفظ عند إضافة المنتجات"}</div></div></div>
      </div>

      <VoiceCommandButton
        onTranscript={handleVoiceCommand}
        prompt={voiceInvoiceMode ? "قل اسم المنتج أو قل احفظ" : "قل اعمل فاتورة جديدة"}
        className="fixed bottom-20 left-4 z-[45] min-h-12 px-4 shadow-xl lg:bottom-5"
      />
    </div>
  );
}

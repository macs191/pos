import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SpeechRecognitionEventLike = Event & {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type VoiceCommandButtonProps = {
  onTranscript: (transcript: string) => void;
  prompt?: string;
  className?: string;
  speakPrompt?: boolean;
  buttonLabel?: string;
};

export function speakArabic(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-EG";
    utterance.rate = 0.9;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech output is an enhancement; the typed UI remains fully usable.
  }
}

function recognitionErrorMessage(code?: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات الموقع ثم جرّب مجددًا.";
    case "audio-capture":
      return "لم نعثر على ميكروفون متاح. تحقق من توصيله ثم استخدم الإدخال اليدوي.";
    case "no-speech":
      return "لم نسمع كلامًا واضحًا. اضغط على الميكروفون وجرّب مرة أخرى.";
    case "network":
      return "تعذر تشغيل خدمة التعرف الصوتي عبر الشبكة. يمكنك الكتابة أو مسح الباركود.";
    case "language-not-supported":
      return "التعرف الصوتي العربي غير متاح في هذا المتصفح؛ استخدم الإدخال اليدوي.";
    case "aborted":
      return "تم إيقاف الاستماع.";
    default:
      return "تعذر استخدام الميكروفون. تحقق من الإذن أو أكمل الإدخال يدويًا.";
  }
}

export function VoiceCommandButton({
  onTranscript,
  prompt = "تحدث الآن",
  className = "",
  speakPrompt = true,
  buttonLabel = "تحكم صوتي",
}: VoiceCommandButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggle = () => {
    const Recognition = typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;
    if (!Recognition) {
      setMessage("هذا المتصفح لا يدعم التعرف الصوتي. استخدم Chrome على Android أو أدخل البيانات يدويًا.");
      speakArabic("المتصفح لا يدعم الأوامر الصوتية. استخدم الإدخال اليدوي.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    setMessage(null);
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      setListening(false);
      if (transcript) onTranscript(transcript);
      else setMessage("لم يتم التعرّف على الكلام؛ حاول مرة أخرى أو اكتب يدويًا.");
    };
    recognition.onerror = event => {
      setListening(false);
      if (event.error !== "aborted") speakArabic(recognitionErrorMessage(event.error));
      setMessage(recognitionErrorMessage(event.error));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      if (speakPrompt) speakArabic(prompt);
    } catch {
      setListening(false);
      setMessage("لم يبدأ الميكروفون. تحقق من إذن المتصفح ثم استخدم الإدخال اليدوي.");
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "إيقاف الاستماع" : "التحدث بالصوت"}
        aria-pressed={listening}
        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors ${listening ? "bg-[#b4484b] text-white" : "bg-[#e7f5f0] text-[#267a60]"} ${className}`}
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          {listening ? <MicOff size={15} /> : <Mic size={15} />}
          {listening && <span className="absolute -inset-1 animate-ping rounded-full bg-[#ffb3aa]/30" />}
        </span>
        {listening ? "جارٍ الاستماع..." : buttonLabel}
      </button>
      {message && <span role="status" className="max-w-full text-[10px] leading-5 text-[#a83d42]">{message}</span>}
    </div>
  );
}

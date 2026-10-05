import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SpeechRecognitionEventLike = Event & { results: { [index: number]: { [index: number]: { transcript: string } } } };
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
  continuous?: boolean;
};

export function speakArabic(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-EG";
  utterance.rate = 0.9;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

export function VoiceCommandButton({ onTranscript, prompt = "تحدث الآن", className = "", continuous = false }: VoiceCommandButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const toggle = () => {
    const Recognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined;
    if (!Recognition) {
      setUnsupported(true);
      speakArabic("المتصفح لا يدعم الأوامر الصوتية. استخدم Chrome على أندرويد.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ar-EG";
    recognition.interimResults = false;
    recognition.continuous = continuous;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = event => {
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") speakArabic("اسمح باستخدام الميكروفون من إعدادات المتصفح.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      speakArabic(prompt);
    } catch {
      setListening(false);
    }
  };

  return <div className="flex items-center gap-2"><button type="button" onClick={toggle} aria-label={listening ? "إيقاف الاستماع" : "التحدث بالصوت"} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors ${listening ? "bg-[#b4484b] text-white" : "bg-[#e7f5f0] text-[#267a60]"} ${className}`}><span className="relative flex h-4 w-4 items-center justify-center">{listening ? <MicOff size={15} /> : <Mic size={15} />}{listening && <span className="absolute -inset-1 animate-ping rounded-full bg-[#ffb3aa]/30" />}</span>{listening ? "إيقاف الاستماع" : "تحكم صوتي"}</button>{unsupported && <span className="text-[10px] text-[#a83d42]">يحتاج Chrome Android</span>}</div>;
}

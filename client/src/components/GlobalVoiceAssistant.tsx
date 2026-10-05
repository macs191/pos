import { Mic } from "lucide-react";
import { useCallback, useState } from "react";
import { VoiceCommandButton, speakArabic } from "./VoiceCommandButton";

type Props = { navigate: (path: string) => void };

function normalize(text: string) { return text.trim().replace(/[إأآ]/g, "ا"); }

export function GlobalVoiceAssistant({ navigate }: Props) {
  const [lastCommand, setLastCommand] = useState("");
  const onTranscript = useCallback((raw: string) => {
    const text = normalize(raw);
    setLastCommand(raw);
    const routes: Array<[RegExp, string, string]> = [
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:نقطه البيع|نقطة البيع|البيع|الفاتوره|الفاتورة)/i, "/pos", "تم فتح نقطة البيع"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:منتج|المنتجات|الاصناف)/i, "/products", "تم فتح المنتجات"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:مخزون|المخزون)/i, "/inventory", "تم فتح المخزون"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:فواتير|الفواتير)/i, "/invoices", "تم فتح الفواتير"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:تقارير|التقارير)/i, "/reports", "تم فتح التقارير"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:اعدادات|إعدادات|الاعدادات)/i, "/settings", "تم فتح الإعدادات"],
      [/(?:افتح|اذهب الى|روح الى|اعرض).*(?:مستخدمين|المستخدمين|فريق العمل)/i, "/users", "تم فتح المستخدمين"],
    ];
    const route = routes.find(([pattern]) => pattern.test(text));
    if (route) { navigate(route[1]); speakArabic(route[2]); return; }
    if (/(?:احسب|احفظ الفاتورة|سجل الفاتورة|تمام الفاتورة)/i.test(text)) {
      window.dispatchEvent(new CustomEvent("pos:voice-command", { detail: raw }));
      return;
    }
    if (/(?:اعمل|انشئ|انشأ|ابدأ|افتح)\s*(?:فاتورة|الفاتورة)/i.test(text) || /(?:ضيف|اضف|أضف|عايز|اريد)/i.test(text)) {
      navigate("/pos");
      window.dispatchEvent(new CustomEvent("pos:voice-command", { detail: raw }));
      return;
    }
    speakArabic("لم أفهم الأمر. قل افتح المنتجات، افتح الفواتير، أو اعمل فاتورة جديدة.");
  }, [navigate]);
  return <div className="flex items-center gap-2"><div className="hidden rounded-lg bg-[#e7f5f0] px-2 py-1 text-[10px] font-bold text-[#267a60] sm:block" title={lastCommand}>{lastCommand ? `آخر أمر: ${lastCommand.slice(0, 24)}` : "المساعد الصوتي"}</div><VoiceCommandButton onTranscript={onTranscript} prompt="قل الأمر، مثل افتح المنتجات أو اعمل فاتورة" className="bg-[#b8efdc] text-[#08231e]" /></div>;
}

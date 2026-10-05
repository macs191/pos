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
    if (/(?:احسب|احفظ الفاتورة|سجل الفاتورة|تمام الفاتورة)/i.test(text)) { window.dispatchEvent(new CustomEvent("pos:voice-command", { detail: raw })); return; }
    if (/(?:اعمل|انشئ|انشأ|ابدأ|افتح)\s*(?:فاتورة|الفاتورة)/i.test(text) || /(?:ضيف|اضف|أضف|عايز|اريد)/i.test(text)) { navigate("/pos"); window.dispatchEvent(new CustomEvent("pos:voice-command", { detail: raw })); return; }
    speakArabic("لم أفهم الأمر. قل افتح المنتجات، افتح الفواتير، أو اعمل فاتورة جديدة.");
  }, [navigate]);
  return <div className="fixed bottom-24 left-5 z-40 flex flex-col items-center gap-2 sm:bottom-6 sm:left-6"><div className="hidden rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#267a60] shadow-lg sm:block" title={lastCommand}>{lastCommand ? `آخر أمر: ${lastCommand.slice(0, 24)}` : "المساعد الصوتي"}</div><div className="rounded-full bg-[#071723] p-1.5 shadow-[0_12px_30px_rgba(7,23,35,0.3)]"><VoiceCommandButton onTranscript={onTranscript} prompt="قل الأمر، مثل افتح المنتجات أو اعمل فاتورة" continuous className="h-14 w-14 justify-center rounded-full bg-[#b8efdc] p-0 text-[#08231e]" /></div></div>;
}

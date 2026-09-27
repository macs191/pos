export function buildInvoiceAnnouncement(total: number): string {
  return `تم حفظ الفاتورة. إجمالي الفاتورة ${Number(total).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} جنيه`;
}

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit))).replace(/،/g, ",");
}

function spokenNumber(value: string): number | undefined {
  const words: Record<string, number> = { صفر: 0, واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, ثلاثة: 3, ثلاث: 3, أربعة: 4, اربع: 4, خمسة: 5, ستة: 6, سبعة: 7, ثمانية: 8, تسعة: 9, عشرة: 10, عشر: 10, عشرون: 20, ثلاثون: 30, أربعون: 40, خمسون: 50, مئة: 100, مائة: 100 };
  const clean = value.trim().replace(/[.،,؛;]+$/g, "");
  return words[clean];
}

export type VoiceProductPhrase = { name: string; price?: number; quantity: number };

export function parseVoiceProductPhrase(transcript: string): VoiceProductPhrase {
  const normalized = normalizeDigits(transcript.trim());
  const priceMatch = normalized.match(/(?:بـ|ب|سعر(?:ه|ها)?|بقيمة)\s*(\d+(?:[.,]\d+)?|[\u0600-\u06FF]+)/i);
  const quantityMatch = normalized.match(/(?:عدد|كمية|qty)\s*(\d+(?:[.,]\d+)?|[\u0600-\u06FF]+)/i);
  let name = normalized
    .replace(/^(أريد|عايز|اريد|ضيف|أضف|اضف)\s+/i, "")
    .replace(/(?:بـ|ب|سعر(?:ه|ها)?|بقيمة)\s*(?:\d+(?:[.,]\d+)?|[\u0600-\u06FF]+)/i, "")
    .replace(/(?:عدد|كمية|qty)\s*(?:\d+(?:[.,]\d+)?|[\u0600-\u06FF]+)/i, "")
    .replace(/[.،,؛;]+$/g, "")
    .trim();
  return {
    name,
    price: priceMatch ? (Number.isNaN(Number(priceMatch[1].replace(",", "."))) ? spokenNumber(priceMatch[1]) : Number(priceMatch[1].replace(",", "."))) : undefined,
    quantity: quantityMatch ? Math.max(1, Number.isNaN(Number(quantityMatch[1].replace(",", "."))) ? (spokenNumber(quantityMatch[1]) ?? 1) : Number(quantityMatch[1].replace(",", "."))) : 1,
  };
}

export function isNewInvoiceVoiceCommand(transcript: string) {
  return /(?:اعمل|أنشئ|انشئ|ابدأ|افتح)\s*(?:فاتورة|الفاتورة)/i.test(transcript);
}

export function isSaveVoiceCommand(transcript: string) {
  return /^(?:احفظ|حفظ|سجل|سجّل|تمام|أكد|تأكيد)/i.test(transcript.trim());
}

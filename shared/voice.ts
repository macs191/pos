export function buildInvoiceAnnouncement(total: number): string {
  return `تم حفظ الفاتورة. إجمالي الفاتورة ${Number(total).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} جنيه`;
}

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const numberWords: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  واحدة: 1,
  واحده: 1,
  أحد: 1,
  احد: 1,
  اثنان: 2,
  اثنين: 2,
  اتنين: 2,
  اثنتان: 2,
  اثنتين: 2,
  اثنتا: 2,
  ثلاثة: 3,
  ثلاث: 3,
  تلاتة: 3,
  تلاته: 3,
  أربعة: 4,
  أربع: 4,
  اربعة: 4,
  اربع: 4,
  خمسة: 5,
  خمس: 5,
  ستة: 6,
  ست: 6,
  سبعة: 7,
  سبع: 7,
  ثمانية: 8,
  تمانية: 8,
  ثمان: 8,
  تسعة: 9,
  تسع: 9,
  عشرة: 10,
  عشر: 10,
  أحدعشر: 11,
  اثناعشر: 12,
  اثنيعشر: 12,
  ثلاثةعشر: 13,
  أربعةعشر: 14,
  خمسةعشر: 15,
  ستةعشر: 16,
  سبعةعشر: 17,
  ثمانيةعشر: 18,
  تسعةعشر: 19,
  عشرون: 20,
  عشرين: 20,
  ثلاثون: 30,
  ثلاثين: 30,
  تلاتين: 30,
  أربعون: 40,
  أربعين: 40,
  اربعين: 40,
  خمسون: 50,
  خمسين: 50,
  ستين: 60,
  ستون: 60,
  سبعين: 70,
  سبعون: 70,
  ثمانين: 80,
  ثمانون: 80,
  تسعين: 90,
  تسعون: 90,
  مئة: 100,
  مائة: 100,
  مية: 100,
  مئه: 100,
  ميتين: 200,
  مائتين: 200,
  ثلاثمئة: 300,
  اربعمئة: 400,
  خمسمئة: 500,
  ألف: 1000,
  الف: 1000,
};

const currencyWords = new Set([
  "جنيه",
  "جنيهات",
  "جنيها",
  "جنيهًا",
  "جنية",
  "مصري",
  "مصرية",
  "قرش",
  "قروش",
  "فقط",
]);
const numberWordsPattern = Object.keys(numberWords)
  .sort((a, b) => b.length - a.length)
  .join("|");

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/[٬،]/g, ",")
    .replace(/[\u064B-\u065F\u0670]/g, "");
}

function parseNumericLiteral(value: string): number | undefined {
  const clean = normalizeDigits(value).trim();
  const normalized = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(clean)
    ? clean.replace(/,/g, "")
    : clean.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function spokenNumber(value: string): number | undefined {
  const clean = normalizeDigits(value)
    .trim()
    .replace(/[.،,؛;]+$/g, "")
    .replace(/(\S)و(?=\S)/g, "$1 ");
  const tokens = clean.split(/\s+/).filter(token => token && token !== "و");
  if (!tokens.length) return undefined;

  let total = 0;
  let foundNumber = false;
  for (const token of tokens) {
    const word = token.replace(/^[،,.]+|[،,.]+$/g, "");
    if (currencyWords.has(word)) {
      if (foundNumber) break;
      continue;
    }
    const normalizedWord =
      numberWords[word] !== undefined
        ? word
        : word.startsWith("و") && numberWords[word.slice(1)] !== undefined
          ? word.slice(1)
          : word;
    const number = numberWords[normalizedWord];
    if (number === undefined) break;
    total += number;
    foundNumber = true;
  }
  return foundNumber ? total : undefined;
}

function parseNumberAtStart(value: string): number | undefined {
  const clean = normalizeDigits(value)
    .trimStart()
    .replace(/(\S)و(?=\S)/g, "$1 ");
  const digits = clean.match(/^\d+(?:[.,]\d+)?/);
  if (digits) return parseNumericLiteral(digits[0]);

  const words = clean.match(
    new RegExp(
      `^(?:(?:${numberWordsPattern}|و(?:${numberWordsPattern})|جنيه(?:ات)?|جنيها|جنية|قرش|قروش|فقط)(?:\\s+|$)){1,7}`,
      ""
    )
  );
  return words ? spokenNumber(words[0]) : undefined;
}

export type VoiceProductPhrase = {
  name: string;
  price?: number;
  quantity: number;
};

export function parseVoiceProductPhrase(
  transcript: string
): VoiceProductPhrase {
  const normalized = normalizeDigits(transcript.trim());
  const priceClause = new RegExp(
    `(?:^|\\s)(?:بسعر|سعر(?:ها|ه)?|بقيمة|بـ|ب(?=\\s*(?:\\d|${numberWordsPattern})))\\s*`,
    ""
  ).exec(normalized);
  const quantityClause = /(?:^|\s)(?:عدد|كمية|qty)\s*/i.exec(normalized);

  const priceTail = priceClause
    ? normalized.slice(priceClause.index + priceClause[0].length)
    : "";
  const priceText = quantityClause
    ? priceTail.split(/(?:^|\s)(?:عدد|كمية|qty)\s*/i)[0]
    : priceTail;
  const price = priceClause ? parseNumberAtStart(priceText) : undefined;
  const quantity = quantityClause
    ? parseNumberAtStart(
        normalized.slice(quantityClause.index + quantityClause[0].length)
      )
    : undefined;
  const firstClauseIndex = Math.min(
    priceClause?.index ?? Number.POSITIVE_INFINITY,
    quantityClause?.index ?? Number.POSITIVE_INFINITY
  );
  const nameText = Number.isFinite(firstClauseIndex)
    ? normalized.slice(0, firstClauseIndex)
    : normalized;
  const name = nameText
    .replace(
      /^(?:(?:أريد|عايز|اريد|أضف|اضف|ضيف|حط|سجل|سجّل|إضافة|اضافة)\s+)+/,
      ""
    )
    .replace(/^[،,.\s]+|[،,.\s]+$/g, "")
    .trim();

  return {
    name,
    price,
    quantity: Math.max(1, quantity ?? 1),
  };
}

export function isNewInvoiceVoiceCommand(transcript: string) {
  return /(?:اعمل|أنشئ|انشئ|ابدأ|افتح)\s*(?:فاتورة|الفاتورة)/i.test(transcript);
}

export function isSaveVoiceCommand(transcript: string) {
  return /^(?:احفظ|حفظ|سجل|سجّل|تمام|أكد|تأكيد)/i.test(transcript.trim());
}

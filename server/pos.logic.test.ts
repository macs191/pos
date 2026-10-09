import { describe, expect, it } from "vitest";
import { addProductToCart, cartSubtotal, invoiceTotal, pricesMatchAtSale } from "../shared/pos.js";
import {
  buildInvoiceAnnouncement,
  isNewInvoiceVoiceCommand,
  isSaveVoiceCommand,
  parseVoiceProductPhrase,
} from "../shared/voice.js";

describe("POS cart logic", () => {
  const product = {
    id: 7,
    name: "مياه معدنية",
    barcode: "6221234567890",
    sellingPrice: "5.50",
    stockQuantity: "12",
    unit: "قطعة",
  };

  it("aggregates repeated barcode scans into one cart line", () => {
    const once = addProductToCart([], product);
    const twice = addProductToCart(once, product);

    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ id: 7, qty: 2, price: 5.5 });
    expect(cartSubtotal(twice)).toBe(11);
  });

  it("keeps invoice totals non-negative after discounts", () => {
    expect(invoiceTotal(100, 20, 5)).toBe(85);
    expect(invoiceTotal(100, 120, 0)).toBe(0);
  });

  it("compares checkout prices at currency-cent precision", () => {
    expect(pricesMatchAtSale(12.5, 12.5)).toBe(true);
    expect(pricesMatchAtSale(12.501, 12.504)).toBe(true);
    expect(pricesMatchAtSale(12.5, 12.51)).toBe(false);
    expect(pricesMatchAtSale(Number.NaN, 12.5)).toBe(false);
  });

  it("builds a spoken Arabic invoice total announcement", () => {
    expect(buildInvoiceAnnouncement(100)).toContain("إجمالي الفاتورة");
    expect(buildInvoiceAnnouncement(100)).toContain("١٠٠٫٠٠");
    expect(buildInvoiceAnnouncement(100)).toContain("جنيه");
  });

  it("parses Arabic product name, spoken price, and quantity", () => {
    expect(
      parseVoiceProductPhrase("أريد مياه معدنية بخمسة عدد ثلاثة")
    ).toMatchObject({ name: "مياه معدنية", price: 5, quantity: 3 });
    expect(isNewInvoiceVoiceCommand("اعمل فاتورة جديدة")).toBe(true);
    expect(isSaveVoiceCommand("احفظ")).toBe(true);
  });

  it("parses voice product details with compound Arabic numbers", () => {
    expect(
      parseVoiceProductPhrase("أضف مياه معدنية بسعر خمسة وعشرين جنيه")
    ).toMatchObject({ name: "مياه معدنية", price: 25, quantity: 1 });
  });

  it("accepts Arabic numerals and keeps ordinary ba-prefixed product names", () => {
    expect(
      parseVoiceProductPhrase("لبن بالنعناع سعره ١٢٫٥٠ جنيه")
    ).toMatchObject({ name: "لبن بالنعناع", price: 12.5 });
    expect(parseVoiceProductPhrase("مياه بالنعناع").name).toBe("مياه بالنعناع");
  });
});

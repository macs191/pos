import { describe, expect, it } from "vitest";
import {
  applyApprovedPriceChange,
  buildGlobalProductRecord,
  createPriceChangeRequest,
  productKeyForBarcode,
  projectStorePriceChangeRequests,
} from "./catalog.logic.js";

const product = buildGlobalProductRecord({
  id: productKeyForBarcode("6221234567890"),
  barcode: "6221234567890",
  name: "مياه معدنية",
  sellingPrice: 5.5,
  createdByUserId: 1,
  createdByStoreId: 7,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("global product catalog logic", () => {
  it("uses one stable key for the same barcode regardless of store", () => {
    expect(productKeyForBarcode(" 6221234567890 ")).toBe(product.id);
    expect(productKeyForBarcode("6221234567890")).toBe(product.id);
  });

  it("creates a shared unit product with only catalog fields and no stock/scale fields", () => {
    expect(product).toMatchObject({
      barcode: "6221234567890",
      name: "مياه معدنية",
      sellingPrice: 5.5,
      unit: "قطعة",
    });
    expect(product).not.toHaveProperty("supermarketId");
    expect(product).not.toHaveProperty("stockQuantity");
    expect(product).not.toHaveProperty("minimumStock");
    expect(product).not.toHaveProperty("scale");
  });

  it("records a price change as pending and does not change the global product before approval", () => {
    const request = createPriceChangeRequest({
      id: "pcr_test",
      product,
      requestedPrice: 6,
      requestedByUserId: 2,
      requestedByName: "كاشير",
      requestedByStoreId: 9,
      requestedByStoreName: "متجر آخر",
      createdAt: "2026-10-02T00:00:00.000Z",
    });
    expect(request).toMatchObject({
      status: "PENDING",
      currentPrice: 5.5,
      requestedPrice: 6,
      barcode: product.barcode,
    });
    expect(product.sellingPrice).toBe(5.5);
  });

  it("only returns safe request fields for the matching store", () => {
    const rows = [
      {
        id: "pcr_9",
        requestedByStoreId: "9",
        requestedByName: "اسم لا يجب كشفه خارج الطلب الأصلي",
        requestedByEmail: "private@example.test",
        barcode: "6221",
        productName: "منتج",
        currentPrice: 5,
        requestedPrice: 6,
        status: "PENDING",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      { id: "pcr_8", requestedByStoreId: 8, barcode: "other", status: "PENDING" },
      null,
    ];
    const result = projectStorePriceChangeRequests(rows, 9);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pcr_9",
      barcode: "6221",
      currentPrice: 5,
      requestedPrice: 6,
      status: "PENDING",
    });
    expect(result[0]).not.toHaveProperty("requestedByName");
    expect(result[0]).not.toHaveProperty("requestedByEmail");
    expect(projectStorePriceChangeRequests(rows, 8).map(request => request.id)).toEqual(["pcr_8"]);
  });

  it("only applies a pending price change when the saved old price still matches", () => {
    const updated = applyApprovedPriceChange(
      product,
      { status: "PENDING", currentPrice: 5.5, requestedPrice: 6 },
      "2026-10-03T00:00:00.000Z"
    );
    expect(updated.sellingPrice).toBe(6);
    expect(() =>
      applyApprovedPriceChange(
        { ...product, sellingPrice: 7 },
        { status: "PENDING", currentPrice: 5.5, requestedPrice: 6 },
        "now"
      )
    ).toThrow("PRICE_CONFLICT");
    expect(() =>
      applyApprovedPriceChange(
        product,
        { status: "APPROVED", currentPrice: 5.5, requestedPrice: 6 },
        "now"
      )
    ).toThrow("REQUEST_ALREADY_RESOLVED");
  });
});

export type CatalogProductInput = {
  id: string;
  barcode: string;
  name: string;
  sellingPrice: number;
  createdByUserId?: number | null;
  createdByStoreId?: number | null;
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
};

export type CatalogProduct = {
  id: string;
  barcode: string;
  name: string;
  sellingPrice: number;
  unit: "قطعة";
  isActive: boolean;
  createdByUserId: number | null;
  createdByStoreId: number | null;
  createdAt: string;
  updatedAt: string;
};

export function normalizeBarcode(value: unknown): string {
  return String(value ?? "").trim();
}

export function productKeyForBarcode(value: unknown): string {
  const barcode = normalizeBarcode(value);
  if (!barcode) throw new Error("INVALID_BARCODE");
  return Buffer.from(barcode, "utf8").toString("base64url");
}

export function buildGlobalProductRecord(
  input: CatalogProductInput
): CatalogProduct {
  const barcode = normalizeBarcode(input.barcode);
  const name = String(input.name ?? "").trim();
  const sellingPrice = Math.round(Number(input.sellingPrice) * 100) / 100;
  if (
    !barcode ||
    name.length < 2 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0
  )
    throw new Error("INVALID_PRODUCT");
  return {
    id: input.id,
    barcode,
    name,
    sellingPrice,
    unit: "قطعة",
    isActive: input.isActive !== false,
    createdByUserId: input.createdByUserId ?? null,
    createdByStoreId: input.createdByStoreId ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createPriceChangeRequest(input: {
  id: string;
  product: Pick<CatalogProduct, "id" | "barcode" | "name" | "sellingPrice">;
  requestedPrice: number;
  requestedByUserId: number;
  requestedByName: string;
  requestedByStoreId: number | null;
  requestedByStoreName: string;
  createdAt: string;
}) {
  const requestedPrice = Math.round(Number(input.requestedPrice) * 100) / 100;
  if (!Number.isFinite(requestedPrice) || requestedPrice < 0)
    throw new Error("INVALID_PRICE");
  const currentPrice =
    Math.round(Number(input.product.sellingPrice) * 100) / 100;
  if (requestedPrice === currentPrice) throw new Error("PRICE_UNCHANGED");
  return {
    id: input.id,
    productId: input.product.id,
    barcode: input.product.barcode,
    productName: input.product.name,
    currentPrice,
    requestedPrice,
    requestedByUserId: input.requestedByUserId,
    requestedByName: input.requestedByName,
    requestedByStoreId: input.requestedByStoreId,
    requestedByStoreName: input.requestedByStoreName,
    status: "PENDING" as const,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function applyApprovedPriceChange<
  T extends { sellingPrice: number | string },
>(
  product: T,
  request: { status: string; currentPrice: number; requestedPrice: number },
  updatedAt: string
): T & { sellingPrice: number; updatedAt: string } {
  if (request.status !== "PENDING") throw new Error("REQUEST_ALREADY_RESOLVED");
  if (
    Math.round(Number(product.sellingPrice) * 100) !==
    Math.round(Number(request.currentPrice) * 100)
  )
    throw new Error("PRICE_CONFLICT");
  return {
    ...product,
    sellingPrice: Math.round(Number(request.requestedPrice) * 100) / 100,
    updatedAt,
  };
}

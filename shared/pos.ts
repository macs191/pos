export type PosProduct = {
  id: string;
  name: string;
  barcode: string;
  sellingPrice: number | string;
  unit?: string;
};

export type PosCartLine = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  qty: number;
  unit: string;
};

export function addProductToCart(
  cart: PosCartLine[],
  product: PosProduct
): PosCartLine[] {
  const existing = cart.find(line => line.id === product.id);
  if (existing) {
    return cart.map(line =>
      line.id === product.id ? { ...line, qty: line.qty + 1 } : line
    );
  }
  return [
    ...cart,
    {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      price: Number(product.sellingPrice),
      qty: 1,
      unit: product.unit || "قطعة",
    },
  ];
}

export function cartSubtotal(cart: PosCartLine[]): number {
  return cart.reduce((sum, line) => sum + line.price * line.qty, 0);
}

export function invoiceTotal(subtotal: number, discount = 0, tax = 0): number {
  return Math.max(0, subtotal - discount + tax);
}

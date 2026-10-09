import type { PosCartLine } from "@shared/pos";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DRAFT_PREFIX = "souqi:pos-draft:v1:";

function storageKey(userId: number | string) {
  return `${DRAFT_PREFIX}${String(userId)}`;
}

function normalizeLine(value: unknown): PosCartLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const barcode = typeof row.barcode === "string" ? row.barcode.trim() : "";
  const unit = typeof row.unit === "string" && row.unit.trim() ? row.unit : "قطعة";
  const price = Number(row.price);
  const qty = Number(row.qty);

  if (
    !id ||
    !name ||
    !barcode ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > 100_000
  ) {
    return null;
  }

  return { id, name, barcode, price, qty, unit: unit.slice(0, 40) };
}

export function loadPosDraft(
  storage: StorageLike | undefined,
  userId: number | string
): PosCartLine[] {
  if (!storage || !String(userId)) return [];
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLine).filter((line): line is PosCartLine => line !== null).slice(0, 100);
  } catch {
    return [];
  }
}

export function savePosDraft(
  storage: StorageLike | undefined,
  userId: number | string,
  cart: PosCartLine[]
): boolean {
  if (!storage || !String(userId)) return false;
  try {
    const safeCart = cart.map(normalizeLine).filter((line): line is PosCartLine => line !== null).slice(0, 100);
    storage.setItem(storageKey(userId), JSON.stringify(safeCart));
    return true;
  } catch {
    return false;
  }
}

export function clearPosDraft(
  storage: StorageLike | undefined,
  userId: number | string
): void {
  if (!storage || !String(userId)) return;
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Storage can be disabled by browser policy; keep the in-memory POS usable.
  }
}

export function normalizeTableRows<T extends Record<string, unknown>>(
  value: unknown
): T[] {
  if (value === null || typeof value !== "object") return [];

  return Object.values(value as Record<string, unknown>).filter(
    (row): row is T =>
      row !== null && typeof row === "object" && !Array.isArray(row)
  );
}

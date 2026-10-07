const DAY_MS = 86_400_000;

export function calculateRenewalEndDate(
  currentEnd: Date | string | number | null | undefined,
  days: number,
  now: Date = new Date()
): Date {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new RangeError("INVALID_RENEWAL_DAYS");

  const currentEndTime =
    currentEnd == null
      ? Number.NaN
      : currentEnd instanceof Date
        ? currentEnd.getTime()
        : new Date(currentEnd).getTime();
  const baseTime = Number.isFinite(currentEndTime)
    ? Math.max(now.getTime(), currentEndTime)
    : now.getTime();

  return new Date(baseTime + days * DAY_MS);
}

export function applySubscriptionRenewal(
  current: Record<string, unknown>,
  requestId: string,
  days: number,
  now: Date = new Date(),
  fallbackEnd?: Date | string | number | null
): Record<string, unknown> {
  if (current.lastRenewalRequestId === requestId) return current;
  const currentEnd = current.endDate as
    | Date
    | string
    | number
    | null
    | undefined;
  const endDate = calculateRenewalEndDate(
    currentEnd ?? fallbackEnd,
    days,
    now
  );
  return {
    ...current,
    status: "ACTIVE",
    endDate: endDate.toISOString(),
    isPaid: false,
    updatedAt: now.toISOString(),
    lastRenewalRequestId: requestId,
  };
}

export function hasPendingSubscriptionRequest(
  rows: readonly unknown[],
  supermarketId: number
): boolean {
  return rows.some(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const request = row as { supermarketId?: unknown; status?: unknown };
    return (
      Number(request.supermarketId) === supermarketId &&
      (request.status === "PENDING" || request.status === "PROCESSING")
    );
  });
}

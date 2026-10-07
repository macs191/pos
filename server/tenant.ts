export function getTenantIdFromUser(
  user: { supermarketId?: number | string | null } | null | undefined
): number | null {
  if (!user) return null;
  const supermarketId = Number(user.supermarketId);
  return Number.isSafeInteger(supermarketId) && supermarketId > 0
    ? supermarketId
    : null;
}

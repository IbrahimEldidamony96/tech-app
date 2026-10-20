export type ReturnQuantityLine = { orderItemId: string; quantity: number };
export type PurchasedOrderLine = { id: string; quantity: number; productName: string };
export type ReturnQuantityConflict =
  | { kind: "invalid_item" }
  | { kind: "exceeds_purchased"; productName: string };

/**
 * Must be called with reservation/receipt sums read AFTER locking the parent
 * Order row FOR UPDATE in the same database transaction. This arithmetic
 * alone does not protect against concurrent requests.
 */
export function returnQuantityConflict(
  requested: readonly ReturnQuantityLine[],
  purchased: readonly PurchasedOrderLine[],
  alreadyReserved: ReadonlyMap<string, number>,
): ReturnQuantityConflict | null {
  const purchasedById = new Map(purchased.map((item) => [item.id, item]));
  const requestedSums = new Map<string, number>();

  for (const item of requested) {
    const source = purchasedById.get(item.orderItemId);
    if (!source) return { kind: "invalid_item" };
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      return { kind: "exceeds_purchased", productName: source.productName };
    }
    requestedSums.set(item.orderItemId, (requestedSums.get(item.orderItemId) ?? 0) + item.quantity);
  }

  for (const [id, quantity] of requestedSums) {
    const source = purchasedById.get(id)!;
    if (quantity + (alreadyReserved.get(id) ?? 0) > source.quantity) {
      return { kind: "exceeds_purchased", productName: source.productName };
    }
  }
  return null;
}

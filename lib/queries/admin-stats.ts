import { prisma } from "@/lib/prisma";
import {
  aggregateCashEvents, amountFromCents, cairoRangeDayKeys,
  cairoStartOfDay, decimalEgpToCents,
} from "@/lib/cash-reporting";

export type RevenueRange = "today" | "7d" | "30d";

/** Finance is measured by actual money events, not order creation time. */
export async function getAdminStats(revenueRange: RevenueRange = "30d") {
  const now = new Date();
  const days = cairoRangeDayKeys(revenueRange, now);
  const rangeStart = cairoStartOfDay(days[0]);
  const capturedStatuses = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
  const [captures, refunds, pendingOrders, lowStockVariants, newCustomers,
    statusGroups, topItems] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: { in: [...capturedStatuses] },
        paidAt: { gte: rangeStart, lte: now },
      },
      select: { id: true, amount: true, paidAt: true },
    }),
    prisma.refund.findMany({
      where: { status: "CONFIRMED", confirmedAt: { gte: rangeStart, lte: now } },
      select: { amount: true, confirmedAt: true },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.productVariant.count({
      where: { isActive: true, stock: { lte: 5 }, product: { deletedAt: null } },
    }),
    prisma.user.count({
      where: { role: "CUSTOMER", createdAt: { gte: rangeStart, lte: now }, deletedAt: null },
    }),
    // Operational counts are grouped by creation date, NOT payment date.
    prisma.order.groupBy({
      by: ["status"], where: { createdAt: { gte: rangeStart, lte: now } },
      _count: { _all: true },
    }),
    // Gross paid units; refund ledger doesn't yet record stock disposition
    // by SKU, so don't label these as net units sold.
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: {
        order: {
          payment: { is: {
            status: { in: [...capturedStatuses] },
            paidAt: { gte: rangeStart, lte: now },
          } },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } }, take: 5,
    }),
  ]);

  const report = aggregateCashEvents([
    ...captures.filter(p => p.paidAt !== null).map(p => ({
      kind: "CAPTURE" as const, at: p.paidAt!,
      amountCents: decimalEgpToCents(p.amount.toFixed(2)),
    })),
    ...refunds.filter(r => r.confirmedAt !== null).map(r => ({
      kind: "REFUND" as const, at: r.confirmedAt!,
      amountCents: decimalEgpToCents(r.amount.toFixed(2)),
    })),
  ]);

  const dailyRevenue = days.map(date => {
    const row = report.daily.get(date);
    return {
      date,
      revenue: amountFromCents((row?.grossCents ?? 0) - (row?.refundedCents ?? 0)),
      gross: amountFromCents(row?.grossCents ?? 0),
      refunded: amountFromCents(row?.refundedCents ?? 0),
      orders: row?.paidOrders ?? 0,
    };
  });

  const variants = topItems.length ? await prisma.productVariant.findMany({
    where: { id: { in: topItems.map(x => x.variantId) } },
    select: { id: true, sku: true, product: { select: { nameEn: true } } },
  }) : [];
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const topProducts = topItems.map(x => ({
    variantId: x.variantId,
    name: variantMap.get(x.variantId)?.product.nameEn ?? "Unknown",
    sku: variantMap.get(x.variantId)?.sku ?? "",
    quantity: x._sum.quantity ?? 0,
  }));

  return {
    revenue: amountFromCents(report.netCents),
    grossRevenue: amountFromCents(report.grossCents),
    refundedAmount: amountFromCents(report.refundedCents),
    ordersInRange: report.paidOrders,
    pendingOrders, lowStockVariants, newCustomers,
    averageOrderValue: report.paidOrders
      ? amountFromCents(report.grossCents) / report.paidOrders : 0,
    statusCounts: Object.fromEntries(statusGroups.map(g => [g.status, g._count._all])),
    dailyRevenue, topProducts,
  };
}

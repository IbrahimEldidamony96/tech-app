import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

import { createInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, payment: true, user: { select: { name: true, email: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.userId !== session.user.id) {
    const actor = await prisma.user.findFirst({
      where: { id: session.user.id, deletedAt: null },
      select: { role: true },
    });
    if (!hasPermission(actor?.role, "orders:read")) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
  }

  const customer = order.user?.name ?? `${order.shippingFirstName} ${order.shippingLastName}`;
  const pdf = await createInvoicePdf({ id: order.id, date: order.createdAt.toISOString().slice(0, 10), customer,
    email: order.user?.email ?? order.guestEmail ?? "Guest", payment: order.paymentStatus + " (" + (order.payment?.method ?? "N/A") + ")",
    items: order.items.map(i => ({ name: i.productName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2), totalPrice: i.totalPrice.toFixed(2) })),
    subtotal: order.subtotal.toFixed(2), discount: order.discount.toFixed(2), shipping: order.shippingCost.toFixed(2), total: order.total.toFixed(2),
    address: [order.shippingStreet, order.shippingCity, order.shippingGovernorate, order.shippingCountry].join(", "),
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="invoice-${order.id}.pdf"`, "cache-control": "private, no-store" } });
}

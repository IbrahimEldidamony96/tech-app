import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
}

function buildSimplePdf(lines: string[]) {
  const text = lines.slice(0, 55).map((line, index) => `${index === 0 ? "" : "0 -14 Td\n"}(${pdfEscape(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 11 Tf\n50 790 Td\n${text}\nET`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => { offsets[i + 1] = Buffer.byteLength(pdf); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

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
  const lines = [
    "TECH STORE - INVOICE",
    `Invoice / Order: ${order.id}`,
    `Date: ${order.createdAt.toISOString().slice(0, 10)}`,
    `Customer: ${customer}`,
    `Email: ${order.user?.email ?? order.guestEmail ?? "Guest"}`,
    `Payment: ${order.paymentStatus} (${order.payment?.method ?? "N/A"})`,
    "",
    ...order.items.map((i) => `${i.productName} | ${i.sku} | ${i.quantity} x EGP ${i.unitPrice.toFixed(2)} = EGP ${i.totalPrice.toFixed(2)}`),
    "",
    `Subtotal: EGP ${order.subtotal.toFixed(2)}`,
    `Discount: EGP ${order.discount.toFixed(2)}`,
    `Shipping: EGP ${order.shippingCost.toFixed(2)}`,
    `TOTAL: EGP ${order.total.toFixed(2)}`,
    "",
    `Ship to: ${order.shippingStreet}, ${order.shippingCity}, ${order.shippingGovernorate}, ${order.shippingCountry}`,
  ];
  const pdf = buildSimplePdf(lines);
  return new NextResponse(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="invoice-${order.id}.pdf"`, "cache-control": "private, no-store" } });
}

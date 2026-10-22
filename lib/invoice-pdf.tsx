import { join } from "node:path";
import React from "react";

let registered = false;
export type InvoiceData = {
  id: string; date: string; customer: string; email: string; payment: string; address: string;
  items: { name: string; sku: string; quantity: number; unitPrice: string; totalPrice: string }[];
  subtotal: string; discount: string; shipping: string; total: string;
};
const direction = (text: string) => /[\u0600-\u06ff]/.test(text) ? "rtl" as const : "ltr" as const;
export async function createInvoicePdf(invoice: InvoiceData) {
  const { Document, Font, Page, Text, View, renderToBuffer } = await import("@react-pdf/renderer");
  if (!registered) {
    Font.register({ family: "Invoice", src: join(process.cwd(), "assets/fonts/NotoSansArabic.ttf") });
    Font.register({ family: "InvoiceLatin", src: join(process.cwd(), "assets/fonts/NotoSans.ttf") });
    Font.registerHyphenationCallback(word => [word]);
    registered = true;
  }
  return renderToBuffer(<Document title={"Invoice " + invoice.id} language="ar-EG" author="Tech Store">
    <Page size="A4" wrap style={{ fontFamily: ["Invoice", "InvoiceLatin"], fontSize: 10, lineHeight: 1.6, padding: 40, paddingBottom: 60 }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>TECH STORE — INVOICE</Text>
      <Text>Order: {invoice.id}</Text>
      <Text>Date: {invoice.date}</Text>
      <Text>Customer</Text>
      <Text style={{ direction: direction(invoice.customer), textAlign: direction(invoice.customer) === "rtl" ? "right" : "left" }}>{invoice.customer}</Text>
      <Text>Email: {invoice.email}</Text>
      <Text>Payment: {invoice.payment}</Text>
      <View style={{ marginTop: 16, marginBottom: 12 }}>
        {invoice.items.map((item, index) => <View key={index} wrap={false} style={{ borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 6 }}>
          <Text style={{ direction: direction(item.name), textAlign: direction(item.name) === "rtl" ? "right" : "left" }}>{item.name}</Text>
          <Text>SKU: {item.sku}</Text>
          <Text>{item.quantity} × EGP {item.unitPrice} = EGP {item.totalPrice}</Text>
        </View>)}
      </View>
      <View wrap={false} style={{ borderTopWidth: 1, paddingTop: 8 }}>
        <Text>Subtotal: EGP {invoice.subtotal}</Text><Text>Discount: EGP {invoice.discount}</Text>
        <Text>Shipping: EGP {invoice.shipping}</Text><Text style={{ fontSize: 13 }}>TOTAL: EGP {invoice.total}</Text>
      </View>
      <Text style={{ marginTop: 16 }}>Ship to</Text>
      <Text style={{ direction: direction(invoice.address), textAlign: direction(invoice.address) === "rtl" ? "right" : "left" }}>{invoice.address}</Text>
      <Text fixed style={{ position: "absolute", bottom: 25, right: 40, fontSize: 8 }} render={({ pageNumber, totalPages }) => pageNumber + " / " + totalPages} />
    </Page>
  </Document>);
}

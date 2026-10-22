import assert from "node:assert/strict";
import test from "node:test";
import { createInvoicePdf } from "./invoice-pdf";

test("Arabic invoices preserve all items, totals and addresses across pages", async () => {
  const buffer = await createInvoicePdf({
    id: "invoice-regression", date: "22 October 2026", customer: "محمد أحمد",
    email: "customer@example.invalid", payment: "PAID", address: "القاهرة مدينة نصر",
    items: Array.from({ length: 65 }, (_, index) => ({ name: "هاتف Item " + index, sku: "SKU-" + index, quantity: 1, unitPrice: "10.00", totalPrice: "10.00" })),
    subtotal: "650.00", discount: "0.00", shipping: "25.00", total: "675.00",
  });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  try {
    const document = await task.promise;
    assert.ok(document.numPages > 1);
    let text = "";
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      text += content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "").join("") + "\n";
    }
    assert.ok(text.includes("محمد أحمد"));
    assert.ok(text.includes("القاهرة مدينة نصر"));
    for (let index = 0; index < 65; index++) assert.match(text, new RegExp("SKU-" + index + "(?![0-9])"));
    assert.ok(text.includes("TOTAL: EGP 675.00"));
    assert.ok(!text.includes("????"));
  } finally { await task.destroy(); }
});

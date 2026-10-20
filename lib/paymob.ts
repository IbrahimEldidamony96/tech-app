import crypto from "crypto";

// عميل Paymob (Intention API v1) — التفاصيل هنا مأخوذة من الـ skill الرسمي
// اللي Paymob نفسها ناشراه لوكلاء الـ AI (github.com/PaymobAccept/Paymob-AI-Integration-Skill)،
// مش تخمين زي ما حصل الأول مع Bosta. المتجر ده مصر بس دلوقتي، فالـ base
// URL وكود الدولة (EGY) متثبتين هنا عمدًا بدل ما نبني multi-region مالوش داعي.

const BASE_URL = process.env.PAYMOB_BASE_URL ?? "https://accept.paymob.com";
const SECRET_KEY = process.env.PAYMOB_SECRET_KEY;
const PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY;
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;

export class PaymobApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PaymobApiError";
    this.status = status;
  }
}

type BillingData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  building?: string;
  apartment?: string;
  city: string;
};

type CreateIntentionInput = {
  amountCents: number;
  specialReference: string; // بنبعت order id بتاعنا هنا — بيرجع في الـ webhook كـ order.merchant_order_id
  integrationId: number;
  billing: BillingData;
  notes: string; // بتتحط كـ item name/description، مفيش تأثير وظيفي
  notificationUrl: string;
  redirectionUrl: string;
};

export async function createIntention(
  input: CreateIntentionInput,
): Promise<{ clientSecret: string; intentionId: string }> {
  if (!SECRET_KEY) throw new Error("PAYMOB_SECRET_KEY is not set");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/intention/`, {
      method: "POST",
      headers: {
        // الكلمة الحرفية "Token" مش "Bearer" — غلطة شائعة موثقة في الـ skill نفسه
        Authorization: `Token ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        amount: input.amountCents,
        currency: "EGP",
        payment_methods: [input.integrationId],
        items: [{ name: input.notes, amount: input.amountCents, quantity: 1 }],
        special_reference: input.specialReference,
        billing_data: {
          first_name: input.billing.firstName,
          last_name: input.billing.lastName,
          email: input.billing.email,
          phone_number: input.billing.phone, // مطلوب — سبب شائع لـ 400 لو ناقص
          street: input.billing.street,
          building: input.billing.building ?? "NA",
          floor: "NA", // مش بنجمعه في فورم العنوان عندنا
          apartment: input.billing.apartment ?? "NA",
          city: input.billing.city,
          state: input.billing.city,
          country: "EGY", // المتجر مصر بس دلوقتي — كود ISO بـ3 حروف
          shipping_method: "NA",
          postal_code: "NA",
        },
        customer: {
          first_name: input.billing.firstName,
          last_name: input.billing.lastName,
          email: input.billing.email,
        },
        notification_url: input.notificationUrl,
        redirection_url: input.redirectionUrl,
      }),
    });
  } catch {
    throw new PaymobApiError("Could not reach Paymob API", 0);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new PaymobApiError(
      json?.detail ?? `Paymob API error (${res.status})`,
      res.status,
    );
  }

  return { clientSecret: json.client_secret, intentionId: String(json.id) };
}

/** رابط صفحة الدفع المستضافة عند Paymob (Unified Checkout) لبدء الدفع. */
export function paymobCheckoutUrl(clientSecret: string): string {
  if (!PUBLIC_KEY) throw new Error("PAYMOB_PUBLIC_KEY is not set");
  return `${BASE_URL}/unifiedcheckout/?publicKey=${PUBLIC_KEY}&clientSecret=${clientSecret}`;
}

// ترتيب الحقول ده مو اختياري ولا أبجدي — ده بالظبط الترتيب اللي Paymob
// موثقاه لحساب الـ HMAC (Transaction Processed Callback). أي تغيير في
// الترتيب هيخلي كل تحقق يفشل بصمت.
export function verifyPaymobTransactionHmac(
  obj: Record<string, unknown>,
  receivedHmac: string,
): boolean {
  if (!HMAC_SECRET) throw new Error("PAYMOB_HMAC_SECRET is not set");

  const order = obj.order as Record<string, unknown> | undefined;
  const sourceData = obj.source_data as Record<string, unknown> | undefined;

  const fields = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    order?.id,
    obj.owner,
    obj.pending,
    sourceData?.pan,
    sourceData?.sub_type,
    sourceData?.type,
    obj.success,
  ];

  const concatenated = fields.map((f) => String(f ?? "")).join("");
  const computed = crypto
    .createHmac("sha512", HMAC_SECRET)
    .update(concatenated)
    .digest("hex");

  // مقارنة بطول ثابت (timing-safe) عشان مانسربش معلومة عن طول/محتوى
  // الـ HMAC الصحيح من خلال فرق التوقيت
  return (
    computed.length === receivedHmac.length &&
    crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(receivedHmac))
  );
}


// Refund reconciliation deliberately uses a READ-ONLY provider inquiry.
// Funds are initiated by an explicitly authorized operator in Paymob's
// dashboard; this application does not issue refund POST requests.
// Paymob's transaction-inquiry API uses a short-lived Bearer token obtained
// from the merchant API key (not the Intention SECRET_KEY).
export type PaymobRefundSnapshot = {
  transactionId: string;
  orderReference: string;
  originalAmountCents: number;
  refundedAmountCents: number;
};

export function validatePaymobRefundInquiry(
  data: Record<string, unknown>,
  expected: { transactionId: string; orderId: string; amountCents: number },
): PaymobRefundSnapshot {
  const order = data.order && typeof data.order === "object" ? data.order as Record<string, unknown> : null;
  const refundRaw = data.refunded_amount_cents_int ?? data.refunded_amount_cents;
  const refund = typeof refundRaw === "string" && /^\d+$/.test(refundRaw) ? Number(refundRaw) : refundRaw;
  if (String(data.id) !== expected.transactionId ||
      String(order?.merchant_order_id) !== expected.orderId ||
      data.currency !== "EGP" ||
      Number(data.amount_cents) !== expected.amountCents ||
      data.success !== true ||
      !Number.isSafeInteger(refund) || (refund as number) < 0 ||
      (refund as number) > expected.amountCents) {
    throw new PaymobApiError("Paymob inquiry does not match the original payment", 409);
  }
  return {
    transactionId: expected.transactionId,
    orderReference: expected.orderId,
    originalAmountCents: expected.amountCents,
    refundedAmountCents: refund as number,
  };
}

export async function inquirePaymobRefund(input: {
  transactionId: string;
  orderId: string;
  amountCents: number;
}): Promise<PaymobRefundSnapshot> {
  const apiKey = process.env.PAYMOB_API_KEY;
  if (!apiKey) throw new PaymobApiError("PAYMOB_API_KEY is missing (refund reconciliation disabled)", 503);
  if (!/^\d+$/.test(input.transactionId)) throw new PaymobApiError("Invalid payment transaction ID", 400);

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${BASE_URL}/api/auth/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymobApiError("Could not authenticate with Paymob inquiry API", 502);
  }
  const tokenJson = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || typeof tokenJson?.token !== "string" || !tokenJson.token) {
    throw new PaymobApiError("Paymob inquiry authentication failed", 502);
  }
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/acceptance/transactions/${input.transactionId}`, {
      headers: { Authorization: `Bearer ${tokenJson.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymobApiError("Could not contact Paymob transaction inquiry", 502);
  }
  if (!response.ok) throw new PaymobApiError("Paymob transaction inquiry failed", 502);
  const json: unknown = await response.json().catch(() => null);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new PaymobApiError("Invalid Paymob transaction inquiry", 502);
  }
  return validatePaymobRefundInquiry(json as Record<string, unknown>, input);
}

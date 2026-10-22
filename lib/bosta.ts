import type { ShipmentStatus } from "@/app/generated/prisma/client";

// عميل Bosta REST API v2 — تفاصيل الملف ده اتأكدت من التوثيق الرسمي
// العام بتاعهم (docs.bosta.co)، مش تخمين. لو أي حاجة اختلفت بعدين
// (Bosta بتحدّث الـ API بتاعها زي أي حد)، ده المكان الوحيد اللي محتاج تعدله.

const BOSTA_BASE_URL = process.env.BOSTA_BASE_URL ?? "https://app.bosta.co";
const BOSTA_API_KEY = process.env.BOSTA_API_KEY;

// "Deliver" — الطلب العادي (كود 10): العميل بيشتري وإحنا بنشحنله.
// الأنواع التانية (Cash Collection 15، Exchange 30، CRP 25) مش مستخدمة
// في متجر إلكتروني عادي زي بتاعنا.
const BOSTA_DELIVERY_TYPE_SEND = 10;

export class BostaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BostaApiError";
    this.status = status;
  }
}

// *** باج أمني كان موجود: cityId (وفي districts، zoneId كمان) كانوا
// بيتحطوا في الـ path من غير أي فحص، فقيمة زي "../../v0/deliveries/X"
// كانت بتهرب من "cities/{id}/zones" لمسار تاني تمامًا عند Bosta، والطلب
// بيتبعت بمفتاح BOSTA_API_KEY بتاعنا. شكل الـ id الحقيقي عند Bosta لسه
// مش موثّق بدقة 100% (مش بالضرورة نفس طول ObjectId التقليدي)، فبدل ما
// نخمّن طول معين، بنمنع بس الحروف اللي ممكن تُستخدم للهروب من المسار
// (./ أو \) أو حقن query string (?/&/=) أو أي حاجة غير ألفانيوم +
// شرطة/underscore. أي id حقيقي من Bosta هيعدي الفحص ده عادي.
const BOSTA_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidBostaId(id: string): boolean {
  return BOSTA_ID_PATTERN.test(id);
}

function assertValidBostaId(id: string, label: string): void {
  if (!isValidBostaId(id)) {
    throw new BostaApiError(`Invalid ${label}`, 400);
  }
}

async function bostaRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  apiVersion: "v0" | "v2" = "v2",
): Promise<T> {
  if (!BOSTA_API_KEY) {
    throw new Error("BOSTA_API_KEY is not set");
  }

  // "cities" و"deliveries" و"cities/{id}/zones" و"cities/{id}/districts"
  // كلهم مؤكدين شغالين على v2 (جرّبناهم فعليًا). الباراميتر ده باقي هنا
  // للتوافق لو احتجنا endpoint تاني على v0 لاحقًا، مش مستخدم دلوقتي.
  const url =
    apiVersion === "v2"
      ? `${BOSTA_BASE_URL}/api/v2/${path}${path.includes("?") ? "&" : "?"}apiVersion=1`
      : `${BOSTA_BASE_URL}/api/v0/${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: BOSTA_API_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BostaApiError("Could not reach Bosta API", 0);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new BostaApiError(
      json?.message ?? `Bosta API error (${res.status})`,
      res.status,
    );
  }

  return (json?.data ?? json) as T;
}

// ---------- Cities, Zones & Districts ----------
// *** فهم صحيح بعد باج حقيقي (Error 3003 "District Not Found") ***
// اتأكد فعليًا (Bosta emails + استدعاءات API مباشرة) إن zone وdistrict
// مستويين مختلفين تمامًا عند Bosta، مش نفس الحاجة:
//   City (محافظة) → Zone (منطقة، مثلاً "Nasr City") → District (حي/قسم
//   جوه المنطقة، مثلاً "ElHay 06 (Nasr City)") — منطقة واحدة ممكن يبقى
//   جواها عشرات الـ districts.
// اللي كنا بنعتبره "district" قبل كده (من GET /v0/zones?cityId=X) كان
// في الحقيقة مستوى الـ Zone بس (نفس شكل GET /v2/cities/{cityId}/zones
// بالظبط)، فكنا بنبعت zoneId في مكان districtId من غير ما نعرف، وBosta
// كانت برفضه بـ"District Not Found" لأنه فعلاً مش district حقيقي.
// الحل: GET /v2/cities/{cityId}/districts بترجع كل الـ districts في
// المدينة، كل واحد معاه zoneId بتاعه — بنفلترهم بالـ zone اللي العميل
// اختاره من الـ dropdown.
export type BostaCity = { _id: string; name: string; nameAr?: string };
export type BostaZone = {
  _id: string;
  name: string;
  nameAr?: string;
  pickupAvailability?: boolean;
  dropOffAvailability?: boolean;
};
export type BostaDistrict = {
  id: string;
  name: string;
  nameAr?: string;
  zoneId: string;
  zoneName: string;
};

let citiesCache: BostaCity[] | null = null;
const zonesCache = new Map<string, BostaZone[]>();
const districtsCache = new Map<string, BostaDistrict[]>(); // كل districts المدينة كاملة، مش مفلترة بمنطقة — الفلترة بتحصل في getBostaDistrictsForZone

export async function getBostaCities(): Promise<BostaCity[]> {
  if (!citiesCache) {
    const raw = await bostaRequest<unknown>("GET", "cities");
    citiesCache = extractListFromResponse<BostaCity>(raw, "/cities");
  }
  return citiesCache;
}

/** قايمة المناطق (zones) جوه محافظة معينة — دي اللي العميل بيختار منها
 * في أول dropdown بعد المحافظة. */
export async function getBostaZones(cityId: string): Promise<BostaZone[]> {
  assertValidBostaId(cityId, "cityId");
  if (!zonesCache.has(cityId)) {
    const raw = await bostaRequest<unknown>(
      "GET",
      `cities/${encodeURIComponent(cityId)}/zones`,
    );
    zonesCache.set(cityId, extractListFromResponse<BostaZone>(raw, "/zones"));
  }
  return zonesCache.get(cityId)!;
}

/** كل الـ districts في محافظة معينة (كل المناطق مع بعض، من غير فلترة) —
 * بنكاشها كاملة مرة واحدة لكل مدينة، وبعدين بنفلتر محليًا بالمنطقة في
 * getBostaDistrictsForZone بدل ما نعمل نداء API جديد لكل منطقة. */
async function getAllBostaDistrictsForCity(
  cityId: string,
): Promise<BostaDistrict[]> {
  assertValidBostaId(cityId, "cityId");
  if (!districtsCache.has(cityId)) {
    const raw = await bostaRequest<unknown>(
      "GET",
      `cities/${encodeURIComponent(cityId)}/districts`,
    );
    const rawList = extractListFromResponse<{
      zoneId: string;
      zoneName: string;
      zoneOtherName?: string;
      districtId: string;
      districtName: string;
      districtOtherName?: string;
    }>(raw, "/districts");
    districtsCache.set(
      cityId,
      rawList.map((d) => ({
        id: d.districtId,
        name: d.districtName,
        nameAr: d.districtOtherName,
        zoneId: d.zoneId,
        zoneName: d.zoneName,
      })),
    );
  }
  return districtsCache.get(cityId)!;
}

/** قايمة الـ districts بس اللي جوه منطقة (zone) معينة — دي اللي العميل
 * بيختار منها في تاني dropdown بعد ما يحدد المنطقة. */
export async function getBostaDistrictsForZone(
  cityId: string,
  zoneId: string,
): Promise<BostaDistrict[]> {
  assertValidBostaId(zoneId, "zoneId");
  const all = await getAllBostaDistrictsForCity(cityId);
  return all.filter((d) => d.zoneId === zoneId);
}

// شكل رد /cities اتأكد فعليًا: array تحت مفتاح "list". بنسيب باقي
// المفاتيح كاحتياط بس (لو Bosta غيّرت الشكل، أو /districts مختلف شوية)
function extractListFromResponse<T>(
  raw: unknown,
  endpointForError: string,
): T[] {
  if (Array.isArray(raw)) return raw as T[];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.list)) return obj.list as T[];
    if (Array.isArray(obj.cities)) return obj.cities as T[];
    if (Array.isArray(obj.districts)) return obj.districts as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.list)) return nested.list as T[];
    }
  }

  throw new Error(
    `Unexpected ${endpointForError} response shape: ${JSON.stringify(raw).slice(0, 200)} — update extractListFromResponse() in lib/bosta.ts to match.`,
  );
}

function findByName<T extends { name: string; nameAr?: string }>(
  items: T[],
  search: string,
): T | undefined {
  const normalized = search.trim().toLowerCase();
  const matches = (value: string | undefined) =>
    value?.trim().toLowerCase() === normalized;
  const includes = (value: string | undefined) => {
    const v = value?.trim().toLowerCase();
    return v ? v.includes(normalized) || normalized.includes(v) : false;
  };

  return (
    items.find((i) => matches(i.name) || matches(i.nameAr)) ??
    items.find((i) => includes(i.name) || includes(i.nameAr))
  );
}

/**
 * بيدوّر على cityId حقيقي عند Bosta يطابق اسم محافظة/مدينة نصي عندنا.
 * بيقارن بالاسم الإنجليزي والعربي معًا (Bosta بترجع الاتنين).
 */
export async function resolveBostaCityId(
  governorateOrCityName: string,
): Promise<string> {
  const match = findByName(await getBostaCities(), governorateOrCityName);
  if (!match) {
    throw new Error(
      `Bosta city not found for "${governorateOrCityName}" — check it matches an official Bosta city name (call getBostaCities() to see the full list).`,
    );
  }
  return match._id;
}

/** بيدوّر على zoneId حقيقي جوه مدينة معينة يطابق اسم منطقة نصي عندنا. */
export async function resolveBostaZoneId(
  cityId: string,
  zoneName: string,
): Promise<string> {
  const match = findByName(await getBostaZones(cityId), zoneName);
  if (!match) {
    throw new Error(
      `Bosta zone not found for "${zoneName}" in this city — check it matches an official Bosta zone name (call getBostaZones(cityId) to see the full list).`,
    );
  }
  return match._id;
}

/**
 * بيدوّر على districtId حقيقي جوه منطقة (zone) معينة. لو اسم district
 * محدد اتبعت ومالوش تطابق، بناخد أول district متاح في نفس المنطقة بدل
 * ما نفشل تمامًا — أي district صحيح جوه المنطقة الصح أحسن من غير حاجة
 * خالص، وBosta مفهاش endpoint جيوكودينج أدق نقدر نستخدمه بدل كده.
 */
export async function resolveBostaDistrictId(
  cityId: string,
  zoneId: string,
  districtName?: string,
): Promise<string> {
  const districts = await getBostaDistrictsForZone(cityId, zoneId);
  if (districts.length === 0) {
    throw new Error(
      `Bosta has no districts listed for this zone (cityId=${cityId}, zoneId=${zoneId}).`,
    );
  }
  const match = districtName ? findByName(districts, districtName) : undefined;
  return (match ?? districts[0]).id;
}

// لو عندنا الـ id الحقيقي محفوظ بالفعل (اتحفظ وقت ما اليوزر اختار من
// الـ dropdown نفسه اللي بيجيب بيانات Bosta لايف)، بنستخدمه على طول من
// غير أي نداء شبكة تاني.
export async function resolveBostaCityIdCached(
  cachedCityId: string | null | undefined,
  governorateName: string,
): Promise<string> {
  if (!cachedCityId) return resolveBostaCityId(governorateName);

  assertValidBostaId(cachedCityId, "cityId");
  const city = (await getBostaCities()).find((item) => item._id === cachedCityId);
  if (!city || !findByName([city], governorateName)) {
    throw new BostaApiError(
      "The selected Bosta city does not match the address governorate",
      400,
    );
  }
  return cachedCityId;
}

/**
 * نفس فكرة resolveBostaCityIdCached، بس للـ district. لو مفيش id محفوظ
 * (عنوان قديم اتعمل قبل إضافة الـ dropdown التلاتي: محافظة→منطقة→حي) —
 * بنحاول نطابق النص المتاح (governorate/city القديمين) كاسم *منطقة*
 * الأول (أغلب البيانات القديمة كانت على مستوى المنطقة زي "Nasr City")،
 * وبعدين ناخد أول district جوه المنطقة دي.
 */
export async function resolveBostaDistrictIdCached(
  cachedDistrictId: string | null | undefined,
  cityId: string,
  areaOrCityName: string,
): Promise<string> {
  const zoneId = await resolveBostaZoneId(cityId, areaOrCityName);
  if (!cachedDistrictId) return resolveBostaDistrictId(cityId, zoneId);

  assertValidBostaId(cachedDistrictId, "districtId");
  const districts = await getBostaDistrictsForZone(cityId, zoneId);
  if (!districts.some((district) => district.id === cachedDistrictId)) {
    throw new BostaApiError(
      "The selected Bosta district does not belong to the selected city/zone",
      400,
    );
  }
  return cachedDistrictId;
}

// ---------- Deliveries ----------

type BostaAddress = {
  // cityId و districtId حقيقيين راجعين من resolveBostaCityId/resolveBostaDistrictId،
  // مش أسماء نصية — Bosta بترفض أي اسم نصي حر بـ "District Not Found"
  // (اتأكد من رد فعلي من الـ API).
  //
  // *** تحديث بعد باج حقيقي (Error 3003 "District Not Found") ***
  // اتأكد بإيميلات تنبيه رسمية من Bosta إن حتى districtId حقيقي (مطابق
  // 100% لاسم فعلي في رد /v0/zones لنفس الـ cityId) اترفض من /v2/deliveries.
  // كذا تكامل مستقل (Laravel packages مختلفة لناس مختلفين) بيبعتوا اسم
  // المحافظة/المنطقة النصي (city/zone) *مع* الـ id مش بدالها — الأرجح إن
  // v2 بتعمل validation داخلي بالاسم مش بس بالـ id الجاي من v0 legacy.
  // فبنبعت الاتنين مع بعض: id للدقة + اسم لأي cross-check داخلي عند Bosta.
  city?: string;
  cityId: string;
  zone?: string;
  districtId: string;
  firstLine: string;
  buildingNumber?: string;
  apartment?: string;
};

type BostaReceiver = {
  firstName: string;
  lastName: string;
  phone: string;
};

type CreateBostaDeliveryInput = {
  businessReference: string; // بنبعت order id بتاعنا هنا عشان يظهر في Bosta dashboard
  cod: number; // 0 لو الدفع تم مسبقًا، إجمالي الأوردر لو Cash on Delivery
  receiver: BostaReceiver;
  address: BostaAddress;
  itemsCount: number;
  notes?: string;
};

type BostaDeliveryResult = {
  bostaDeliveryId: string;
  trackingNumber: string;
};

export async function createBostaDelivery(
  input: CreateBostaDeliveryInput,
): Promise<BostaDeliveryResult> {
  const data = await bostaRequest<{
    _id: string;
    trackingNumber: string | number;
  }>("POST", "deliveries", {
    type: BOSTA_DELIVERY_TYPE_SEND,
    cod: input.cod,
    businessReference: input.businessReference,
    receiver: input.receiver,
    dropOffAddress: input.address,
    notes: input.notes,
    specs: {
      // "packageType: Small" اتأكدت وقتها من نداء POST /deliveries فعلي
      // (اتسجلت في الذاكرة كجزء من نفس الاختبار). سيبتها زي ما هي —
      // لو Bosta غيّرت enum القيم دي في نسخة أحدث من الـ API هترجع
      // برسالة خطأ واضحة من bostaRequest() فوق (مش هتفشل بصمت).
      packageType: "Small",
      packageDetails: {
        description: input.notes ?? "Tech Store order",
        itemsCount: input.itemsCount,
      },
    },
  });

  // trackingNumber بيرجع كـ Number من Bosta (شفناه رقم في مثال الـ webhook
  // بتاعهم)، وعندنا في الداتابيز مخزّن كـ String، فبنحوّله هنا مرة واحدة
  return {
    bostaDeliveryId: data._id,
    trackingNumber: String(data.trackingNumber),
  };
}

// *** غير مؤكدين زي باقي الملف *** — لقيتهم وقت المراجعة من غير أي
// تعليق "اتأكد فعليًا" زيه في باقي الملف. الشكل ده منطقي (REST قياسي)
// بس مش نفس نداء POST /deliveries و GET /cities اللي فعلاً اتجربوا.
// لو حصل خطأ هنا، ابعتلي الـ response/status code اللي راجع وهنصلحه
// على الحقيقي بدل ما أخمّن شكل تاني.
/** بتلغي شحنة عند Bosta. بنستخدمها لما الأدمن يلغي أوردر لسه معمولوش pickup. */
export async function cancelBostaDelivery(
  bostaDeliveryId: string,
): Promise<void> {
  await bostaRequest("DELETE", `deliveries/${bostaDeliveryId}`);
}

/** غير مؤكد برضه (نفس ملاحظة cancelBostaDelivery فوق) — حاليًا مش
 * متستخدمة في أي مكان تاني في المشروع (تتبّع الشحنة بيتم عن طريق
 * webhook بس، مش polling). */
export async function getBostaTracking(
  trackingNumber: string,
): Promise<unknown> {
  return bostaRequest("GET", `deliveries/${trackingNumber}/tracking`);
}

// ---------- State mapping ----------
// خريطة أكواد حالة Bosta الرقمية (مؤكدة من docs.bosta.co/docs/how-to/get-delivery-status-via-webhook)
// على الـ 6 حالات المبسطة بتاعتنا. الأكواد المتعلقة بأنواع طلبات تانية
// (Cash Collection, CRP, Exchange, Fulfillment) متشالة عمدًا لأننا بنعمل
// "Deliver" (type 10) بس، فمستحيل توصلنا أصلًا.
const BOSTA_STATE_MAP: Record<number, ShipmentStatus> = {
  10: "PENDING", // Pickup requested
  20: "PENDING", // Route Assigned
  21: "SHIPPED", // Picked up from business
  24: "SHIPPED", // Received at warehouse (لسه في شبكة Bosta، قبل ما تطلع للعميل)
  30: "IN_TRANSIT", // In transit between Hubs
  41: "IN_TRANSIT", // Picked up (Heading to customer, لـ Send)
  45: "DELIVERED", // Delivered
  46: "AWAITING_RECEIPT", // Returned to business; staff must inspect before restocking
  60: "AWAITING_RECEIPT", // Fulfillment return; still requires a stock receipt
  48: "EXCEPTION",
  49: "CANCELLED",
  100: "LOST",
  101: "DAMAGED",
  // 47 Exception و102 Investigation و104 Archived و105 On hold — حالات
  // مؤقتة/إدارية محتاجة مراجعة يدوية، فمش بنغيّر status بتاعنا بسببها
};

export function mapBostaState(stateCode: number): ShipmentStatus | null {
  return BOSTA_STATE_MAP[stateCode] ?? null;
}

// ترتيب الحالات عشان نمنع أي webhook متأخر/طايش يرجّع الحالة للخلف
export const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  PENDING: 0,
  PREPARING: 1,
  SHIPPED: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
  LOST: 5,
  DAMAGED: 5,
  CANCELLED: 5,
  EXCEPTION: 5,
  AWAITING_RECEIPT: 6,
  RETURNED: 7,
};

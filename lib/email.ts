import { Resend } from "resend";

// لو RESEND_API_KEY مش متظبطة (تطوير محلي عادةً)، بنسجل محتوى الإيميل
// في الـ console بدل ما نبعته فعليًا — عشان تقدر تجرب تدفق التسجيل/
// استعادة الباسورد كامل محليًا من غير ما تحتاج حساب Resend حقيقي.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Tech Store <onboarding@resend.dev>";

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ devMode: boolean }> {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required in production");
    }
    // Do not print HTML: verification/reset URLs contain bearer tokens.
    console.log(
      `[email:dev-mode] RESEND_API_KEY not set — email suppressed (to=${options.to}, subject=${options.subject})`,
    );
    return { devMode: true };
  }

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (result.error) {
    console.error("Resend send failed", result.error);
    throw new Error(`Failed to send email: ${result.error.message}`);
  }

  return { devMode: false };
}

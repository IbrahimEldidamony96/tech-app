// قوالب بسيطة بـ inline styles (عملاء البريد الإلكتروني مابتقراش
// stylesheets خارجية غالبًا) — إنجليزي بس حاليًا، حتى لو الموقع
// ثنائي اللغة؛ رسائل بريد تراعي اللغة محتاجة نعرف لغة المستخدم وقت
// التسجيل/الطلب، مش موجودة دلوقتي — تبسيط متعمّد، مش نسيان.

function wrapper(bodyHtml: string): string {
  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
  <h1 style="font-size: 18px; margin: 0 0 16px;">Tech Store</h1>
  ${bodyHtml}
  <p style="margin-top: 32px; font-size: 12px; color: #888;">If you didn't request this, you can safely ignore this email.</p>
</div>`.trim();
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin: 16px 0;">${label}</a>`;
}

export function verificationEmailHtml(link: string): string {
  return wrapper(`
    <p style="font-size: 14px; line-height: 1.6;">Thanks for creating an account. Confirm your email address to finish setting it up:</p>
    ${button(link, "Verify email")}
    <p style="font-size: 12px; color: #888;">This link expires in 24 hours.</p>
  `);
}

export function passwordResetEmailHtml(link: string): string {
  return wrapper(`
    <p style="font-size: 14px; line-height: 1.6;">We received a request to reset your password. Click below to choose a new one:</p>
    ${button(link, "Reset password")}
    <p style="font-size: 12px; color: #888;">This link expires in 1 hour.</p>
  `);
}

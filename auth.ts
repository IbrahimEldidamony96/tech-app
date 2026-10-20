import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import authConfig from "./auth.config";
import { sessionVersionMatches } from "@/lib/session-policy";

// الرسالة دي بتتحط في الـ URL كـ error code بعد الـ redirect
// (/login?error=CredentialsSignin&code=too_many_attempts) — الفرونت إند
// الحالي بيعرض رسالة عامة بس برضو، فمفيش أي معلومة حساسة بتتسرب
class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

// مستخرجة كدالة منفصلة (مش inline جوه Credentials({...})) عشان تتعمللها
// unit test مباشر من غير ما نلف عليها NextAuth.signIn() كامل (اللي بيحتاج
// Next.js request scope حقيقي مش متاح في اختبار standalone)
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request,
) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  // *** باج كان موجود: مفيش أي حد لعدد محاولات تسجيل الدخول — بوت يقدر
  // يجرب آلاف الباسوردات على حساب واحد (credential stuffing) أو يمسح
  // إيميلات كتير من نفس الـ IP، من غير ما حاجة توقفه. فحصين مستقلين:
  //  - بالـ IP بس: يوقف مسح إيميلات كتير من نفس المصدر
  //  - بالـ IP + الإيميل مع بعض: يوقف تركيز المحاولات على حساب واحد
  //    بالذات، حتى لو الـ IP لسه تحت حد الفحص الأول
  const ip = getClientIp(request);
  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20, 10 * 60 * 1000),
    rateLimit(`login:ip:${ip}:email:${parsed.data.email}`, 5, 10 * 60 * 1000),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    throw new TooManyAttemptsError();
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  // مفيش يوزر، أو يوزر داخل بجوجل بس (مالوش password خالص)، أو
  // يوزر اتلغى (Phase 0 anonymization) — في كل الحالات دي نرفض
  if (!user || !user.password || user.deletedAt) return null;

  const valid = await bcrypt.compare(parsed.data.password, user.password);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // session (strategy + maxAge) جاية من ...authConfig فوق — عرّفناها
  // هناك عمدًا عشان middleware (Edge) ياخد نفس الإعداد بالظبط. كتابتها
  // هنا تاني كانت هتبقى نسخة ثانية تقدر تتنسى لما حد يغيّر القيمة في
  // auth.config.ts بعدين (بالظبط نوع الباج اللي ده كان بيحله في الأول).
  providers: [
    // *** باج كان موجود: حد سجّل بباسورد الأول، وبعدين حاول يدخل بجوجل
    // بنفس الإيميل، كان بياخد خطأ OAuthAccountNotLinked من غير أي طريقة
    // يربط بيها الحسابين. allowDangerousEmailAccountLinking هي الآلية
    // الرسمية الموثّقة من Auth.js لنفس السيناريو ده بالذات — "خطير" بس
    // لمزوّدين مش بيتحققوا من ملكية الإيميل؛ جوجل بيتحقق من الإيميل قبل
    // أي OAuth تسجيل دخول، فربط الحسابات بالإيميل هنا آمن.
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  // Node.js-only JWT callback: validate the current database row whenever
  // auth() is called (pages, route handlers, and Auth.js session endpoint).
  // Edge auth.config.ts remains Prisma-free. It is only the first gate.
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, trigger, session }) {
      const id = user?.id ?? token.id;
      if (typeof id !== "string" || !id) return null;
      const dbUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, sessionVersion: true, deletedAt: true },
      });
      if (!dbUser || dbUser.deletedAt) return null;

      if (user) {
        // New sign-in resets the revocation snapshot; token.refresh and
        // session.update NEVER get to refresh it on behalf of the browser.
        token.id = dbUser.id;
        token.sessionVersion = dbUser.sessionVersion;
        token.authenticatedAt = Date.now();
        token.authProvider = account?.provider ?? null;
      } else if (!sessionVersionMatches(token.sessionVersion, dbUser.sessionVersion)) {
        // Legacy tokens without a sessionVersion intentionally require login.
        return null;
      }

      // Live role: a demotion is enforced even if a token is still cryptographically valid.
      token.role = dbUser.role;

      if (trigger === "update" && session) {
        if (typeof session.name === "string") token.name = session.name;
        if (typeof session.image === "string") token.picture = session.image;
      }
      return token;
    },
  },
  events: {
    // createUser بيتفعّل بس لما الـ adapter هو اللي بيعمل اليوزر — يعني
    // تسجيل بجوجل (التسجيل بباسورد بيعمل اليوزر مباشرة في route بتاعنا،
    // مش عن طريق الـ adapter، فمش بيلمس الحدث ده خالص). فأي يوزر وصل
    // هنا جه من Google، اللي أصلًا بيتحقق من ملكية الإيميل قبل أي OAuth.
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
});

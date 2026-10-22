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
import { mayUseSession } from "@/lib/session-policy";
import { hasAuthSessionCookie, mayLinkGoogleEmail } from "@/lib/google-link-policy";
import { cookies } from "next/headers";

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
    // Existing credentials accounts require authenticated, verified linking.
    // Matching email alone must never preserve an attacker's password/session.
    Google({ allowDangerousEmailAccountLinking: false }),
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
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      if (!mayLinkGoogleEmail(profile, null)) return false;
      const hasSession = hasAuthSessionCookie((await cookies()).getAll());
      const current = await auth();
      // Auth.js links using the raw JWT's sub without our sessionVersion
      // callback. A revoked cookie must never become a new linking session.
      if (!current?.user) return mayLinkGoogleEmail(profile, null, hasSession);
      // Linking is allowed only from a verified local session for the same
      // mailbox. Unsigned-in matching accounts require password recovery first.
      const local = await prisma.user.findUnique({ where: { id: current.user.id }, select: { email: true, emailVerified: true } });
      return !!local && mayLinkGoogleEmail(profile, local, hasSession);
    },
    async jwt({ token, user, account, trigger, session }) {
      const id = user?.id ?? token.id;
      if (typeof id !== "string" || !id) return null;
      const dbUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, sessionVersion: true, deletedAt: true },
      });
      if (!mayUseSession(dbUser, token.sessionVersion, !!user)) return null;
      if (!dbUser) return null;

      if (user) {
        // New sign-in resets the revocation snapshot; token.refresh and
        // session.update NEVER get to refresh it on behalf of the browser.
        token.id = dbUser.id;
        token.sessionVersion = dbUser.sessionVersion;
        token.authenticatedAt = Date.now();
        token.authProvider = account?.provider ?? null;
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

import "dotenv/config";
import { availablePaymentMethods } from "../lib/payment-configuration";

const configured = (name: string) => !!process.env[name]?.trim();
const status = {
  database: configured("DATABASE_URL"), directMigrations: configured("DATABASE_URL_UNPOOLED"),
  authentication: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
  origin: configured("APP_URL"), scheduler: configured("CRON_SECRET"),
  payments: availablePaymentMethods(),
  email: configured("RESEND_API_KEY") && configured("RESEND_FROM_EMAIL"),
  refundInquiry: configured("PAYMOB_API_KEY"),
  uploads: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].every(configured),
  shipping: configured("BOSTA_API_KEY") && configured("BOSTA_WEBHOOK_SECRET"),
};
console.log(JSON.stringify(status, null, 2));
if (!status.database || !status.authentication || !status.origin) process.exitCode = 1;

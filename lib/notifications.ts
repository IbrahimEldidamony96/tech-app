import type { Prisma, NotificationType } from "@/app/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function createNotification(
  tx: Tx,
  input: {
    userId?: string | null;
    type?: NotificationType;
    title: string;
    message: string;
    link?: string | null;
  },
) {
  if (!input.userId) return null;
  return tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type ?? "SYSTEM",
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    },
  });
}

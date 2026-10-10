import type { Prisma } from "@/app/generated/prisma/client";

type AuditClient = Prisma.TransactionClient;

export async function writeAuditLog(
  tx: AuditClient,
  input: {
    actorId?: string | null;
    action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "LOGIN" | "STATUS_CHANGE";
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.auditLog.create({ data: input });
}

// CLAUDE.md §10: "Every destructive action writes an AuditLog row." Called
// from every mutating server action this team writes — see
// docs/ARCHITECTURE.md §7 for the full action -> (entity, action) table.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(params: {
  userId: string;
  entity: string;
  entityId: string;
  action: string;
  changes: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes,
    },
  });
}

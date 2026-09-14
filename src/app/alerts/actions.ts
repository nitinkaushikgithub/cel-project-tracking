"use server";

// Alert dismissal (CLAUDE.md §6 beacon popup, docs/ARCHITECTURE.md §8).
// Owned by Dev1.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export async function dismissAlert(alertId: string): Promise<void> {
  const user = await requireUser();

  try {
    // @@id([alertId, userId]) on AlertDismissal means a second dismiss by
    // the same user can't create a duplicate row — catch the unique
    // violation as a harmless no-op rather than erroring.
    await prisma.alertDismissal.create({
      data: { alertId, userId: user.id },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return;
    }
    throw err;
  }

  await writeAuditLog({
    userId: user.id,
    entity: "Alert",
    entityId: alertId,
    action: "dismiss",
    changes: {},
  });
}

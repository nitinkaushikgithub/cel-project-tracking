"use server";

// Alert history + beacon popup reads (CLAUDE.md §6, docs/ARCHITECTURE.md
// §8). Owned by Dev1.
//
// Both exports here are called directly from a client component (Dev2's
// `BeaconPopup`, per ARCHITECTURE.md §8), so this module is a real Server
// Actions boundary ("use server"), not a plain server-only helper module.

import type { Alert, Activity, Project } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

export async function listAlertHistory(): Promise<
  (Alert & { activity: Activity & { project: Project } })[]
> {
  await requireUser();
  return prisma.alert.findMany({
    include: { activity: { include: { project: true } } },
    orderBy: { raisedAt: "desc" },
  });
}

export async function listUndismissedAlertsForCurrentUser(): Promise<
  (Alert & { activity: Activity & { project: Project } })[]
> {
  const user = await requireUser();
  return prisma.alert.findMany({
    where: { dismissals: { none: { userId: user.id } } },
    include: { activity: { include: { project: true } } },
    orderBy: { raisedAt: "desc" },
  });
}

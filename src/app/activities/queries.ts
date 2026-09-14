// "use server": called directly from a client component
// (activities/[id]/page.tsx), so this file needs to be a real Server
// Actions boundary to be callable from the browser.
"use server";

import type { Activity, Project } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import type { SafeUser } from "@/app/users/actions";

// Select, don't include, the assignee — never ship passwordHash to a
// client component (added during integration; mirrors
// src/app/users/actions.ts's SAFE_USER_SELECT exactly).
const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  loginName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export async function getActivity(
  activityId: string,
): Promise<(Activity & { project: Project; assignedTo: SafeUser }) | null> {
  await requireUser();
  return prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      project: true,
      assignedTo: { select: SAFE_USER_SELECT },
    },
  });
}

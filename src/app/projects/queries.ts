// "use server": both exports here are called directly from client
// components (Frontend Lead's projects/[id]/activities/new/page.tsx calls
// getProjectWithActivities; Dev2's dashboard/page.tsx calls
// listProjectsForDashboard from a server component, but the former needs
// this file to be a real Server Actions boundary to be callable from the
// browser at all).
"use server";

import type { Activity, Project } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import type { SafeUser } from "@/app/users/actions";

// Read-only — every role can see every project (docs/ARCHITECTURE.md §3
// role matrix: "See all projects: yes" for all three roles). requireUser()
// is still called so these can't be invoked by a logged-out caller even if
// something bypasses the middleware gate.

// Never `include: { manager: true }` / `assignedTo: true` — that pulls the
// full User row, passwordHash included, into a payload a Server Component
// serializes straight into the page. Select only safe fields instead
// (added during integration — mirrors src/app/users/actions.ts's
// SafeUser/SAFE_USER_SELECT so the shape matches exactly).
const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  loginName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

type ActivityWithAssignee = Activity & { assignedTo: SafeUser };

export async function getProjectWithActivities(projectId: string): Promise<
  | (Project & {
      activities: ActivityWithAssignee[];
      manager: SafeUser;
    })
  | null
> {
  await requireUser();
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      activities: {
        orderBy: { startDate: "asc" },
        include: { assignedTo: { select: SAFE_USER_SELECT } },
      },
      manager: { select: SAFE_USER_SELECT },
    },
  });
}

export async function listProjectsForDashboard(): Promise<
  (Project & { activities: Activity[]; manager: SafeUser })[]
> {
  await requireUser();
  return prisma.project.findMany({
    include: {
      activities: true,
      manager: { select: SAFE_USER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Activity, DurationClass, Project } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, ForbiddenError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  createActivitySchema,
  updateActivitySchema,
  updateActivityStatusSchema,
  updateDelayRecordSchema,
} from "@/lib/validation/activity";
// Dev1 owns src/lib/alerts.ts (docs/ARCHITECTURE.md §5) — imported here by
// exact export name, not reimplemented. It may not exist on disk yet at
// the moment this file is written; it will by the time anything runs.
import type { AlertPoint } from "@/lib/alerts";
import { classifyDuration, computeAlertPoints, recomputeAlerts } from "@/lib/alerts";

// --- local ownership helpers (docs/ARCHITECTURE.md §3 role matrix) ---
// Never trust a client-supplied project/activity id without re-confirming
// ownership/assignment against the DB.

function assertCanManageProject(actor: Session["user"], project: Project): void {
  if (actor.role === "ADMIN") return;
  if (actor.role === "PROJECT_MANAGER" && project.managerId === actor.id) return;
  throw new ForbiddenError("Not allowed to manage this project.");
}

// Shared by status updates and the delay record (CLAUDE.md §6 lists the
// delay record screen as "assignee/PM"; admin can do everything per the
// role matrix, so this mirrors the "Update status" row of
// docs/ARCHITECTURE.md §3 exactly).
function assertCanUpdateProgress(
  actor: Session["user"],
  activity: Activity & { project: Project },
): void {
  if (actor.role === "ADMIN") return;
  if (actor.role === "PROJECT_MANAGER" && activity.project.managerId === actor.id) return;
  if (actor.role === "MEMBER" && activity.assignedToId === actor.id) return;
  throw new ForbiddenError("Not allowed to update this activity.");
}

export async function createActivity(
  projectId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN", "PROJECT_MANAGER");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return "Project not found.";
  }
  assertCanManageProject(actor, project);

  const parsed = createActivitySchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    assignedToId: formData.get("assignedToId"),
    target: formData.get("target"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { name, startDate, endDate, assignedToId, target } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(endDate);

  const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!assignee) {
    return "Select a valid assignee.";
  }

  const durationClass = classifyDuration(start, end);

  const activity = await prisma.activity.create({
    data: {
      projectId,
      name,
      startDate: start,
      endDate: end,
      durationClass,
      assignedToId,
      target,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "Activity",
    entityId: activity.id,
    action: "create",
    changes: { name, startDate, endDate, durationClass, assignedToId, target },
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function updateActivity(
  activityId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN", "PROJECT_MANAGER");

  const existing = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { project: true },
  });
  if (!existing) {
    return "Activity not found.";
  }
  assertCanManageProject(actor, existing.project);

  const parsed = updateActivitySchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    assignedToId: formData.get("assignedToId"),
    target: formData.get("target"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { name, startDate, endDate, assignedToId, target } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(endDate);

  const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!assignee) {
    return "Select a valid assignee.";
  }

  const datesChanged =
    existing.startDate.getTime() !== start.getTime() ||
    existing.endDate.getTime() !== end.getTime();

  const durationClass: DurationClass = datesChanged
    ? classifyDuration(start, end)
    : existing.durationClass;

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      name,
      startDate: start,
      endDate: end,
      durationClass,
      assignedToId,
      target,
    },
  });

  // CLAUDE.md §5 "Recomputation": only when dates actually changed — see
  // docs/ARCHITECTURE.md §5.3 for why this only ever touches
  // not-yet-raised (scheduledFor >= today) rows and never raised history.
  if (datesChanged) {
    await recomputeAlerts(activityId);
  }

  await writeAuditLog({
    userId: actor.id,
    entity: "Activity",
    entityId: activityId,
    action: "update",
    changes: { name, startDate, endDate, durationClass, assignedToId, target },
  });

  revalidatePath(`/activities/${activityId}`);
  revalidatePath(`/projects/${existing.projectId}`);
  return undefined;
}

export async function updateActivityStatus(
  activityId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireUser();

  const existing = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { project: true },
  });
  if (!existing) {
    return "Activity not found.";
  }
  assertCanUpdateProgress(actor, existing);

  const parsed = updateActivityStatusSchema.safeParse({
    status: formData.get("status"),
    actual: formData.get("actual") || undefined,
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { status, actual } = parsed.data;

  await prisma.activity.update({
    where: { id: activityId },
    data: { status, actual: actual ?? null },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "Activity",
    entityId: activityId,
    action: "update_status",
    changes: { status, actual: actual ?? null },
  });

  revalidatePath(`/activities/${activityId}`);
  revalidatePath(`/projects/${existing.projectId}`);
  return undefined;
}

export async function updateDelayRecord(
  activityId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireUser();

  const existing = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { project: true },
  });
  if (!existing) {
    return "Activity not found.";
  }
  assertCanUpdateProgress(actor, existing);

  const parsed = updateDelayRecordSchema.safeParse({
    reasonForDelay: formData.get("reasonForDelay") || undefined,
    correctiveAction: formData.get("correctiveAction") || undefined,
    hodSupportRequested: formData.get("hodSupportRequested") === "on",
    hodRemark: formData.get("hodRemark") || undefined,
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { reasonForDelay, correctiveAction, hodSupportRequested, hodRemark } =
    parsed.data;

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      reasonForDelay: reasonForDelay ?? null,
      correctiveAction: correctiveAction ?? null,
      hodSupportRequested,
      hodRemark: hodRemark ?? null,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "Activity",
    entityId: activityId,
    action: "update_delay_record",
    changes: {
      reasonForDelay: reasonForDelay ?? null,
      correctiveAction: correctiveAction ?? null,
      hodSupportRequested,
      hodRemark: hodRemark ?? null,
    },
  });

  revalidatePath(`/activities/${activityId}`);
  return undefined;
}

// Thin wrapper over Dev1's classifyDuration + computeAlertPoints so the
// activity form (a client component) can preview the schedule via a server
// action before saving (CLAUDE.md §6 / docs/ARCHITECTURE.md §5.2).
export async function previewAlertSchedule(
  startDate: string,
  endDate: string,
): Promise<{ durationClass: DurationClass; points: AlertPoint[] }> {
  await requireUser();

  const start = new Date(startDate);
  const end = new Date(endDate);

  const durationClass = classifyDuration(start, end);
  const points = await computeAlertPoints(start, end, durationClass);

  return { durationClass, points };
}

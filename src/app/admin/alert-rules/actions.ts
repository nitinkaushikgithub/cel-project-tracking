"use server";

// Admin alert-rules screen (CLAUDE.md §6, docs/ARCHITECTURE.md §8).
// Owned by Dev1.

import type { AlertRuleSetting } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { updateAlertRuleSettingSchema } from "@/lib/validation/alert-rule";

export async function listAlertRuleSettings(): Promise<AlertRuleSetting[]> {
  await requireRole("ADMIN");
  return prisma.alertRuleSetting.findMany({
    orderBy: [{ durationClass: "asc" }, { rule: "asc" }],
  });
}

export async function updateAlertRuleSetting(
  id: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const user = await requireRole("ADMIN");

  const existing = await prisma.alertRuleSetting.findUnique({ where: { id } });
  if (!existing) {
    return "Alert rule setting not found.";
  }

  const parsed = updateAlertRuleSettingSchema.safeParse({
    enabled: formData.get("enabled") ?? undefined,
    fractionOfDuration: formData.get("fractionOfDuration") ?? undefined,
    offsetDaysBeforeEnd: formData.get("offsetDaysBeforeEnd") ?? undefined,
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  // Only the field relevant to this row's `rule` is meaningful (see
  // prisma/schema.prisma's AlertRuleSetting comment) — ignore whichever of
  // the two the form didn't need to send rather than trusting an unrelated
  // client value.
  const data: {
    enabled: boolean;
    fractionOfDuration?: number;
    offsetDaysBeforeEnd?: number;
  } = { enabled: parsed.data.enabled };

  if (existing.rule === "HALF_TIME" || existing.rule === "THREE_QUARTER") {
    if (parsed.data.fractionOfDuration === undefined) {
      return "Fraction of duration is required for this rule.";
    }
    data.fractionOfDuration = parsed.data.fractionOfDuration;
  } else if (existing.rule === "TWO_DAYS_BEFORE") {
    if (parsed.data.offsetDaysBeforeEnd === undefined) {
      return "Offset (days before end) is required for this rule.";
    }
    data.offsetDaysBeforeEnd = parsed.data.offsetDaysBeforeEnd;
  }

  const updated = await prisma.alertRuleSetting.update({ where: { id }, data });

  await writeAuditLog({
    userId: user.id,
    entity: "AlertRuleSetting",
    entityId: updated.id,
    action: "update",
    changes: { before: existing, after: updated },
  });

  return undefined;
}

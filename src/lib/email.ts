// Email — stub only. Phase 3 (CLAUDE.md build-order step 6) wires this up
// to Nodemailer over CEL's SMTP server with full activity detail in the
// body (hard constraint #2: the link inside the email only works on the
// CEL network, so the body itself must carry everything). Not built yet —
// docs/ARCHITECTURE.md §5.5 / "Not phase 1" list.
//
// Owned by Dev1. Log and return; do not set `Alert.emailSentAt` here — that
// field must only ever be set by real sending, later. Leaving it `null` is
// correct and intentional, not an oversight.

import type { Alert, Activity, Project, User } from "@prisma/client";

export async function sendAlertEmail(
  alert: Alert & {
    activity: Activity & { project: Project; assignedTo: User };
  },
): Promise<void> {
  console.log(
    `[email stub] would send alert email for alert ${alert.id} ` +
      `(rule=${alert.rule}, activity=${alert.activity.name}, ` +
      `project=${alert.activity.project.code}, assignee=${alert.activity.assignedTo.loginName})`,
  );
}

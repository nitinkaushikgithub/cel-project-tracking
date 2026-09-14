// Real email sending — Phase 3 (CLAUDE.md build-order step 6). Nodemailer
// over CEL's own SMTP server (CLAUDE.md §2 — no email service, no
// transactional-email provider). Server-only; never imported from a
// client component.
//
// Recipients (confirmed with the user, 2026-09-15 — not written anywhere
// in CLAUDE.md/the source doc, since Phase 3 wasn't scoped there yet):
// the activity's assignee, the project's manager, and every active admin
// — each included only if they have an email on file (User.email is
// optional; CLAUDE.md never requires one). De-duplicated, so a manager who
// is also an admin doesn't get two copies.
//
// Hard constraint #2: "Alert emails must carry full activity detail in the
// body, because the link inside them only works on the CEL network." The
// body below includes everything the beacon popup shows plus target,
// status, actual, and the delay-record fields when present — not just a
// one-line summary — precisely because the link may be unusable to
// whoever's reading it.
import type { Alert, Activity, Project, User } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

type AlertForEmail = Alert & {
  activity: Activity & { project: Project & { manager: User }; assignedTo: User };
};

const RULE_LABELS: Record<Alert["rule"], string> = {
  HALF_TIME: "Half time reached",
  THREE_QUARTER: "Three-quarter time reached",
  TWO_DAYS_BEFORE: "2 days before end date",
  OVERDUE: "Overdue",
};

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null | undefined;

// Lazily built and cached — SMTP_HOST absent means "not configured yet"
// (e.g. every environment before Phase 3's SMTP credentials exist, or a
// local dev/test run) rather than an error; log and skip sending rather
// than throw, so the alert engine itself never depends on email being set
// up to function (CLAUDE.md's headline requirement is the Alert row, not
// the email — see runHourlyAlertCheck's write-before-send comment).
function getTransport() {
  if (cachedTransport !== undefined) return cachedTransport;

  const host = process.env.SMTP_HOST;
  if (!host) {
    cachedTransport = null;
    return null;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return cachedTransport;
}

async function resolveRecipients(activity: AlertForEmail["activity"]): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, email: { not: null } },
    select: { email: true },
  });

  const emails = new Set<string>();
  if (activity.assignedTo.email) emails.add(activity.assignedTo.email);
  if (activity.project.manager.email) emails.add(activity.project.manager.email);
  for (const admin of admins) {
    if (admin.email) emails.add(admin.email);
  }
  return [...emails];
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildBody(alert: AlertForEmail): { subject: string; text: string } {
  const { activity } = alert;
  const ruleLabel = RULE_LABELS[alert.rule];

  const subject = `[CEL Project Monitoring] ${ruleLabel} — ${activity.name} (${activity.project.code})`;

  const lines = [
    `${ruleLabel} for an activity you're associated with.`,
    "",
    `Project:      ${activity.project.code} — ${activity.project.name}`,
    `Activity:     ${activity.name}`,
    `Assigned to:  ${activity.assignedTo.fullName}`,
    `Manager:      ${activity.project.manager.fullName}`,
    `Start date:   ${formatDate(activity.startDate)}`,
    `End date:     ${formatDate(activity.endDate)}`,
    `Alert point:  ${ruleLabel} (scheduled for ${formatDate(alert.scheduledFor)})`,
    `Status:       ${activity.status}`,
    `Target:       ${activity.target}`,
  ];

  if (activity.actual) lines.push(`Actual:       ${activity.actual}`);
  if (activity.reasonForDelay) lines.push(`Reason for delay:    ${activity.reasonForDelay}`);
  if (activity.correctiveAction) lines.push(`Corrective action:   ${activity.correctiveAction}`);
  if (activity.hodSupportRequested) lines.push(`HOD support requested: yes`);
  if (activity.hodRemark) lines.push(`HOD remark:   ${activity.hodRemark}`);

  // The link only resolves on the CEL network (CLAUDE.md §3.2 / hard
  // constraint #2) — included as a convenience, never a substitute for the
  // detail above. Omitted entirely if the app's base URL isn't configured
  // rather than emitting a broken link.
  const baseUrl = process.env.APP_BASE_URL;
  if (baseUrl) {
    lines.push("", `Open in CEL Project Monitoring (network required): ${baseUrl}/activities/${activity.id}`);
  }

  return { subject, text: lines.join("\n") };
}

export async function sendAlertEmail(alert: AlertForEmail): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.log(`[email] SMTP not configured (SMTP_HOST unset) — skipping send for alert ${alert.id}`);
    return;
  }

  const recipients = await resolveRecipients(alert.activity);
  if (recipients.length === 0) {
    console.log(`[email] no recipients with an email on file for alert ${alert.id} — skipping send`);
    return;
  }

  const { subject, text } = buildBody(alert);

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "cel-project-monitoring@localhost",
    to: recipients.join(", "),
    subject,
    text,
  });

  // Only set once a real send actually succeeded — never faked from a
  // stub. If this update itself fails, the email still went out; that's
  // logged by the caller (runHourlyAlertCheck / raiseAlertIfNew) rather
  // than swallowed here.
  await prisma.alert.update({
    where: { id: alert.id },
    data: { emailSentAt: new Date() },
  });
}

// CLAUDE.md §10: "Seed script should create one admin and the sample P101
// project so the app is demonstrable immediately after install." Also seeds
// the AlertRuleSetting defaults (docs/ARCHITECTURE.md §1 — this is their
// natural home, not a migration).
//
// Relative imports on purpose, not the "@/*" alias: this script runs
// through the Prisma CLI (ts-node/tsx), not through Next's bundler, and
// nothing in this repo currently wires up path-alias resolution for that
// runner (package.json has no "prisma.seed" entry yet — package.json is
// Architect-owned, flagged in the PR report rather than edited here).
import { randomBytes } from "node:crypto";
import { PrismaClient, DurationClass, AlertRule, ProjectType } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { classifyDuration } from "../src/lib/alerts";

const prisma = new PrismaClient();

// No hardcoded password here on purpose — this repo is public, and a
// fixed string in source (however clearly marked "change me") becomes
// public knowledge the moment it's pushed. CLAUDE.md hard constraint #1
// ("an administrator sets passwords directly, no self-service flow")
// still holds: this is that one manual step, just resolved at seed time
// instead of hardcoded. Override with SEED_ADMIN_PASSWORD in .env if you
// want a specific one (e.g. for scripted/CI setups); otherwise a random
// one is generated and printed once, only on first creation.
const SEED_ADMIN_LOGIN_NAME = process.env.SEED_ADMIN_LOGIN_NAME ?? "admin";

async function seedAdminUser() {
  const existing = await prisma.user.findUnique({ where: { loginName: SEED_ADMIN_LOGIN_NAME } });
  if (existing) {
    // Never touch the password of an admin that already exists — this
    // seed runs on every container start (see docker-entrypoint.sh).
    return existing;
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      fullName: "System Administrator",
      loginName: SEED_ADMIN_LOGIN_NAME,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("");
  console.log("=== First-run admin account created ===");
  console.log(`Login name: ${SEED_ADMIN_LOGIN_NAME}`);
  console.log(`Password:   ${password}`);
  console.log("Save this now — it will not be shown again. Change it after first login.");
  console.log("");

  return admin;
}

// docs/ARCHITECTURE.md §1 seed defaults table — must match CLAUDE.md §5
// exactly.
const ALERT_RULE_SETTING_DEFAULTS: Array<{
  durationClass: DurationClass;
  rule: AlertRule;
  enabled: boolean;
  fractionOfDuration?: number;
  offsetDaysBeforeEnd?: number;
}> = [
  { durationClass: "WEEKLY", rule: "TWO_DAYS_BEFORE", enabled: true, offsetDaysBeforeEnd: 2 },
  { durationClass: "FORTNIGHTLY", rule: "HALF_TIME", enabled: true, fractionOfDuration: 0.5 },
  { durationClass: "FORTNIGHTLY", rule: "THREE_QUARTER", enabled: true, fractionOfDuration: 0.75 },
  { durationClass: "FORTNIGHTLY", rule: "TWO_DAYS_BEFORE", enabled: true, offsetDaysBeforeEnd: 2 },
  { durationClass: "MONTHLY", rule: "HALF_TIME", enabled: true, fractionOfDuration: 0.5 },
  { durationClass: "MONTHLY", rule: "THREE_QUARTER", enabled: true, fractionOfDuration: 0.75 },
  { durationClass: "MONTHLY", rule: "TWO_DAYS_BEFORE", enabled: true, offsetDaysBeforeEnd: 2 },
];

async function seedAlertRuleSettings() {
  for (const setting of ALERT_RULE_SETTING_DEFAULTS) {
    await prisma.alertRuleSetting.upsert({
      where: {
        durationClass_rule: {
          durationClass: setting.durationClass,
          rule: setting.rule,
        },
      },
      update: {},
      create: {
        durationClass: setting.durationClass,
        rule: setting.rule,
        enabled: setting.enabled,
        fractionOfDuration: setting.fractionOfDuration ?? null,
        offsetDaysBeforeEnd: setting.offsetDaysBeforeEnd ?? null,
      },
    });
  }
}

async function seedP101Project(managerId: string) {
  const project = await prisma.project.upsert({
    where: { code: "P101" },
    update: {},
    create: {
      code: "P101",
      name: "Sample purchase order project",
      type: ProjectType.PURCHASE_ORDER,
      managerId,
    },
  });

  const activityCount = await prisma.activity.count({
    where: { projectId: project.id },
  });

  if (activityCount === 0) {
    const kickoffStart = new Date("2026-09-10");
    const kickoffEnd = new Date("2026-09-14");

    const approvalStart = new Date("2026-09-01");
    const approvalEnd = new Date("2026-09-25");

    await prisma.activity.createMany({
      data: [
        {
          projectId: project.id,
          name: "Kickoff meeting minutes",
          startDate: kickoffStart,
          endDate: kickoffEnd,
          durationClass: classifyDuration(kickoffStart, kickoffEnd),
          assignedToId: managerId,
          status: "IN_PROGRESS",
          target: "Circulate signed-off kickoff minutes to all stakeholders.",
        },
        {
          projectId: project.id,
          name: "Vendor drawing approval",
          startDate: approvalStart,
          endDate: approvalEnd,
          durationClass: classifyDuration(approvalStart, approvalEnd),
          assignedToId: managerId,
          status: "NOT_STARTED",
          target: "Get vendor general arrangement drawings approved.",
        },
      ],
    });
  }

  return project;
}

async function main() {
  const admin = await seedAdminUser();
  await seedAlertRuleSettings();
  await seedP101Project(admin.id);

  console.log(`Seeded admin user "${SEED_ADMIN_LOGIN_NAME}" and project P101.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

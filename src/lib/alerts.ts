// Alert engine — CLAUDE.md §5 (the core requirement of the whole system) and
// docs/ARCHITECTURE.md §5 (this module's detailed spec) and §6 (RAG rule).
//
// Owned by Dev1. Exact exported names (`classifyDuration`,
// `computeAlertPoints`, `recomputeAlerts`, `runHourlyAlertCheck`) are relied
// on by teammates building against docs/ARCHITECTURE.md §8 concurrently —
// do not rename.

import { Prisma, type AlertRule, type DurationClass } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendAlertEmail } from "@/lib/email";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- date-only helpers -----------------------------------------------------
//
// Activity.startDate/endDate and Alert.scheduledFor are all `@db.Date`
// (date-only columns — CLAUDE.md §10: "Dates as date columns, not
// timestamps"). Prisma returns/accepts these as JS `Date`s at UTC midnight.
// All arithmetic below normalizes to UTC midnight defensively so nothing
// here ever drifts a date by a day depending on server timezone — CLAUDE.md
// hard constraint #3: "The system never changes a date."

function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(toUtcMidnight(date).getTime() + days * MS_PER_DAY);
}

function daysBetweenInclusive(startDate: Date, endDate: Date): number {
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return toUtcMidnight(a).getTime() === toUtcMidnight(b).getTime();
}

// --- 5.1 classification -----------------------------------------------------

export function classifyDuration(startDate: Date, endDate: Date): DurationClass {
  const durationDays = daysBetweenInclusive(startDate, endDate);
  if (durationDays <= 7) return "WEEKLY";
  if (durationDays <= 21) return "FORTNIGHTLY";
  return "MONTHLY";
}

// --- 5.2 alert points --------------------------------------------------------

export type AlertPoint = { rule: AlertRule; date: Date };

export async function computeAlertPoints(
  startDate: Date,
  endDate: Date,
  durationClass: DurationClass,
): Promise<AlertPoint[]> {
  // orderBy is deterministic: Postgres enums order by declaration position
  // in the schema (HALF_TIME, THREE_QUARTER, TWO_DAYS_BEFORE, OVERDUE), so
  // "asc" here always yields HALF_TIME before THREE_QUARTER before
  // TWO_DAYS_BEFORE — chronological for a normal date range, and it fixes
  // which rule "wins" the same-day de-dup below.
  const settings = await prisma.alertRuleSetting.findMany({
    where: { durationClass, enabled: true },
    orderBy: { rule: "asc" },
  });

  const durationDays = daysBetweenInclusive(startDate, endDate);
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);

  const points: AlertPoint[] = [];
  for (const setting of settings) {
    let date: Date;
    if (setting.rule === "HALF_TIME" || setting.rule === "THREE_QUARTER") {
      if (setting.fractionOfDuration == null) continue; // malformed row — skip defensively
      date = addDays(start, Math.floor(setting.fractionOfDuration * durationDays));
    } else if (setting.rule === "TWO_DAYS_BEFORE") {
      if (setting.offsetDaysBeforeEnd == null) continue; // malformed row — skip defensively
      date = addDays(end, -setting.offsetDaysBeforeEnd);
    } else {
      // OVERDUE is never stored as an AlertRuleSetting row (see
      // prisma/schema.prisma and ARCHITECTURE.md §1) — skip defensively if
      // one is ever seen rather than computing a bogus point for it.
      continue;
    }
    points.push({ rule: setting.rule, date });
  }

  // De-dup: "if two computed dates land on the same day, keep one" —
  // CLAUDE.md §5. Keep the first occurrence in the deterministic order
  // above.
  const seenDays = new Set<number>();
  const deduped: AlertPoint[] = [];
  for (const point of points) {
    const key = toUtcMidnight(point.date).getTime();
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    deduped.push(point);
  }
  return deduped;
}

// --- 5.3 recomputation on edit ------------------------------------------------

/**
 * Called at the end of `updateActivity` (Backend Lead's
 * `activities/actions.ts`) whenever an activity's startDate/endDate change.
 *
 * Per CLAUDE.md §5 "Recomputation": "Delete future unraised alerts; never
 * delete alerts already raised." An `Alert` row only ever comes into
 * existence at the moment the hourly job raises it (write-before-send,
 * §5.4) — there is normally no such thing as an "unraised" row sitting in
 * the table. So in the steady state there is nothing with
 * `scheduledFor >= today` to delete: the new schedule from the edited dates
 * simply applies the next time the hourly job runs, computed fresh from the
 * activity's current dates.
 *
 * The one case this guards defensively: a same-day race where the hourly
 * job raises an alert for the *old* schedule in the same hour dates are
 * edited. To keep that from leaving a stale row around, delete any existing
 * `Alert` row for this activity with `scheduledFor >= today`. Rows with
 * `scheduledFor < today` are history that already happened under the old
 * dates and must never be touched — CLAUDE.md hard constraint #3 ("the
 * system never changes a date") applies to alert history too.
 */
export async function recomputeAlerts(activityId: string): Promise<void> {
  const today = todayUtcMidnight();
  await prisma.alert.deleteMany({
    where: { activityId, scheduledFor: { gte: today } },
  });
}

// --- 5.4 the hourly job -------------------------------------------------------

type ActivityWithRelations = Prisma.ActivityGetPayload<{
  include: { project: true; assignedTo: true };
}>;

async function raiseAlertIfNew(
  activity: ActivityWithRelations,
  point: AlertPoint,
): Promise<void> {
  let created: Awaited<ReturnType<typeof prisma.alert.create>>;
  try {
    // Write first. The unique constraint on (activityId, rule,
    // scheduledFor) is what makes this idempotent across restarts/retries
    // — CLAUDE.md §5, ARCHITECTURE.md §5.4. Never call sendAlertEmail
    // before this insert has succeeded.
    created = await prisma.alert.create({
      data: {
        activityId: activity.id,
        rule: point.rule,
        scheduledFor: toUtcMidnight(point.date),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Already raised by an earlier run — idempotent skip, not an error.
      return;
    }
    throw err;
  }

  await sendAlertEmail({ ...created, activity });
}

export async function runHourlyAlertCheck(): Promise<void> {
  const today = todayUtcMidnight();

  const activities = await prisma.activity.findMany({
    where: { status: { not: "COMPLETED" } },
    include: { project: true, assignedTo: true },
  });

  for (const activity of activities) {
    const points = await computeAlertPoints(
      activity.startDate,
      activity.endDate,
      activity.durationClass,
    );

    const todaysPoints = points.filter((point) => isSameUtcDay(point.date, today));

    // OVERDUE is not a computed point — it's a standing status check,
    // evaluated live every run. `scheduledFor` is pinned to `endDate` so
    // the unique constraint still dedupes it across runs (ARCHITECTURE.md
    // §5.4) — it only ever inserts once even though this condition stays
    // true on every subsequent hourly run until the activity is completed.
    const isOverdue = toUtcMidnight(activity.endDate).getTime() < today.getTime();
    if (isOverdue) {
      todaysPoints.push({ rule: "OVERDUE", date: activity.endDate });
    }

    for (const point of todaysPoints) {
      await raiseAlertIfNew(activity, point);
    }
  }
}

// --- 6. RAG rollup (CLAUDE.md §6, ARCHITECTURE.md §6) ------------------------
//
// Grouped here since it's alert/status-adjacent logic, per
// ARCHITECTURE.md §6. Used by `src/app/dashboard/queries.ts`.

export type ProjectRag = "RED" | "AMBER" | "GREEN";

export function computeProjectRag(
  activities: { status: string; endDate: Date }[],
): ProjectRag {
  const today = todayUtcMidnight();
  let amber = false;

  for (const activity of activities) {
    const endDate = toUtcMidnight(activity.endDate);
    const isPastDueAndIncomplete =
      endDate.getTime() < today.getTime() && activity.status !== "COMPLETED";

    if (activity.status === "DELAYED" || isPastDueAndIncomplete) {
      return "RED"; // red beats amber — return immediately
    }

    // "Within 2 days of end_date": an activity not yet completed whose
    // deadline is today, tomorrow, or the day after. A completed activity
    // is never flagged amber just because its original deadline was close
    // — there is nothing left to slip.
    if (activity.status !== "COMPLETED") {
      const daysUntilEnd = Math.round((endDate.getTime() - today.getTime()) / MS_PER_DAY);
      if (daysUntilEnd >= 0 && daysUntilEnd <= 2) {
        amber = true;
      }
    }
  }

  return amber ? "AMBER" : "GREEN";
}

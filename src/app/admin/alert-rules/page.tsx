// Alert rules — CLAUDE.md §6: admin-only screen listing thresholds per
// duration class, each with an on/off toggle and its threshold value
// editable. Server-side access is already enforced by middleware (coarse
// gate on /admin/**) and by updateAlertRuleSetting's own requireRole
// (docs/ARCHITECTURE.md §3/§8) — this page also checks the session itself
// so a non-admin never even sees the form render.

import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import type { AlertRuleSetting } from "@prisma/client";
import { auth } from "@/lib/auth";
import { listAlertRuleSettings, updateAlertRuleSetting } from "@/app/admin/alert-rules/actions";

// Plain string literals, not the Prisma DurationClass type, deliberately —
// DurationClass is a real TS enum in the generated client, and comparing/
// indexing against it from a string is the safe direction; assigning a
// literal directly to it is not, so this stays untyped-to-the-enum on
// purpose and everything below compares row.durationClass to these.
const DURATION_CLASSES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;

const DURATION_CLASS_LABELS: Record<string, string> = {
  WEEKLY: "Weekly (up to 7 days)",
  FORTNIGHTLY: "Fortnightly (8–21 days)",
  MONTHLY: "Monthly (22+ days)",
};

const RULE_LABELS: Record<string, string> = {
  HALF_TIME: "Half time reached",
  THREE_QUARTER: "Three-quarter time reached",
  TWO_DAYS_BEFORE: "2 days before end date",
};

export default async function AlertRulesPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const settings: AlertRuleSetting[] = await listAlertRuleSettings();

  return (
    <main style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Alert rules</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Thresholds that decide when an activity raises an alert (CLAUDE.md §5). Changes apply to alerts
        computed from this point on.
      </p>

      {DURATION_CLASSES.map((durationClass) => {
        const rows = settings.filter((row) => row.durationClass === durationClass);
        if (rows.length === 0) {
          return null;
        }
        return (
          <section key={durationClass} style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>
              {DURATION_CLASS_LABELS[durationClass] ?? durationClass}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((row) => (
                <AlertRuleRow key={row.id} row={row} />
              ))}
            </div>
          </section>
        );
      })}

      <p style={{ marginTop: 32, fontSize: 13, color: "#777" }}>
        <strong>Overdue</strong> alerts are not listed here — they fire automatically whenever an
        activity's end date has passed and its status is not Completed, for every duration class, and
        cannot be turned off (CLAUDE.md §5).
      </p>
    </main>
  );
}

function AlertRuleRow({ row }: { row: AlertRuleSetting }) {
  const isFraction = row.fractionOfDuration !== null;
  const valueFieldName = isFraction ? "fractionOfDuration" : "offsetDaysBeforeEnd";
  const valueDefault = isFraction ? row.fractionOfDuration ?? 0 : row.offsetDaysBeforeEnd ?? 0;

  return (
    <form
      action={updateAlertRuleSetting.bind(null, row.id, undefined)}
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        padding: "10px 14px",
      }}
    >
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" name="enabled" defaultChecked={row.enabled} />
        Enabled
      </label>

      <span style={{ flex: "1 1 180px" }}>{RULE_LABELS[row.rule] ?? row.rule}</span>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#555" }}>
        {isFraction ? "Fraction of duration" : "Days before end"}
        <input
          type="number"
          name={valueFieldName}
          defaultValue={valueDefault}
          step={isFraction ? 0.05 : 1}
          min={0}
          max={isFraction ? 1 : undefined}
          style={{ width: 80, padding: "4px 6px" }}
        />
      </label>

      <button type="submit" style={saveButtonStyle}>
        Save
      </button>
    </form>
  );
}

const saveButtonStyle: CSSProperties = {
  background: "#1d4ed8",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "6px 14px",
  fontSize: 14,
  cursor: "pointer",
};

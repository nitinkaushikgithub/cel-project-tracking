// Alert history — CLAUDE.md §6: "every alert, reachable from a bell icon in
// the header." Every alert ever raised, including already-dismissed ones —
// closing the beacon popup only records a per-user dismissal, it never
// deletes the Alert row (CLAUDE.md §4 note, §5 "Recomputation").

import type { CSSProperties } from "react";
import type { Alert, Activity, Project } from "@prisma/client";
import { listAlertHistory } from "@/app/alerts/queries";

type AlertWithContext = Alert & { activity: Activity & { project: Project } };

const RULE_LABELS: Record<string, string> = {
  HALF_TIME: "Half time reached",
  THREE_QUARTER: "Three-quarter time reached",
  TWO_DAYS_BEFORE: "2 days before end date",
  OVERDUE: "Overdue",
};

export default async function AlertHistoryPage() {
  const alerts: AlertWithContext[] = await listAlertHistory();

  const sorted = [...alerts].sort(
    (a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime(),
  );

  return (
    <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Alert history</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        {sorted.length} alert{sorted.length === 1 ? "" : "s"} raised so far.
      </p>

      {sorted.length === 0 ? (
        <p>No alerts have been raised yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thStyle}>Activity</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Rule</th>
                <th style={thStyle}>Scheduled for</th>
                <th style={thStyle}>Raised</th>
                <th style={thStyle}>Email sent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((alert) => (
                <tr key={alert.id}>
                  <td style={tdStyle}>{alert.activity.name}</td>
                  <td style={tdStyle}>
                    {alert.activity.project.code} — {alert.activity.project.name}
                  </td>
                  <td style={tdStyle}>{RULE_LABELS[alert.rule] ?? alert.rule}</td>
                  <td style={tdStyle}>{formatDate(alert.scheduledFor)}</td>
                  <td style={tdStyle}>{formatDate(alert.raisedAt)}</td>
                  <td style={tdStyle}>{alert.emailSentAt ? formatDate(alert.emailSentAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  padding: "8px 10px",
  fontSize: 13,
  color: "#555",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  padding: "8px 10px",
  fontSize: 14,
};

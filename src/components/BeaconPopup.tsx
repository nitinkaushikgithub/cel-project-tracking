"use client";

// Global beacon popup — CLAUDE.md §6: "appears on any screen when an
// unraised-to-this-user alert exists," shown to *all* users (source doc
// §9 open question 7 — currently "all"), hence mounted once in the root
// layout rather than on any one page. See docs/ARCHITECTURE.md §2 for the
// exact mount-point contract this component must satisfy: named export
// `BeaconPopup`, client component, no props, renders null when there's
// nothing to show.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { Alert, Activity, Project } from "@prisma/client";
import { listUndismissedAlertsForCurrentUser } from "@/app/alerts/queries";
import { dismissAlert } from "@/app/alerts/actions";

type UndismissedAlert = Alert & { activity: Activity & { project: Project } };

// Boring polling interval — no websockets, no SSE (CLAUDE.md §2 stack list
// doesn't include either, and this is an internal LAN app).
const POLL_INTERVAL_MS = 60_000;

const RULE_LABELS: Record<string, string> = {
  HALF_TIME: "Half time reached",
  THREE_QUARTER: "Three-quarter time reached",
  TWO_DAYS_BEFORE: "Due in 2 days",
  OVERDUE: "Overdue",
};

export function BeaconPopup() {
  const [alerts, setAlerts] = useState<UndismissedAlert[]>([]);
  const [dismissing, setDismissing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await listUndismissedAlertsForCurrentUser();
      setAlerts(result);
    } catch {
      // Not logged in yet, or a transient server hiccup — say nothing and
      // let the next 60s poll try again rather than throwing on every page.
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const current = alerts[0];
  if (!current) {
    // Covers both "no alerts" and (under noUncheckedIndexedAccess) keeps
    // TypeScript happy that index 0 exists from here on.
    return null;
  }

  async function handleClose() {
    setDismissing(true);
    try {
      await dismissAlert(current.id);
      await refresh();
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Activity alert">
      <div style={modalStyle}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Activity alert</h2>

        <p style={{ margin: "0 0 4px", fontSize: 16 }}>
          <strong>{current.activity.name}</strong>
        </p>
        <p style={{ margin: "0 0 4px", color: "#555" }}>
          Project: {current.activity.project.name} ({current.activity.project.code})
        </p>
        <p style={{ margin: "0 0 4px", color: "#555" }}>
          {RULE_LABELS[current.rule] ?? current.rule}
        </p>
        <p style={{ margin: "0 0 16px", color: "#555" }}>
          Scheduled for {formatDate(current.scheduledFor)}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/activities/${current.activity.id}`} style={primaryButtonStyle}>
            Update progress
          </Link>
          <button type="button" onClick={handleClose} disabled={dismissing} style={secondaryButtonStyle}>
            {dismissing ? "Closing…" : "Close"}
          </button>
        </div>

        {alerts.length > 1 && (
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#777" }}>
            {alerts.length - 1} more alert{alerts.length - 1 === 1 ? "" : "s"} waiting.
          </p>
        )}
      </div>
    </div>
  );
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 24,
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
};

const primaryButtonStyle: CSSProperties = {
  background: "#1d4ed8",
  color: "#fff",
  padding: "8px 16px",
  borderRadius: 4,
  textDecoration: "none",
  fontSize: 14,
  display: "inline-block",
};

const secondaryButtonStyle: CSSProperties = {
  background: "#e5e7eb",
  color: "#111",
  padding: "8px 16px",
  borderRadius: 4,
  border: "none",
  fontSize: 14,
  cursor: "pointer",
};

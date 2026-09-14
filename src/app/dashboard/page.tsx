// Dashboard — CLAUDE.md §6: "counts, project list with RAG, slipping
// projects in red." This is the first screen after login and the only
// project listing in the app (docs/ARCHITECTURE.md §4 — there is no bare
// /projects index).

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Activity, Project } from "@prisma/client";
import { listProjectsForDashboard } from "@/app/projects/queries";
import { computeProjectRag } from "@/lib/alerts";
import { RagBadge, RAG_COLORS, type RagState } from "@/components/RagBadge";
import type { SafeUser } from "@/app/users/actions";

type ProjectWithActivities = Project & { activities: Activity[]; manager: SafeUser };

const PROJECT_TYPE_LABELS: Record<string, string> = {
  PURCHASE_ORDER: "Purchase order",
  RND: "R&D",
};

export default async function DashboardPage() {
  const projects: ProjectWithActivities[] = await listProjectsForDashboard();

  const rows = projects.map((project) => ({
    project,
    rag: computeProjectRag(project.activities) as RagState,
  }));

  const counts: Record<RagState, number> = { RED: 0, AMBER: 0, GREEN: 0 };
  for (const row of rows) {
    counts[row.rag] += 1;
  }

  return (
    <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
      <p style={{ marginTop: 0, color: "#555" }}>{rows.length} project{rows.length === 1 ? "" : "s"}</p>

      <div style={countsRowStyle}>
        <CountTile label="Red" count={counts.RED} state="RED" />
        <CountTile label="Amber" count={counts.AMBER} state="AMBER" />
        <CountTile label="Green" count={counts.GREEN} state="GREEN" />
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Projects</h2>

      {rows.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(({ project, rag }) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              style={{
                ...projectRowStyle,
                borderLeftColor: RAG_COLORS[rag],
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span>
                  <strong>{project.code}</strong> — {project.name}
                </span>
                <RagBadge state={rag} />
              </div>
              <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                {PROJECT_TYPE_LABELS[project.type] ?? project.type} · Manager: {project.manager.fullName} ·{" "}
                {project.activities.length} activit{project.activities.length === 1 ? "y" : "ies"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function CountTile({ label, count, state }: { label: string; count: number; state: RagState }) {
  return (
    <div style={{ ...countTileStyle, borderColor: RAG_COLORS[state] }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: RAG_COLORS[state] }}>{count}</div>
      <div style={{ fontSize: 13, color: "#555" }}>{label}</div>
    </div>
  );
}

const countsRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const countTileStyle: CSSProperties = {
  flex: "1 1 100px",
  border: "1px solid #e5e7eb",
  borderTopWidth: 4,
  borderRadius: 6,
  padding: "12px 16px",
  textAlign: "center",
  minWidth: 100,
};

const projectRowStyle: CSSProperties = {
  display: "block",
  border: "1px solid #e5e7eb",
  borderLeftWidth: 4,
  borderRadius: 6,
  padding: "12px 16px",
  textDecoration: "none",
  color: "inherit",
};

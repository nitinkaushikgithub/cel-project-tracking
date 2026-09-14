// Small shared RAG (Red/Amber/Green) badge — CLAUDE.md §6 project RAG rule.
// Read-only import target for Frontend Lead's project detail page as well
// as Dev2's own dashboard page, so the same red/amber/green is used
// everywhere in the app (docs/ARCHITECTURE.md §6).

export type RagState = "RED" | "AMBER" | "GREEN";

// Single source of truth for the RAG colours so every screen that needs to
// tint something (not just the badge itself, e.g. a project row's left
// border on the dashboard) uses the exact same red.
export const RAG_COLORS: Record<RagState, string> = {
  RED: "#b91c1c",
  AMBER: "#b45309",
  GREEN: "#15803d",
};

const RAG_BACKGROUNDS: Record<RagState, string> = {
  RED: "#fee2e2",
  AMBER: "#fef3c7",
  GREEN: "#dcfce7",
};

const RAG_LABELS: Record<RagState, string> = {
  RED: "Red",
  AMBER: "Amber",
  GREEN: "Green",
};

export function RagBadge({ state }: { state: RagState }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        background: RAG_BACKGROUNDS[state],
        color: RAG_COLORS[state],
      }}
    >
      {RAG_LABELS[state]}
    </span>
  );
}

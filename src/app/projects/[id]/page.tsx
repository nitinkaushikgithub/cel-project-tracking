import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectWithActivities } from "@/app/projects/queries";
// Dev1's pure RAG function. ARCHITECTURE.md §6 suggests src/lib/alerts.ts as
// "a reasonable home" but leaves the exact file to Dev1's judgement — this
// is our best guess at the agreed location; flagged in the final report.
import { computeProjectRag } from "@/lib/alerts";
// Explicitly allowed by ARCHITECTURE.md §2: "Frontend Lead may import it on
// the project detail page — read-only import, not edited by them."
import { RagBadge } from "@/components/RagBadge";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const project = await getProjectWithActivities(id);
  if (!project) {
    notFound();
  }

  const rag = computeProjectRag(project.activities);

  const canAddActivity =
    session?.user.role === "ADMIN" ||
    (session?.user.role === "PROJECT_MANAGER" && project.managerId === session?.user.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            {project.code} — {project.name}
          </h1>
          <p className="muted">
            {formatProjectType(project.type)} · Manager: {project.manager.fullName}
          </p>
        </div>
        <RagBadge state={rag} />
      </div>

      {canAddActivity ? (
        <div className="form-actions" style={{ marginBottom: "1rem" }}>
          <Link href={`/projects/${project.id}/activities/new`} className="btn btn-primary">
            Add activity
          </Link>
        </div>
      ) : null}

      <section className="card">
        <h2>Activities</h2>

        {project.activities.length === 0 ? (
          <p className="muted">No activities yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Assigned to</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {project.activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>
                      <Link href={`/activities/${activity.id}`}>{activity.name}</Link>
                    </td>
                    <td>{formatDate(activity.startDate)}</td>
                    <td>{formatDate(activity.endDate)}</td>
                    <td>{formatDurationClass(activity.durationClass)}</td>
                    {/* Assumes getProjectWithActivities includes a nested
                        assignedTo relation on each activity — the contracted
                        return type only says `activities: Activity[]`, but
                        getActivity's contract does include assignedTo, and
                        showing a raw id here would be unusable. Flagged in
                        the final report; adjust if Backend Lead's query
                        doesn't include it. */}
                    <td>{activity.assignedTo?.fullName ?? "—"}</td>
                    <td>
                      <span className={statusBadgeClass(activity.status)}>{formatStatus(activity.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function formatProjectType(type: string): string {
  return type === "PURCHASE_ORDER" ? "Purchase order" : "R&D";
}

function formatDurationClass(durationClass: string): string {
  switch (durationClass) {
    case "WEEKLY":
      return "Weekly";
    case "FORTNIGHTLY":
      return "Fortnightly";
    case "MONTHLY":
      return "Monthly";
    default:
      return durationClass;
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "DELAYED":
      return "Delayed";
    default:
      return status;
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "badge badge-not-started";
    case "IN_PROGRESS":
      return "badge badge-in-progress";
    case "COMPLETED":
      return "badge badge-completed";
    case "DELAYED":
      return "badge badge-delayed";
    default:
      return "badge";
  }
}

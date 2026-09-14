"use client";

import { use, useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createActivity, previewAlertSchedule } from "@/app/activities/actions";
import { getProjectWithActivities } from "@/app/projects/queries";
// See the ownership note in src/app/users/page.tsx — listUsers() is assumed.
// Needed here to populate the "assign to" dropdown.
import { listUsers, type SafeUser } from "@/app/users/actions";
import type { Project, DurationClass, AlertRule } from "@prisma/client";

type ProjectSummary = Pick<Project, "id" | "code" | "name" | "managerId">;
type AlertPoint = { rule: AlertRule; date: Date };

export default function NewActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [project, setProject] = useState<ProjectSummary | null | undefined>(undefined);
  const [assignees, setAssignees] = useState<SafeUser[]>([]);

  useEffect(() => {
    getProjectWithActivities(projectId)
      .then((p) => setProject(p))
      .catch(() => setProject(null));
    listUsers()
      .then((users) => setAssignees(users.filter((u) => u.isActive)))
      .catch(() => setAssignees([]));
  }, [projectId]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preview, setPreview] = useState<{ durationClass: DurationClass; points: AlertPoint[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!startDate || !endDate) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      previewAlertSchedule(startDate, endDate)
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch(() => {
          setPreview(null);
          setPreviewError("Could not compute the alert schedule for these dates.");
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [startDate, endDate]);

  const createActivityForProject = createActivity.bind(null, projectId);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await createActivityForProject(prevState, formData);
      if (!result) {
        router.push(`/projects/${projectId}`);
      }
      return result;
    },
    undefined,
  );

  if (status === "loading" || project === undefined) {
    return <p className="muted">Loading…</p>;
  }

  if (project === null) {
    return <p className="form-error">Project not found.</p>;
  }

  const canAdd =
    session?.user.role === "ADMIN" ||
    (session?.user.role === "PROJECT_MANAGER" && project.managerId === session?.user.id);

  if (!canAdd) {
    return <p className="form-error">You are not allowed to add activities to this project.</p>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>New activity — {project.code}</h1>
      </div>

      <section className="card">
        <form action={formAction} className="form">
          <label>
            Activity name
            <input name="name" type="text" required />
          </label>

          <div className="form-row">
            <label>
              Start date
              <input
                name="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              End date
              <input
                name="endDate"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <label>
            Assigned to
            <select name="assignedToId" required defaultValue="">
              <option value="" disabled>
                Select a person…
              </option>
              {assignees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Target
            <textarea name="target" required />
          </label>

          <AlertSchedulePreview preview={preview} error={previewError} />

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Create activity"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AlertSchedulePreview({
  preview,
  error,
}: {
  preview: { durationClass: DurationClass; points: AlertPoint[] } | null;
  error: string | null;
}) {
  if (error) {
    return <p className="form-error">{error}</p>;
  }

  if (!preview) {
    return (
      <div className="alert-preview">
        <h3>Alert schedule</h3>
        <p className="muted">Enter a start and end date to see when alerts will be raised.</p>
      </div>
    );
  }

  return (
    <div className="alert-preview">
      <h3>Alert schedule — {formatDurationClass(preview.durationClass)}</h3>
      {preview.points.length === 0 ? (
        <p className="muted">No alert points for this duration.</p>
      ) : (
        <ul className="alert-point-list">
          {preview.points.map((point, index) => (
            <li key={index}>
              {formatRule(point.rule)} — {new Date(point.date).toLocaleDateString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDurationClass(durationClass: DurationClass): string {
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

function formatRule(rule: AlertRule): string {
  switch (rule) {
    case "HALF_TIME":
      return "Half time";
    case "THREE_QUARTER":
      return "Three-quarter time";
    case "TWO_DAYS_BEFORE":
      return "Two days before end";
    case "OVERDUE":
      return "Overdue";
    default:
      return rule;
  }
}

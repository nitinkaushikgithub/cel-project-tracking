"use client";

// Purely the interactive form (date pickers, live alert-schedule preview,
// submission) — the role/ownership gate and the assignee list are both
// resolved server-side in page.tsx now instead of via useSession() here.
// See src/app/projects/new/NewProjectForm.tsx's comment for why: a real
// bug where the client-side session disagreed with the server-verified
// one for actual logged-in admins.
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { createActivity, previewAlertSchedule } from "@/app/activities/actions";
import type { SafeUser } from "@/app/users/actions";
import type { DurationClass, AlertRule } from "@prisma/client";

type AlertPoint = { rule: AlertRule; date: Date };

export function NewActivityForm({
  projectId,
  assignees,
}: {
  projectId: string;
  assignees: SafeUser[];
}) {
  const router = useRouter();

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

  return (
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

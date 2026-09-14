"use client";

import { use, useEffect, useState, useActionState } from "react";
import { useSession } from "next-auth/react";
// getActivity is a read, not a mutation — following the same actions.ts
// (mutations) / queries.ts (reads) split used in projects/ (getProjectWithActivities
// lives in queries.ts there). ARCHITECTURE.md §8 lists activities' actions.ts
// and queries.ts functions together without saying which file each is in, so
// this placement is inferred, not contracted — flagged in the final report.
import { getActivity } from "../queries";
import { updateActivity, updateActivityStatus, updateDelayRecord } from "../actions";
// See the ownership note in src/app/users/page.tsx — listUsers() is assumed.
// Needed here to populate the "assigned to" dropdown on the edit form.
import { listUsers, type SafeUser } from "@/app/users/actions";
import type { Activity, Project } from "@prisma/client";

type ActivityDetail = Activity & { project: Project; assignedTo: SafeUser };

export default function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session, status } = useSession();

  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const [users, setUsers] = useState<SafeUser[]>([]);

  async function refresh() {
    try {
      const fresh = await getActivity(id);
      setActivity(fresh);
    } catch {
      setActivity(null);
    }
  }

  useEffect(() => {
    refresh();
    listUsers()
      .then((all) => setUsers(all.filter((u) => u.isActive)))
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === "loading" || activity === undefined) {
    return <p className="muted">Loading…</p>;
  }

  if (activity === null) {
    return <p className="form-error">Activity not found.</p>;
  }

  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";
  const ownsProject = user?.role === "PROJECT_MANAGER" && activity.project.managerId === user?.id;
  const isAssignee = user?.id === activity.assignedToId;

  const canEditActivity = isAdmin || ownsProject;
  const canUpdateStatus = isAdmin || ownsProject || isAssignee;
  const canEditDelayRecord = isAdmin || ownsProject || isAssignee;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{activity.name}</h1>
          <p className="muted">
            {activity.project.code} — {activity.project.name}
          </p>
        </div>
        <span className={statusBadgeClass(activity.status)}>{formatStatus(activity.status)}</span>
      </div>

      <section className="card">
        <h2>Details</h2>
        <dl className="detail-list">
          <div>
            <dt>Start date</dt>
            <dd>{formatDate(activity.startDate)}</dd>
          </div>
          <div>
            <dt>End date</dt>
            <dd>{formatDate(activity.endDate)}</dd>
          </div>
          <div>
            <dt>Duration class</dt>
            <dd>{formatDurationClass(activity.durationClass)}</dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{activity.assignedTo.fullName}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{activity.target}</dd>
          </div>
          <div>
            <dt>Actual</dt>
            <dd>{activity.actual ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {canUpdateStatus ? <StatusForm activity={activity} onSaved={refresh} /> : null}

      {canEditDelayRecord ? <DelayRecordForm activity={activity} onSaved={refresh} /> : null}

      {canEditActivity ? <EditActivityForm activity={activity} users={users} onSaved={refresh} /> : null}
    </div>
  );
}

function StatusForm({ activity, onSaved }: { activity: ActivityDetail; onSaved: () => void }) {
  const boundAction = updateActivityStatus.bind(null, activity.id);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await boundAction(prevState, formData);
      if (!result) onSaved();
      return result;
    },
    undefined,
  );

  return (
    <section className="card">
      <h2>Update status</h2>
      <form action={formAction} className="form">
        <div className="form-row">
          <label>
            Status
            <select name="status" defaultValue={activity.status}>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="DELAYED">Delayed</option>
            </select>
          </label>
          <label>
            Actual
            <input name="actual" type="text" defaultValue={activity.actual ?? ""} />
          </label>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save status"}
          </button>
        </div>
      </form>
    </section>
  );
}

function DelayRecordForm({ activity, onSaved }: { activity: ActivityDetail; onSaved: () => void }) {
  const boundAction = updateDelayRecord.bind(null, activity.id);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await boundAction(prevState, formData);
      if (!result) onSaved();
      return result;
    },
    undefined,
  );

  return (
    <section className="card">
      <h2>Delay record</h2>
      <form action={formAction} className="form">
        <label>
          Reason for delay
          <textarea name="reasonForDelay" defaultValue={activity.reasonForDelay ?? ""} />
        </label>

        <label>
          Corrective action
          <textarea name="correctiveAction" defaultValue={activity.correctiveAction ?? ""} />
        </label>

        <label className="checkbox-label">
          <input
            name="hodSupportRequested"
            type="checkbox"
            defaultChecked={activity.hodSupportRequested}
          />
          HOD support requested
        </label>

        <label>
          HOD remark
          <textarea name="hodRemark" defaultValue={activity.hodRemark ?? ""} />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save delay record"}
          </button>
        </div>
      </form>
    </section>
  );
}

function EditActivityForm({
  activity,
  users,
  onSaved,
}: {
  activity: ActivityDetail;
  users: SafeUser[];
  onSaved: () => void;
}) {
  const boundAction = updateActivity.bind(null, activity.id);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await boundAction(prevState, formData);
      if (!result) onSaved();
      return result;
    },
    undefined,
  );

  return (
    <section className="card">
      <h2>Edit activity</h2>
      <form action={formAction} className="form">
        <label>
          Activity name
          <input name="name" type="text" required defaultValue={activity.name} />
        </label>

        <div className="form-row">
          <label>
            Start date
            <input name="startDate" type="date" required defaultValue={toDateInputValue(activity.startDate)} />
          </label>
          <label>
            End date
            <input name="endDate" type="date" required defaultValue={toDateInputValue(activity.endDate)} />
          </label>
        </div>

        <label>
          Assigned to
          <select name="assignedToId" required defaultValue={activity.assignedToId}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Target
          <textarea name="target" required defaultValue={activity.target} />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

function toDateInputValue(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
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

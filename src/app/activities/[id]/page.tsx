// Server Component: role/ownership gates resolved via auth() (reliable),
// activity + assignee list fetched server-side directly. See
// src/app/projects/new/NewProjectForm.tsx's comment for why this used to
// be a client component using useSession() instead, and why that was a
// real bug (reported against two different real logged-in admin accounts).
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActivity } from "../queries";
import { listUsers } from "@/app/users/actions";
import { ActivityDetailView } from "./ActivityDetailView";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const activity = await getActivity(id);
  if (!activity) {
    notFound();
  }

  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";
  const ownsProject = user?.role === "PROJECT_MANAGER" && activity.project.managerId === user?.id;
  const isAssignee = user?.id === activity.assignedToId;

  const canEditActivity = isAdmin || ownsProject;
  const canUpdateStatus = isAdmin || ownsProject || isAssignee;
  const canEditDelayRecord = isAdmin || ownsProject || isAssignee;

  const users = (await listUsers()).filter((u) => u.isActive);

  return (
    <ActivityDetailView
      initialActivity={activity}
      users={users}
      canEditActivity={canEditActivity}
      canUpdateStatus={canUpdateStatus}
      canEditDelayRecord={canEditDelayRecord}
    />
  );
}

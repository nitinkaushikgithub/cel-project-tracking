// Server Component: role/ownership gate resolved via auth() (reliable),
// project + assignee list fetched server-side directly. See
// NewProjectForm.tsx's comment for why this used to be a client component
// using useSession() instead, and why that was a real bug.
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectWithActivities } from "@/app/projects/queries";
import { listUsers } from "@/app/users/actions";
import { NewActivityForm } from "./NewActivityForm";

export default async function NewActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const session = await auth();

  const project = await getProjectWithActivities(projectId);
  if (!project) {
    notFound();
  }

  const canAdd =
    session?.user.role === "ADMIN" ||
    (session?.user.role === "PROJECT_MANAGER" && project.managerId === session?.user.id);

  if (!canAdd) {
    return <p className="form-error">You are not allowed to add activities to this project.</p>;
  }

  const assignees = (await listUsers()).filter((u) => u.isActive);

  return (
    <div>
      <div className="page-header">
        <h1>New activity — {project.code}</h1>
      </div>

      <section className="card">
        <NewActivityForm projectId={project.id} assignees={assignees} />
      </section>
    </div>
  );
}

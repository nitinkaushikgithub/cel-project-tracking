// Server Component: the role gate and the manager list are both resolved
// here via auth() and a direct server-side call to listUsers() — reliable,
// same pattern already working on projects/[id]/page.tsx and
// dashboard/page.tsx. See NewProjectForm.tsx's comment for why this used
// to be a client component using useSession() instead, and why that was
// a real bug, not just a style preference.
import { auth } from "@/lib/auth";
import { listUsers } from "@/app/users/actions";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const session = await auth();
  const role = session?.user.role;
  const canCreate = role === "ADMIN" || role === "PROJECT_MANAGER";

  if (!session?.user || !canCreate) {
    return <p className="form-error">You are not allowed to create projects.</p>;
  }

  const isAdmin = role === "ADMIN";
  const managers = isAdmin
    ? (await listUsers()).filter((u) => u.role === "PROJECT_MANAGER" || u.role === "ADMIN")
    : [];

  return (
    <div>
      <div className="page-header">
        <h1>New project</h1>
      </div>

      <section className="card">
        <NewProjectForm isAdmin={isAdmin} currentUserId={session.user.id} managers={managers} />
      </section>
    </div>
  );
}

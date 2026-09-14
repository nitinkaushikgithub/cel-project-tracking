"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createProject } from "../actions";
// See the ownership note in src/app/users/page.tsx — listUsers() is assumed,
// not part of ARCHITECTURE.md §8's contract. Reused here for the admin's
// "assign a manager" dropdown, since no other query gives us that list.
import { listUsers, type SafeUser } from "@/app/users/actions";

export default function NewProjectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [managers, setManagers] = useState<SafeUser[] | null>(null);

  const isAdmin = session?.user.role === "ADMIN";

  useEffect(() => {
    if (isAdmin) {
      listUsers()
        .then((users) => setManagers(users.filter((u) => u.role === "PROJECT_MANAGER" || u.role === "ADMIN")))
        .catch(() => setManagers([]));
    }
  }, [isAdmin]);

  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await createProject(prevState, formData);
      if (!result) {
        router.push("/dashboard");
      }
      return result;
    },
    undefined,
  );

  if (status === "loading") {
    return <p className="muted">Loading…</p>;
  }

  const canCreate = session?.user.role === "ADMIN" || session?.user.role === "PROJECT_MANAGER";

  if (!canCreate) {
    return <p className="form-error">You are not allowed to create projects.</p>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>New project</h1>
      </div>

      <section className="card">
        <form action={formAction} className="form">
          <div className="form-row">
            <label>
              Project code
              <input name="code" type="text" placeholder="P101" required />
            </label>
            <label>
              Type
              <select name="type" defaultValue="PURCHASE_ORDER">
                <option value="PURCHASE_ORDER">Purchase order</option>
                <option value="RND">R&amp;D</option>
              </select>
            </label>
          </div>

          <label>
            Project name
            <input name="name" type="text" required />
          </label>

          {isAdmin ? (
            <label>
              Manager
              <select name="managerId" required defaultValue="">
                <option value="" disabled>
                  Select a manager…
                </option>
                {(managers ?? []).map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName} ({manager.role === "ADMIN" ? "Admin" : "PM"})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="managerId" defaultValue={session?.user.id} />
          )}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

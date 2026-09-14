"use client";

// Purely the interactive form — auth/role decisions live in page.tsx
// (a Server Component using auth(), which is reliable) rather than here.
// This used to be one client component calling useSession() for the
// admin/PM gate and the manager dropdown's visibility; that produced a
// real bug where the client session and the server session disagreed for
// real logged-in admins (reported against both the seeded admin and a
// separately created admin user). Splitting into a server-verified parent
// + this props-driven client child removes the whole class of bug rather
// than chasing the exact timing/hydration cause.
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../actions";
import type { SafeUser } from "@/app/users/actions";

export function NewProjectForm({
  isAdmin,
  currentUserId,
  managers,
}: {
  isAdmin: boolean;
  currentUserId: string;
  managers: SafeUser[];
}) {
  const router = useRouter();

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

  return (
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
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.fullName} ({manager.role === "ADMIN" ? "Admin" : "PM"})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="managerId" defaultValue={currentUserId} />
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
  );
}

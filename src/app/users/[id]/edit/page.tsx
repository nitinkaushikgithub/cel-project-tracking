"use client";

// Same pattern as ../reset-password/page.tsx: plain client component
// calling getUser/updateUser directly (both real Server Actions, safe to
// call from a client component since they're cookie-based auth via
// requireRole, not useSession() — see src/app/projects/new/NewProjectForm.tsx's
// comment for why useSession() itself is avoided everywhere in this app).
import { use, useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { getUser, updateUser, type SafeUser } from "../../actions";

export default function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [user, setUser] = useState<SafeUser | null | undefined>(undefined);

  useEffect(() => {
    getUser(id)
      .then(setUser)
      .catch(() => setUser(null));
  }, [id]);

  const updateUserForId = updateUser.bind(null, id);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await updateUserForId(prevState, formData);
      if (!result) {
        router.push("/users");
      }
      return result;
    },
    undefined,
  );

  if (user === undefined) {
    return <p className="muted">Loading…</p>;
  }

  if (user === null) {
    return <p className="form-error">User not found.</p>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Edit user</h1>
      </div>

      <section className="card">
        <p className="muted">
          Login name <strong>{user.loginName}</strong> isn&apos;t editable here — it&apos;s the
          login credential itself. Use <em>Reset password</em> on the users list for that.
        </p>

        <form action={formAction} className="form">
          <label>
            Full name
            <input name="fullName" type="text" required defaultValue={user.fullName} />
          </label>

          <label>
            Email
            <input name="email" type="email" defaultValue={user.email ?? ""} />
          </label>

          <label>
            Role
            <select name="role" defaultValue={user.role}>
              <option value="MEMBER">Member</option>
              <option value="PROJECT_MANAGER">Project manager</option>
              <option value="ADMIN">Admin</option>
            </select>
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
    </div>
  );
}

"use client";

// getUser/SafeUser: added to src/app/users/actions.ts during integration —
// see that file's comments.
import { use, useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { getUser, resetPassword, type SafeUser } from "../../actions";

export default function ResetPasswordPage({
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

  const resetPasswordForUser = resetPassword.bind(null, id);
  const [error, formAction, pending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await resetPasswordForUser(prevState, formData);
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
        <h1>Reset password</h1>
      </div>

      <section className="card">
        <p>
          Resetting the password for <strong>{user.fullName}</strong> ({user.loginName}).
        </p>

        <form action={formAction} className="form">
          <label>
            New password
            <input name="password" type="password" required autoComplete="new-password" />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Set new password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

"use client";

// listUsers/SafeUser: added to src/app/users/actions.ts during integration
// (ARCHITECTURE.md §8 didn't contract a users query, but this screen and
// several others need one — see that file's comments).
import { useEffect, useState, useActionState } from "react";
import Link from "next/link";
import { createUser, listUsers, toggleUserActive, type SafeUser } from "./actions";

export default function UsersPage() {
  const [users, setUsers] = useState<SafeUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    try {
      const fresh = await listUsers();
      setUsers(fresh);
      setLoadError(null);
    } catch {
      setLoadError("Could not load users.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [createError, createFormAction, createPending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const result = await createUser(prevState, formData);
      if (!result) {
        await refresh();
      }
      return result;
    },
    undefined,
  );

  async function handleToggleActive(userId: string) {
    await toggleUserActive(userId);
    await refresh();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
      </div>

      <section className="card">
        <h2>Add user</h2>
        <form action={createFormAction} className="form">
          <div className="form-row">
            <label>
              Full name
              <input name="fullName" type="text" required />
            </label>
            <label>
              Login name
              <input name="loginName" type="text" required autoComplete="off" />
            </label>
          </div>

          <div className="form-row">
            <label>
              Email (optional)
              <input name="email" type="email" />
            </label>
            <label>
              Role
              <select name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="PROJECT_MANAGER">Project manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </div>

          <label>
            Password
            <input name="password" type="password" required autoComplete="new-password" />
          </label>

          {createError ? (
            <p className="form-error" role="alert">
              {createError}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={createPending}>
              {createPending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>All users</h2>

        {loadError ? <p className="form-error">{loadError}</p> : null}

        {users === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.fullName}</td>
                    <td>{user.loginName}</td>
                    <td>{formatRole(user.role)}</td>
                    <td>
                      <span className={user.isActive ? "badge badge-completed" : "badge badge-not-started"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="form-actions">
                        <Link href={`/users/${user.id}/reset-password`} className="btn btn-secondary btn-small">
                          Reset password
                        </Link>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => handleToggleActive(user.id)}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatRole(role: SafeUser["role"]): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "PROJECT_MANAGER":
      return "Project manager";
    case "MEMBER":
      return "Member";
    default:
      return role;
  }
}

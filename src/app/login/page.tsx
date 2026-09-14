"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="auth-card card">
      <h1>CEL Project Monitoring</h1>
      <p className="muted">Sign in with the login name and password your administrator gave you.</p>

      <form action={formAction} className="form">
        <label>
          Login name
          <input
            name="loginName"
            type="text"
            required
            autoFocus
            autoComplete="username"
          />
        </label>

        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

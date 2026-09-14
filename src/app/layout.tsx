import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { BeaconPopup } from "@/components/BeaconPopup";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

export const metadata: Metadata = {
  title: "CEL Project Monitoring",
  description: "Internal project activity tracking and alerts for CEL",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          {session?.user ? <Header user={session.user} /> : null}
          <BeaconPopup />
          <main className="page-container">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}

// Session["user"] here already carries the id/role/loginName fields added by
// Backend Lead's module augmentation in src/types/next-auth.d.ts.
type SessionUser = NonNullable<Session["user"]>;

function Header({ user }: { user: SessionUser }) {
  const isAdmin = user.role === "ADMIN";

  return (
    <header className="app-header">
      <Link href="/dashboard" className="brand">
        CEL Project Monitoring
      </Link>

      <nav className="app-nav" aria-label="Primary">
        <Link href="/dashboard">Dashboard</Link>
        {isAdmin ? <Link href="/users">Users</Link> : null}
        {isAdmin ? <Link href="/admin/alert-rules">Alert rules</Link> : null}
      </nav>

      <div className="app-header-right">
        <Link href="/alerts" className="bell-link" aria-label="Alert history">
          <BellIcon />
        </Link>

        <span className="user-chip">
          <strong>{user.name ?? user.loginName}</strong> · {formatRole(user.role)}
        </span>

        <form
          className="logout-form"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit">Log out</button>
        </form>
      </div>
    </header>
  );
}

function formatRole(role: SessionUser["role"]): string {
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

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

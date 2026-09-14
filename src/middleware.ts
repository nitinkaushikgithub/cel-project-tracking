// Coarse, defense-in-depth gate only — NOT the source of truth for
// authorization. Each server action re-checks role/ownership itself via
// src/lib/rbac.ts against the DB (docs/ARCHITECTURE.md §3).
//
// - Redirect to /login if not logged in (except /login and /api/auth/**).
// - Redirect logged-in users away from /login.
// - Redirect non-admins away from /users/** and /admin/**.
//
// Deliberately builds its own NextAuth instance from auth.config.ts alone
// rather than importing `auth` from @/lib/auth: Next.js always runs
// middleware in the Edge runtime (true for this self-hosted Docker
// container too, not just Vercel), and the full auth.ts pulls in Prisma
// Client + bcryptjs — neither Edge-compatible. `next build` surfaced this
// as warnings, not a build failure, which is exactly the kind of thing
// that then breaks at request time; see auth.config.ts's comment.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;
  const isLoginPage = pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  const isAdminOnlyArea =
    pathname.startsWith("/users") || pathname.startsWith("/admin");

  if (isLoggedIn && isAdminOnlyArea && req.auth?.user.role !== Role.ADMIN) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

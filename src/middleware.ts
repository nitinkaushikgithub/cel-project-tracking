// Coarse, defense-in-depth gate only — NOT the source of truth for
// authorization. Each server action re-checks role/ownership itself via
// src/lib/rbac.ts against the DB (docs/ARCHITECTURE.md §3).
//
// - Redirect to /login if not logged in (except /login and /api/auth/**).
// - Redirect logged-in users away from /login.
// - Redirect non-admins away from /users/** and /admin/**.
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";

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

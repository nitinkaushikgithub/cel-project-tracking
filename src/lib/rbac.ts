// Fine-grained, server-side role/ownership checks. Used inside every server
// action — src/middleware.ts only does a coarse, defense-in-depth gate; this
// module is the actual source of truth (docs/ARCHITECTURE.md §3).
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

export class ForbiddenError extends Error {}

export async function requireUser(): Promise<Session["user"]> {
  const session = await auth();
  if (!session?.user) {
    throw new ForbiddenError("Not logged in.");
  }
  return session.user;
}

export async function requireRole(...roles: Role[]): Promise<Session["user"]> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Requires role: ${roles.join(", ")}.`);
  }
  return user;
}

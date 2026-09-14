"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { writeAuditLog } from "@/lib/audit";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation/user";
import { Prisma } from "@prisma/client";

// All admin-only (docs/ARCHITECTURE.md §3 role matrix: only Admin creates
// or resets users).

// User minus passwordHash. Never return a full `User` (Prisma's generated
// type includes the bcrypt hash) to a page or client component — several of
// Frontend Lead's/Dev2's screens need a user list/lookup for manager and
// assignee pickers, which ARCHITECTURE.md §8 didn't contract a query for;
// this is that query, added during integration, deliberately shaped to
// never leak `passwordHash` into a Server Component's rendered payload or a
// client-side fetch.
export type SafeUser = Omit<User, "passwordHash">;

const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  loginName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// Readable by any logged-in user — used for "assign to" / "manager"
// pickers across roles, not just by admins. Returns no sensitive fields.
export async function listUsers(): Promise<SafeUser[]> {
  await requireUser();
  return prisma.user.findMany({
    select: SAFE_USER_SELECT,
    orderBy: { fullName: "asc" },
  });
}

export async function getUser(userId: string): Promise<SafeUser | null> {
  await requireUser();
  return prisma.user.findUnique({
    where: { id: userId },
    select: SAFE_USER_SELECT,
  });
}

export async function createUser(
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN");

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    loginName: formData.get("loginName"),
    email: formData.get("email") || undefined,
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { fullName, loginName, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { loginName } });
  if (existing) {
    return "That login name is already in use.";
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      fullName,
      loginName,
      email: email ?? null,
      passwordHash,
      role,
    },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "User",
    entityId: user.id,
    action: "create",
    changes: { fullName, loginName, email: email ?? null, role },
  });

  revalidatePath("/users");
  return undefined;
}

export async function updateUser(
  userId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN");

  const parsed = updateUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") || undefined,
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return "User not found.";
  }

  const { fullName, email, role } = parsed.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { fullName, email: email ?? null, role },
    });
  } catch (err) {
    // email has a unique constraint (schema note: contact-only, but still
    // unique when set) — a duplicate shows up here as P2002.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "That email address is already in use by another user.";
    }
    throw err;
  }

  await writeAuditLog({
    userId: actor.id,
    entity: "User",
    entityId: userId,
    action: "update",
    changes: { fullName, email: email ?? null, role },
  });

  revalidatePath("/users");
  return undefined;
}

export async function resetPassword(
  userId: string,
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN");

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return "User not found.";
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "User",
    entityId: userId,
    action: "reset_password",
    changes: {},
  });

  revalidatePath("/users");
  return undefined;
}

export async function toggleUserActive(userId: string): Promise<void> {
  const actor = await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "User",
    entityId: userId,
    action: "toggle_active",
    changes: { isActive: updated.isActive },
  });

  revalidatePath("/users");
}

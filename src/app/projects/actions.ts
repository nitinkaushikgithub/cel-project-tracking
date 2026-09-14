"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { createProjectSchema } from "@/lib/validation/project";

export async function createProject(
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const actor = await requireRole("ADMIN", "PROJECT_MANAGER");

  // A PM can only create projects they manage themselves — never trust a
  // client-supplied manager id for a non-admin actor (docs/ARCHITECTURE.md
  // §3: "admin picks any manager; PM creating their own project — default
  // managerId to self").
  const managerId =
    actor.role === "PROJECT_MANAGER" ? actor.id : formData.get("managerId");

  const parsed = createProjectSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
    managerId,
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const { code, name, type } = parsed.data;

  const manager = await prisma.user.findUnique({
    where: { id: parsed.data.managerId },
  });
  if (!manager) {
    return "Select a valid project manager.";
  }

  const existing = await prisma.project.findUnique({ where: { code } });
  if (existing) {
    return "That project code is already in use.";
  }

  const project = await prisma.project.create({
    data: { code, name, type, managerId: parsed.data.managerId },
  });

  await writeAuditLog({
    userId: actor.id,
    entity: "Project",
    entityId: project.id,
    action: "create",
    changes: { code, name, type, managerId: parsed.data.managerId },
  });

  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}`);
}

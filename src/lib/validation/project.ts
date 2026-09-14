import { z } from "zod";
import { ProjectType } from "@prisma/client";

export const createProjectSchema = z.object({
  code: z.string().min(1, "Project code is required.").max(50),
  name: z.string().min(1, "Project name is required.").max(200),
  type: z.nativeEnum(ProjectType),
  managerId: z.string().min(1, "A project manager is required."),
});

import { z } from "zod";
import { Role } from "@prisma/client";

export const createUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required.").max(200),
  loginName: z
    .string()
    .min(1, "Login name is required.")
    .max(50)
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Login name may only contain letters, numbers, dots, dashes and underscores.",
    ),
  // Contact-only field (schema comment on User.email) — never used for
  // authentication. Optional: not every user has one recorded.
  email: z.string().email("Enter a valid email address.").optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.nativeEnum(Role),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// loginName is deliberately not editable here — it's the login credential
// itself; changing it is a bigger, separate decision than this form is
// for. Password changes go through resetPasswordSchema/resetPassword.
export const updateUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required.").max(200),
  email: z.string().email("Enter a valid email address.").optional(),
  role: z.nativeEnum(Role),
});

"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

// Returns an error message to display, or undefined on success — success
// redirects (via signIn's redirectTo), it never returns normally.
export async function loginAction(
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const loginName = formData.get("loginName");
  const password = formData.get("password");

  if (
    typeof loginName !== "string" ||
    loginName.trim() === "" ||
    typeof password !== "string" ||
    password === ""
  ) {
    return "Enter a login name and password.";
  }

  try {
    await signIn("credentials", {
      loginName,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // signIn throws a redirect internally on success — that's not an
    // AuthError and must be allowed to propagate, not swallowed here.
    if (error instanceof AuthError) {
      return "Invalid login name or password.";
    }
    throw error;
  }

  return undefined;
}

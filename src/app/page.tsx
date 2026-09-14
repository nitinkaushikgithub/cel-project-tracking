import { redirect } from "next/navigation";

// The dashboard is the first screen after login (CLAUDE.md §6). Unauthenticated
// visitors never reach this far — middleware redirects them to /login first.
export default function Home() {
  redirect("/dashboard");
}

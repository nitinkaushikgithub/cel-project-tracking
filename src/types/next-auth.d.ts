// Module augmentation so `session.user.role` / `.loginName` are typed
// end-to-end (CLAUDE.md §10: TypeScript strict, no `any`). Shape matches
// docs/ARCHITECTURE.md §3 exactly — do not rename these fields, teammates'
// pages read session.user.role/.loginName directly.
import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    // Base DefaultUser types `id` as optional (string | undefined) since a
    // provider isn't guaranteed to set one; our credentials authorize()
    // always returns a real id, so narrow it to required here.
    id: string;
    role: Role;
    loginName: string;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      loginName: string;
    } & DefaultSession["user"];
  }
}

// Auth.js v5 re-exports JWT from @auth/core/jwt (next-auth/jwt.d.ts is just
// `export * from "@auth/core/jwt"`) — TypeScript module augmentation has to
// target the module where the interface is actually declared, not a
// re-export, or the merge silently fails and callback params type as
// `unknown`. Confirmed against node_modules/@auth/core/jwt.d.ts.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    loginName: string;
  }
}

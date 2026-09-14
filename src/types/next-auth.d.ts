// Module augmentation so `session.user.role` / `.loginName` are typed
// end-to-end (CLAUDE.md §10: TypeScript strict, no `any`). Shape matches
// docs/ARCHITECTURE.md §3 exactly — do not rename these fields, teammates'
// pages read session.user.role/.loginName directly.
import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
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

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    loginName: string;
  }
}

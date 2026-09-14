// Edge-safe half of the Auth.js config — no providers, no Prisma, no
// bcryptjs. Split out so src/middleware.ts (which Next.js always runs in
// the Edge runtime, even self-hosted in this Docker container — that's a
// Next.js architecture choice, not tied to Vercel) never pulls in
// Node-only modules. This is Auth.js v5's own documented pattern for a
// credentials provider + middleware: https://authjs.dev/guides/edge-compatibility
//
// The jwt/session callbacks just shape an already-issued token — no DB
// access — so they're identical and shared between this edge instance and
// the full one in src/lib/auth.ts.
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.loginName = user.loginName;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.loginName = token.loginName;
      return session;
    },
  },
};

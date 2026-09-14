// Auth.js v5, credentials provider only, JWT session strategy, NO database
// adapter — CLAUDE.md hard constraint #1 forbids any email-based auth flow
// (no signup, no verification mail, no reset links). An administrator
// creates each user and sets/resets their password directly via
// src/app/users/actions.ts.
//
// Login is loginName + password only (docs/ARCHITECTURE.md §3).
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        loginName: { label: "Login name", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const loginName = credentials?.loginName;
        const password = credentials?.password;

        if (typeof loginName !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { loginName } });
        if (!user || !user.isActive) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          name: user.fullName,
          loginName: user.loginName,
          role: user.role,
        };
      },
    }),
  ],
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
});

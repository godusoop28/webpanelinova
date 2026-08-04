import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { env } from "@/lib/env";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        password: { label: "Contraseña", type: "password" },
      },
      /**
       * Single shared password for the whole panel: there is no per-user
       * identity, so every successful login is treated as ADMIN.
       */
      authorize(credentials) {
        if (
          typeof credentials?.password === "string" &&
          credentials.password.length > 0 &&
          credentials.password === env.auth.password
        ) {
          return {
            id: "panel",
            name: "Century 21 Inova",
            email: "panel@c21inova.com",
            role: "ADMIN" as Role,
          };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as { role?: Role }).role = (user as { role?: Role }).role ?? "ADMIN";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = (token as { role?: Role }).role ?? "ADMIN";
      return session;
    },
  },
});

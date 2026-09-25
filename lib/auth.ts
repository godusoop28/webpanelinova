import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyLogin, getUser } from "@/lib/services/user.service";
import type { Role } from "@/lib/permissions";

/** How often a live session re-checks its user row (active + role) in the DB. */
const USER_RECHECK_MS = 60 * 1000;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
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
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string") {
          return null;
        }
        const user = await verifyLogin(credentials.email, credentials.password);
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as Role,
        };
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
      const t = token as typeof token & { role?: Role; checkedAt?: number };
      if (user) {
        t.sub = user.id;
        t.role = (user as { role?: Role }).role;
        t.checkedAt = Date.now();
        return t;
      }
      // The JWT outlives any change made in /usuarios: re-read the user
      // periodically so a deactivated/deleted account loses access and a
      // role change takes effect without waiting for the token to expire.
      if (!t.sub) return null;
      if (Date.now() - (t.checkedAt ?? 0) < USER_RECHECK_MS) return t;
      const dbUser = await getUser(t.sub);
      if (!dbUser || !dbUser.active) return null;
      t.role = dbUser.role as Role;
      t.name = dbUser.name;
      t.email = dbUser.email;
      t.checkedAt = Date.now();
      return t;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = (token as { role?: Role }).role ?? "CONSULTA";
      return session;
    },
  },
});

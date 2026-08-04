import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { findAuthorizedUserByEmail } from "@/lib/google-sheets";
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
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * Gate access at sign-in time: only emails present and active in the
     * "Usuarios" Google Sheet tab may create a session. This runs on the
     * server for every sign-in attempt, so it can't be bypassed from the
     * client.
     */
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const authorizedUser = await findAuthorizedUserByEmail(user.email);
        return Boolean(authorizedUser?.activo);
      } catch (error) {
        console.error("No se pudo validar el usuario contra Google Sheets", error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const authorizedUser = await findAuthorizedUserByEmail(user.email);
        (token as { role?: Role }).role = authorizedUser?.rol ?? "CONSULTA";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = (token as { role?: Role }).role ?? "CONSULTA";
      return session;
    },
  },
});

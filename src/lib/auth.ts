import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validators";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;

        const ok = await verifyPassword(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatarUrl = (user as { avatarUrl?: string | null }).avatarUrl ?? null;
      }
      if (trigger === "update" && session) {
        if (typeof session.name === "string") token.name = session.name;
        if (typeof session.email === "string") token.email = session.email;
        if (session.avatarUrl !== undefined) token.avatarUrl = session.avatarUrl;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.email = (token.email as string) ?? session.user.email;
      session.user.name = (token.name as string) ?? session.user.name;
      session.user.avatarUrl = (token.avatarUrl as string | null) ?? null;
      return session;
    },
  },
});

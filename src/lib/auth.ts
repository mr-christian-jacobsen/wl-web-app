import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
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
      isSuperAdmin: boolean;
      themePreference: string | null;
      /**
       * Mirrors `User.taskEmailsOptOut`. Threaded through the JWT
       * session callback so the notification dispatcher can short-
       * circuit the email send without an extra DB query when the
       * dispatch happens inside a request handler. Default false.
       */
      taskEmailsOptOut: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        if (!user.emailVerifiedAt) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isSuperAdmin: user.isSuperAdmin,
          themePreference: user.themePreference,
          taskEmailsOptOut: user.taskEmailsOptOut,
        };
      },
    }),
  ],
});

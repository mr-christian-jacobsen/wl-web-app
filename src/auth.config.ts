import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatarUrl = (user as { avatarUrl?: string | null }).avatarUrl ?? null;
      }
      if (trigger === "update" && session) {
        const s = session as { name?: string; email?: string; avatarUrl?: string | null };
        if (typeof s.name === "string") token.name = s.name;
        if (typeof s.email === "string") token.email = s.email;
        if (s.avatarUrl !== undefined) token.avatarUrl = s.avatarUrl;
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
};

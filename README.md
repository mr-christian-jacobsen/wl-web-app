# wl-web-app

Responsive Node.js + TypeScript web application with email/password authentication.

## Features

- Sign up, log in, log out
- Forgot / reset password (email link, with console fallback when SMTP is not configured)
- Authenticated profile area: update name, email, password, and avatar image
- Mobile-first responsive UI

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS
- Auth.js (NextAuth v5) with Credentials provider
- Prisma ORM (SQLite by default; PostgreSQL optional)
- argon2id password hashing
- Nodemailer for password-reset email (logs to console if SMTP isn't configured)
- Avatars stored as `BLOB` on the user row; cropped + JPEG-encoded client-side via `react-easy-crop` and served from `/api/avatar/[id]`
- Vitest (unit) + Playwright (e2e)

## Quick start (zero config)

```bash
pnpm install
cp .env.example .env
pnpm db:push       # creates prisma/dev.db (SQLite)
pnpm dev
```

App runs on http://localhost:3010. No Docker, no Postgres, no SMTP required.

When you trigger "Forgot password," the reset link is printed to the dev-server console; copy it into your browser to complete the flow.

## Optional: PostgreSQL + Mailpit (production-like)

```bash
docker compose up -d                                      # postgres + mailpit
# in .env, set:
#   DATABASE_URL="postgresql://wl:wl@localhost:5432/wl?schema=public"
#   SMTP_HOST="localhost"
#   SMTP_PORT="1025"
# then in prisma/schema.prisma, change provider to "postgresql"
pnpm db:push
pnpm dev
```

Mailpit web UI on http://localhost:8025 catches all outgoing email.

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `pnpm dev`        | Start Next.js dev server         |
| `pnpm build`      | Production build                 |
| `pnpm start`      | Start production build           |
| `pnpm typecheck`  | `tsc --noEmit`                   |
| `pnpm lint`       | ESLint                           |
| `pnpm test`       | Vitest unit tests                |
| `pnpm test:e2e`   | Playwright e2e tests             |
| `pnpm db:push`    | Sync Prisma schema to DB         |
| `pnpm db:studio`  | Open Prisma Studio (DB browser)  |

## Project layout

See `src/app` for routes and API handlers, `src/lib` for the auth/db/email/upload modules, and `prisma/schema.prisma` for the data model.

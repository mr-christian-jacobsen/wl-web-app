# wl-web-app

Responsive Node.js + TypeScript web application with email/password authentication.

## Features

- Sign up, log in, log out
- Forgot / reset password (email link)
- Authenticated profile area: update name, email, password, and avatar image
- Mobile-first responsive UI

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS
- Auth.js (NextAuth v5) with Credentials provider
- Prisma ORM + PostgreSQL
- argon2 password hashing
- Nodemailer + Mailpit (dev) for password-reset email
- Local filesystem avatar storage (`/public/uploads`) — swappable adapter
- Vitest (unit) + Playwright (e2e)

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose up -d        # postgres + mailpit
pnpm prisma migrate dev
pnpm dev
```

App runs on http://localhost:3000. Mailpit UI on http://localhost:8025.

## Scripts

| Command            | Description                       |
| ------------------ | --------------------------------- |
| `pnpm dev`         | Start Next.js dev server          |
| `pnpm build`       | Production build                  |
| `pnpm start`       | Start production build            |
| `pnpm typecheck`   | `tsc --noEmit`                    |
| `pnpm lint`        | ESLint                            |
| `pnpm test`        | Vitest unit tests                 |
| `pnpm test:e2e`    | Playwright e2e tests              |
| `pnpm prisma`      | Prisma CLI                        |

## Project layout

See `src/app` for routes and API handlers, `src/lib` for the auth/db/email/upload modules, and `prisma/schema.prisma` for the data model.

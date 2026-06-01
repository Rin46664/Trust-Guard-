# Trust Guard

A production-ready Discord verification bot with risk-based 6-tier account assessment, a React web dashboard, slash commands, and PostgreSQL storage.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard UI (port 23183, preview at `/dashboard/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: discord.js v14
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Canvas: @napi-rs/canvas (native, must be external in esbuild)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Dashboard: React + Vite, Tailwind, Recharts, wouter, @tanstack/react-query

## Where things live

- `artifacts/api-server/src/bot/` — Discord bot (commands, events, lib)
  - `lib/riskScoring.ts` — 6-tier risk engine (account age + signals)
  - `lib/captcha.ts` — math/word/logic captcha generator
  - `lib/questionnaire.ts` — adaptive questionnaire logic
  - `lib/rateLimiter.ts` — in-memory rate limiter (Map)
  - `lib/verificationCard.ts` — PNG verification card generator
  - `lib/verification.ts` — session store, modals, embeds, role assignment
  - `lib/db.ts` — all DB operations
  - `events/interactionCreate.ts` — full interaction handler
  - `commands/` — ping, setup, review, stats
- `artifacts/api-server/src/routes/dashboard.ts` — REST API for dashboard
- `artifacts/dashboard/src/` — React dashboard frontend
  - `pages/dashboard.tsx` — Overview + stats + risk chart
  - `pages/users.tsx` — User list with search/filter
  - `pages/user-detail.tsx` — Per-user verification history
  - `pages/reviews.tsx` — Staff review queue with approve/deny
  - `pages/logs.tsx` — Audit event log
- `lib/db/src/schema/` — Drizzle schema (guildConfig, verifiedUsers, verificationAttempts, verificationLogs, staffReviews)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)

## Architecture decisions

- **No Redis** — rate limiting is in-memory via Map (restarts clear it)
- **@napi-rs/canvas** is marked external in esbuild (`build.mjs`) — it uses native `.node` binaries that can't be bundled
- **Modal-to-modal is not supported in Discord** — multi-step verification uses Button → Modal → ephemeral reply with Button → Modal pattern
- **DISCORD_CLIENT_ID** env may contain trailing `||` characters — strip with `.replace(/[^0-9]/g, "")` in deploy-commands
- **Slash command deploy** requires bot invited with `applications.commands` scope — invite URL: `https://discord.com/api/oauth2/authorize?client_id=1511007052619841536&permissions=8&scope=bot%20applications.commands`

## Product

- Users who join the Discord server are assessed by a 6-tier risk engine based on account age, avatar, banner, username patterns
- Tier 1: instant verified; Tier 2: captcha; Tier 3: captcha + questionnaire; Tier 4: full flow; Tier 5-6: full flow + manual staff review
- Staff can approve/deny pending reviews via `/review` slash command or the web dashboard
- Verification cards (PNG) are generated and posted to log/welcome channels
- Dashboard at `/dashboard/` shows real-time stats, user records, review queue, and audit logs

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always mark `@napi-rs/canvas` and `@napi-rs/canvas-linux-x64-gnu` as external in esbuild
- Discord modals cannot be shown from a ModalSubmitInteraction — use button intermediary
- `pnpm --filter @workspace/db run push` must be run after schema changes
- Slash commands need `applications.commands` OAuth scope (not just `bot` scope)
- `DISCORD_CLIENT_ID` secret may have trailing `||` — sanitize in code

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

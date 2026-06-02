# Trust Guard

A production-ready Discord verification bot with risk-based 6-tier account assessment, a React web dashboard, 30+ slash commands, and PostgreSQL storage.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 8080)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard UI (port 23183, preview at `/dashboard/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild composite libs (run after schema changes before typecheck)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only), then run `pnpm run typecheck:libs`
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

## Slash Commands (30+)

### `/ping` — Bot latency check
### `/dev` — Developer testing tools (Admin only)
- `ping` — latency, uptime, DB response time
- `verify-test [user]` — live risk assessment (read-only)
- `simulate-tier [user] [tier]` — show what tier X flow looks like
- `risk-check [user]` — full risk factor breakdown
- `reset [user]` — clear verification state back to pending
- `force-verify [user]` — instantly grant verified role
- `force-deny [user]` — revoke verification and role
- `session [user]` — inspect active in-memory session
- `test-captcha [tier]` — generate test captcha with answer shown
- `test-card [tier]` — generate test verification card image
- `clear-sessions` — wipe all in-memory sessions
- `db-stats` — live DB row counts for all tables

### `/config` — Server configuration (Admin only)
- `verify-channel [channel]` — set verification channel + post button
- `log-channel [channel]` — set activity logs channel
- `error-channel [channel]` — set error reports channel
- `scripts-channel [channel]` — set command execution log channel
- `welcome-channel [channel]` — set verification card channel
- `bot-channel [channel]` — restrict commands to one channel
- `verified-role [role]` — set role granted after verification
- `staff-role [role]` — set role for staff commands
- `toggle [true/false]` — enable/disable Trust Guard
- `status` — show full config panel
- `reset` — clear all settings

### `/review` — Staff review queue (Manage Guild)
- `list` — show pending reviews
- `approve [id] [notes]` — approve a review
- `deny [id] [notes]` — deny a review

### `/stats` — Verification statistics (Manage Guild)
### `/logs [limit] [user] [type]` — Recent verification events (Manage Guild)
### `/userinfo [user]` — User verification details (Manage Guild)

## Channel Logging

Three dedicated Discord channels receive automatic logs:
- **#logs** (`log-channel`) — all events: joins, verifications, reviews, captcha results, config changes
- **#error-logs** (`error-channel`) — all errors: failed role assignments, card generation failures, command errors
- **#scripts-and-codes** (`scripts-channel`) — all slash commands executed: who ran what, when

## Where things live

- `artifacts/api-server/src/bot/` — Discord bot (commands, events, lib)
  - `commands/` — ping, config, dev, review, stats, logs, userinfo
  - `lib/channelLogger.ts` — centralized 3-channel Discord logger
  - `lib/riskScoring.ts` — 6-tier risk engine (account age + signals)
  - `lib/captcha.ts` — math/word/logic captcha generator
  - `lib/questionnaire.ts` — adaptive questionnaire logic
  - `lib/rateLimiter.ts` — in-memory rate limiter (Map)
  - `lib/verificationCard.ts` — PNG verification card generator
  - `lib/verification.ts` — session store, modals, embeds, role assignment
  - `lib/db.ts` — all DB operations
  - `events/interactionCreate.ts` — full interaction handler
  - `events/guildMemberAdd.ts` — join handler with channel logging
- `artifacts/api-server/src/routes/dashboard.ts` — REST API for dashboard
- `artifacts/dashboard/src/` — React dashboard frontend
- `lib/db/src/schema/` — Drizzle schema (guildConfig, verifiedUsers, verificationAttempts, verificationLogs, staffReviews)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)

## Architecture decisions

- **No Redis** — rate limiting is in-memory via Map (restarts clear it)
- **@napi-rs/canvas** is marked external in esbuild (`build.mjs`)
- **Modal-to-modal is not supported in Discord** — multi-step uses Button → Modal pattern
- **DISCORD_CLIENT_ID** env may contain trailing `||` — strip with `.replace(/[^0-9]/g, "")`
- **Slash command deploy** requires bot invited with `applications.commands` scope
  - Invite URL: `https://discord.com/api/oauth2/authorize?client_id=1511007052619841536&permissions=8&scope=bot%20applications.commands`
- **After schema changes**: run `pnpm --filter @workspace/db run push`, then `pnpm run typecheck:libs`, then restart server

## Railway Deployment Environment Variables

Set these in Railway → Service → Variables:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Railway Postgres plugin auto-injects this |
| `DISCORD_TOKEN` | `your-bot-token` | From Discord Developer Portal |
| `DISCORD_CLIENT_ID` | `1511007052619841536` | Bot application ID |
| `DISCORD_GUILD_ID` | `1510443249439998034` | Your server ID |
| `SESSION_SECRET` | `random-32-char-string` | Any secure random string |
| `NODE_ENV` | `production` | |
| `PORT` | _(leave unset)_ | Railway injects automatically |

Start command for Railway: `node --enable-source-maps ./dist/index.mjs`
Build command: `pnpm --filter @workspace/api-server run build`

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
- `pnpm --filter @workspace/db run push` must be run after schema changes, then `pnpm run typecheck:libs`
- Slash commands need `applications.commands` OAuth scope (not just `bot` scope)
- `DISCORD_CLIENT_ID` secret may have trailing `||` — sanitize in code
- `DISCORD_GUILD_ID` must be set as a shared env var (not a secret) for command deploy

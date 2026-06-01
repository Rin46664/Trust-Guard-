---
name: Trust Guard architecture quirks
description: Non-obvious constraints for the Trust Guard Discord bot + dashboard project
---

## @napi-rs/canvas must be external in esbuild

**Rule:** Add both `"@napi-rs/canvas"` and `"@napi-rs/canvas-linux-x64-gnu"` to esbuild's `external` array in `build.mjs`. The `"*.node"` glob alone is not enough — esbuild follows the package import chain and errors on the platform-specific `.node` binary.

**Why:** `@napi-rs/canvas` ships platform-specific native binaries. esbuild cannot bundle them even with the `*.node` glob because it follows the JS import chain into the package first.

**How to apply:** Any time @napi-rs/canvas is in dependencies, ensure both package names are in the external list in `artifacts/api-server/build.mjs`.

---

## Discord modals cannot respond with another modal

**Rule:** Never call `interaction.showModal()` from inside a `ModalSubmitInteraction` handler. Use button intermediaries between modal steps.

**Why:** Discord's API only allows modals to be shown from button/command interactions, not from modal submit interactions. Trying to do so causes a TS error and a Discord API error at runtime.

**How to apply:** For multi-step verification (captcha → questionnaire → challenge), each modal submit sends an ephemeral reply with a "Continue" button, and the next modal is shown when that button is clicked. Custom IDs used: `tg_continue_questionnaire`, `tg_continue_challenge`.

---

## DISCORD_CLIENT_ID secret has trailing ||

**Rule:** Always sanitize `DISCORD_CLIENT_ID` with `.replace(/[^0-9]/g, "")` before use in `deploy-commands.ts`.

**Why:** The secret was entered with a trailing `||` (shell syntax artifact). Rather than force the user to re-enter it, strip all non-numeric characters in code.

---

## Slash command deploy needs applications.commands OAuth scope

**Rule:** Bot must be invited with both `bot` and `applications.commands` scopes. Missing the second scope causes error 50001 (Missing Access) on the guild commands PUT endpoint.

**How to apply:** Invite URL: `https://discord.com/api/oauth2/authorize?client_id=1511007052619841536&permissions=8&scope=bot%20applications.commands`

---

## DISCORD_GUILD_ID is set as a shared env var (not a secret)

Value: `1510443249439998034`. Set via `setEnvVars({ values: { DISCORD_GUILD_ID: "..." } })`.

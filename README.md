# Planka MCP Server (multi-user, remote-hosted)

Forked from [bradrisse/kanban-mcp](https://github.com/bradrisse/kanban-mcp) and adapted for:
- **Streamable HTTP transport** (so it can be hosted remotely, e.g. Cloud Run) instead of stdio (local-only)
- **Per-user authentication** — every caller uses their own Planka account and permissions, instead of one shared service account

## How auth works

This server holds **no Planka credentials of its own**. Each person who wants to use it:

1. Generates their own long-lived Planka access token once, by POSTing their email/password to their Planka instance:
   ```bash
   curl -X POST https://planka.blappsdev.com/api/access-tokens \
     -H "Content-Type: application/json" \
     -d '{"emailOrUsername": "your@email.com", "password": "your-password"}'
   ```
   The response's `item` field is the token — a long JWT string. This is the only time your password is used; the token is what gets used from here on.

2. Uses that token as a **Bearer token** when connecting this MCP server in Claude — every tool call gets forwarded to Planka using that specific token, so **Planka's own permission system decides what each person can and can't do.** Full control for an admin, restricted access for a regular member — the MCP server itself has no separate notion of roles.

## Gamification support

This server targets a Planka fork with an XP/level/badge system built on top of card completion (see that repo's README for the full feature). A few things to know when using it:

- Every card carries a `baseXp` value. `planka_create` (resourceType `card` or `card_with_tasks`) defaults it to `10` if you don't pass one — Planka requires every card to have a value, so this keeps card creation simple when XP isn't the point of the call.
- Cards can also carry an optional `softDueDate` — completing the card on or before it grants bonus XP; missing it costs nothing. Editable via `planka_update` (pass `null` to clear it) and settable at creation.
- `planka_get` with `resourceType: "gamification_stats"` and `id: "me"` (or a specific user ID) returns that user's XP, level, progress to the next level, completion/on-time counts, and the full badge catalog annotated with which ones are unlocked and when.
- Every card object returned by `planka_get`/`planka_create`/`planka_update` (including inside `board_summary` and `card_details`) carries `baseXp`, `softDueDate`, and `bonusAwarded` alongside its normal fields.

## Environment variables (Cloud Run)

- `PLANKA_BASE_URL` — your Planka instance URL, e.g. `https://planka.blappsdev.com`
- `PORT` — set automatically by Cloud Run, no action needed

## Local test

```bash
npm install
npm run build
PORT=8080 PLANKA_BASE_URL=https://planka.blappsdev.com node dist/index.js
```

## Deploy to Cloud Run

See deployment instructions provided separately.

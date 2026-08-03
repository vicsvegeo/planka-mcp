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

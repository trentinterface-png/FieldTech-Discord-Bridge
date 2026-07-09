# FieldTech Discord Bridge v2.1

This bridge has two paths:

1. `POST /security` — direct event receiver.
2. Bloom/Pterodactyl console watcher — connects to the server console websocket and forwards lines that begin with `[FIELDTECH_SECURITY]`.

## Required Northflank env vars

- `BLOOM_PANEL_URL=https://mc.bloom.host`
- `BLOOM_SERVER_ID=575a1549`
- `BLOOM_CLIENT_API_KEY=<your new client API key>`
- `BLOOM_CONSOLE_WATCH=true`

Webhook env vars:

- `WEBHOOK_SERVER`
- `WEBHOOK_ACTIVITY`
- `WEBHOOK_CASES`
- `WEBHOOK_REPORTS`
- `WEBHOOK_CHEST`
- `WEBHOOK_COMBAT`
- `WEBHOOK_PET`
- `WEBHOOK_EXPLOSIVE`
- `WEBHOOK_INTEGRITY`
- `WEBHOOK_CRITICAL`

## Test endpoints

- `/health`
- `/debug`
- `/bloom/test`

## Console line format

The Minecraft add-on should print lines like:

```text
[FIELDTECH_SECURITY] {"channel":"server","title":"Test","message":"Hello from console"}
```

The bridge parses that JSON and routes it to Discord.

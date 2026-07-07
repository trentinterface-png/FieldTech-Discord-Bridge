# FieldTech Discord Bridge

A lightweight Node.js bridge for Minecraft Bedrock security events.

## Endpoints

- `GET /health` - confirms the bridge is online
- `GET /debug` - shows which webhook environment variables are configured
- `POST /security` - receives Minecraft security events and forwards them to Discord

## Environment variables

Set these in Northflank:

```env
PORT=3000
BRIDGE_SECRET=change_this_to_a_long_random_secret
WEBHOOK_CRITICAL=
WEBHOOK_CHEST=
WEBHOOK_COMBAT=
WEBHOOK_PET=
WEBHOOK_EXPLOSIVE=
WEBHOOK_REPORTS=
WEBHOOK_INTEGRITY=
WEBHOOK_SERVER=
WEBHOOK_CASES=
WEBHOOK_ACTIVITY=
WEBHOOK_ORBITAL=
```

## Example request

```json
{
  "secret": "change_this_to_a_long_random_secret",
  "event": "player_activity",
  "player": "TheCrafterRed",
  "description": "Player Login",
  "date": "July 7, 2026",
  "time": "4:30 AM"
}
```

## Event routing

- `critical_alert` -> critical
- `chest_audit` -> chest
- `combat_log` -> combat
- `pet_log` -> pet
- `explosive_log` -> explosive
- `incident_report` -> reports
- `item_integrity` -> integrity
- `server_event` -> server
- `case_file` -> cases
- `player_activity` -> activity
- `orbital_cannon` -> orbital

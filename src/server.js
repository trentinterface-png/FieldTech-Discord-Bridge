const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';

app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(morgan('combined'));

const CHANNELS = {
  critical: process.env.WEBHOOK_CRITICAL,
  chest: process.env.WEBHOOK_CHEST,
  combat: process.env.WEBHOOK_COMBAT,
  pet: process.env.WEBHOOK_PET,
  explosive: process.env.WEBHOOK_EXPLOSIVE,
  reports: process.env.WEBHOOK_REPORTS,
  integrity: process.env.WEBHOOK_INTEGRITY,
  server: process.env.WEBHOOK_SERVER,
  cases: process.env.WEBHOOK_CASES,
  activity: process.env.WEBHOOK_ACTIVITY,
  orbital: process.env.WEBHOOK_ORBITAL || process.env.WEBHOOK_CRITICAL
};

const ROUTE_MAP = {
  critical_alert: 'critical',
  critical: 'critical',
  chest_audit: 'chest',
  chest: 'chest',
  combat_log: 'combat',
  combat: 'combat',
  pet_log: 'pet',
  pet: 'pet',
  explosive_log: 'explosive',
  explosive: 'explosive',
  incident_report: 'reports',
  report: 'reports',
  reports: 'reports',
  item_integrity: 'integrity',
  integrity: 'integrity',
  server_event: 'server',
  server: 'server',
  case_file: 'cases',
  case: 'cases',
  cases: 'cases',
  player_activity: 'activity',
  activity: 'activity',
  orbital_cannon: 'orbital',
  orbital: 'orbital'
};

const COLORS = {
  critical: 0xff0000,
  chest: 0xc68642,
  combat: 0xe74c3c,
  pet: 0x9b59b6,
  explosive: 0xff8c00,
  reports: 0x3498db,
  integrity: 0xf1c40f,
  server: 0x95a5a6,
  cases: 0x2ecc71,
  activity: 0x1abc9c,
  orbital: 0xff0033
};

function titleFor(channel, event) {
  const titles = {
    critical: '🚨 Critical Alert',
    chest: '📦 Chest Audit',
    combat: '⚔️ Combat Log',
    pet: '🐾 Pet Log',
    explosive: '💥 Explosive Log',
    reports: '📖 Incident Report',
    integrity: '💎 Item Integrity',
    server: '🤖 Server Event',
    cases: '📚 Case File',
    activity: '📅 Player Activity',
    orbital: '🚀 Orbital Cannon Alert'
  };
  return titles[channel] || `FieldTech Event: ${event || 'unknown'}`;
}

function cleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'object') return '```json\n' + JSON.stringify(value, null, 2).slice(0, 900) + '\n```';
  return String(value).slice(0, 1000);
}

function buildFields(data = {}) {
  const ignored = new Set(['secret', 'event', 'type', 'channel', 'content', 'title', 'description', 'allowed_mentions']);
  const priority = ['player', 'reporter', 'reported', 'owner', 'victim', 'killer', 'entity', 'item', 'reason', 'location', 'dimension', 'x', 'y', 'z', 'date', 'time', 'sessionLength', 'caseId', 'status'];
  const keys = [...priority.filter(k => k in data), ...Object.keys(data).filter(k => !priority.includes(k))];
  const fields = [];
  for (const key of keys) {
    if (ignored.has(key)) continue;
    const value = cleanValue(data[key]);
    if (!value) continue;
    fields.push({ name: key, value, inline: value.length < 40 });
    if (fields.length >= 20) break;
  }
  return fields;
}

function buildDiscordPayload(channel, event, body) {
  const title = body.title || titleFor(channel, event);
  const description = body.description || body.content || `Event: ${event || 'unknown'}`;
  return {
    content: body.ping === 'everyone' ? '@everyone' : undefined,
    allowed_mentions: body.ping === 'everyone' ? { parse: ['everyone'] } : { parse: [] },
    embeds: [
      {
        title,
        description: String(description).slice(0, 2000),
        color: COLORS[channel] || 0x5865f2,
        fields: buildFields(body),
        timestamp: new Date().toISOString(),
        footer: { text: 'FieldTech Security Bridge' }
      }
    ]
  };
}

function authorize(req, res, next) {
  if (!BRIDGE_SECRET) return next();
  const headerSecret = req.get('x-fieldtech-secret');
  const bodySecret = req.body && req.body.secret;
  if (headerSecret === BRIDGE_SECRET || bodySecret === BRIDGE_SECRET) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized bridge secret' });
}

async function postToDiscord(webhook, payload) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await response.text().catch(() => '');
  return { status: response.status, ok: response.ok || response.status === 204, text };
}

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'FieldTech Discord Bridge', endpoints: ['/health', '/debug', '/security'] });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'online', time: new Date().toISOString() });
});

app.get('/debug', (req, res) => {
  const configured = Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [k, Boolean(v)]));
  res.json({ ok: true, configured, routeMap: ROUTE_MAP });
});

app.post('/security', authorize, async (req, res) => {
  const body = req.body || {};
  const event = body.event || body.type || 'server_event';
  const channel = body.channel || ROUTE_MAP[event] || 'server';
  const webhook = CHANNELS[channel];

  if (!webhook) {
    return res.status(400).json({ ok: false, error: `No webhook configured for channel '${channel}'`, channel, event });
  }

  const payload = buildDiscordPayload(channel, event, body);

  try {
    const result = await postToDiscord(webhook, payload);
    return res.status(result.ok ? 200 : 502).json({ ok: result.ok, channel, event, discordStatus: result.status, discordText: result.text });
  } catch (error) {
    console.error('Discord post failed:', error);
    return res.status(500).json({ ok: false, channel, event, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`FieldTech Discord Bridge listening on port ${PORT}`);
});

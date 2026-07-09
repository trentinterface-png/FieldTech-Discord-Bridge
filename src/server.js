import express from "express";
import WebSocket from "ws";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const MARKER = process.env.FIELDTECH_MARKER || "[FIELDTECH_SECURITY]";

const webhookMap = {
  server: process.env.WEBHOOK_SERVER,
  activity: process.env.WEBHOOK_ACTIVITY,
  cases: process.env.WEBHOOK_CASES,
  reports: process.env.WEBHOOK_REPORTS,
  chest: process.env.WEBHOOK_CHEST,
  combat: process.env.WEBHOOK_COMBAT,
  pet: process.env.WEBHOOK_PET,
  explosive: process.env.WEBHOOK_EXPLOSIVE,
  integrity: process.env.WEBHOOK_INTEGRITY,
  critical: process.env.WEBHOOK_CRITICAL || process.env.WEBHOOK_SERVER,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeChannel(body = {}) {
  const raw = String(body.channel || body.type || body.event || "server").toLowerCase();
  if (raw.includes("activity")) return "activity";
  if (raw.includes("case")) return "cases";
  if (raw.includes("report")) return "reports";
  if (raw.includes("chest") || raw.includes("storage")) return "chest";
  if (raw.includes("combat") || raw.includes("pvp") || raw.includes("kill")) return "combat";
  if (raw.includes("pet") || raw.includes("dragon")) return "pet";
  if (raw.includes("explosive") || raw.includes("tnt") || raw.includes("explosion")) return "explosive";
  if (raw.includes("integrity") || raw.includes("illegal") || raw.includes("admin_key")) return "integrity";
  if (raw.includes("critical")) return "critical";
  return "server";
}

function buildDiscordPayload(body = {}, source = "api") {
  const channel = normalizeChannel(body);
  const title = body.title || body.eventTitle || eventTitle(channel, body);
  const description = body.message || body.description || body.reason || "FieldTech security event received.";

  const fields = [];
  const add = (name, value, inline = true) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      fields.push({ name, value: String(value).slice(0, 1024), inline });
    }
  };

  add("Player", body.player);
  add("Owner", body.owner);
  add("Target", body.target || body.victim || body.reported);
  add("Entity", body.entity || body.mob);
  add("Item", body.item);
  add("Location", formatLocation(body), false);
  add("Source", source);
  add("Time", body.time || nowIso(), false);

  if (Array.isArray(body.fields)) {
    for (const f of body.fields) add(f.name, f.value, f.inline ?? false);
  }

  return {
    username: "FieldTech Security",
    embeds: [
      {
        title,
        description: String(description).slice(0, 4096),
        color: colorFor(channel),
        fields,
        footer: { text: `FieldTech Bridge • ${channel}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function eventTitle(channel, body) {
  const labels = {
    server: "🤖 Server Event",
    activity: "📅 Player Activity",
    cases: "📚 Case File",
    reports: "📖 Incident Report",
    chest: "📦 Security Chest Log",
    combat: "⚔️ Combat Log",
    pet: "🐾 Pet Log",
    explosive: "💥 Explosive Log",
    integrity: "💎 Item Integrity",
    critical: "🚨 Critical Alert",
  };
  return body.event ? `${labels[channel] || labels.server}: ${body.event}` : (labels[channel] || labels.server);
}

function colorFor(channel) {
  return {
    critical: 0xff0000,
    integrity: 0x9b59b6,
    explosive: 0xff6600,
    pet: 0x2ecc71,
    combat: 0xe74c3c,
    chest: 0xf1c40f,
    reports: 0x3498db,
    cases: 0x95a5a6,
    activity: 0x1abc9c,
    server: 0x7289da,
  }[channel] || 0x7289da;
}

function formatLocation(body) {
  if (body.location) return body.location;
  const { x, y, z, dimension } = body;
  if (x === undefined && y === undefined && z === undefined) return "";
  return `X:${x ?? "?"} Y:${y ?? "?"} Z:${z ?? "?"}${dimension ? ` • ${dimension}` : ""}`;
}

async function forwardToDiscord(event, source = "api") {
  const channel = normalizeChannel(event);
  const webhook = webhookMap[channel] || webhookMap.server;
  if (!webhook) {
    const err = new Error(`No webhook configured for channel "${channel}"`);
    err.channel = channel;
    throw err;
  }
  const payload = buildDiscordPayload(event, source);
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
  return { channel, discordStatus: res.status };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "online", version: "2.1.0", bloomWatch: bloomState.enabled, bloomConnected: bloomState.connected });
});

app.get("/debug", (_req, res) => {
  const configured = Object.fromEntries(Object.entries(webhookMap).map(([k, v]) => [k, Boolean(v)]));
  res.json({ ok: true, version: "2.1.0", webhooks: configured, bloom: bloomState });
});

app.post("/security", async (req, res) => {
  try {
    if (process.env.BRIDGE_SECRET && req.headers["x-bridge-secret"] !== process.env.BRIDGE_SECRET) {
      return res.status(401).json({ ok: false, error: "Invalid bridge secret" });
    }
    const result = await forwardToDiscord(req.body, "api");
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("/security error", e);
    res.status(500).json({ ok: false, error: e.message, channel: e.channel });
  }
});

app.get("/bloom/test", async (_req, res) => {
  try {
    const info = await getBloomServerInfo();
    res.json({ ok: true, server: info });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const bloomState = {
  enabled: String(process.env.BLOOM_CONSOLE_WATCH || "false").toLowerCase() === "true",
  connected: false,
  lastMessageAt: null,
  lastError: null,
  reconnects: 0,
};

function bloomBase() {
  return (process.env.BLOOM_PANEL_URL || "https://mc.bloom.host").replace(/\/$/, "");
}
function bloomServerId() {
  return process.env.BLOOM_SERVER_ID;
}
function bloomKey() {
  return process.env.BLOOM_CLIENT_API_KEY;
}
function bloomHeaders() {
  return {
    Authorization: `Bearer ${bloomKey()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function bloomFetch(path) {
  if (!bloomKey()) throw new Error("BLOOM_CLIENT_API_KEY missing");
  const res = await fetch(`${bloomBase()}${path}`, { headers: bloomHeaders() });
  if (!res.ok) throw new Error(`Bloom API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getBloomServerInfo() {
  return bloomFetch(`/api/client/servers/${bloomServerId()}`);
}

async function getBloomWebsocket() {
  return bloomFetch(`/api/client/servers/${bloomServerId()}/websocket`);
}

function parseConsoleLine(line) {
  const idx = line.indexOf(MARKER);
  if (idx === -1) return null;
  const jsonText = line.slice(idx + MARKER.length).trim();
  if (!jsonText) return { channel: "server", title: "FieldTech Console Event", message: line };
  try {
    return JSON.parse(jsonText);
  } catch {
    return { channel: "server", title: "FieldTech Console Event", message: jsonText };
  }
}

async function startBloomConsoleWatcher() {
  if (!bloomState.enabled) {
    console.log("Bloom console watcher disabled. Set BLOOM_CONSOLE_WATCH=true to enable.");
    return;
  }
  if (!bloomServerId() || !bloomKey()) {
    console.log("Bloom console watcher missing BLOOM_SERVER_ID or BLOOM_CLIENT_API_KEY.");
    return;
  }

  try {
    const data = await getBloomWebsocket();
    const socketUrl = data?.data?.socket;
    const token = data?.data?.token;
    if (!socketUrl || !token) throw new Error("Bloom websocket response missing socket/token");

    console.log("Connecting to Bloom console websocket...");
    const ws = new WebSocket(socketUrl);

    ws.on("open", () => {
      bloomState.connected = true;
      bloomState.lastError = null;
      console.log("Bloom console websocket open. Authenticating...");
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
    });

    ws.on("message", async (raw) => {
      bloomState.lastMessageAt = nowIso();
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const event = msg.event;
      const arg = Array.isArray(msg.args) ? msg.args[0] : undefined;
      if (event === "auth success") {
        console.log("Bloom console websocket auth success.");
        return;
      }
      if (event === "console output" && typeof arg === "string") {
        const parsed = parseConsoleLine(arg);
        if (parsed) {
          console.log("FieldTech console event detected:", parsed.channel || parsed.event || "server");
          try { await forwardToDiscord(parsed, "bloom-console"); }
          catch (e) { console.error("Failed forwarding console event", e.message); }
        }
      }
      if (event === "token expiring") {
        console.log("Bloom websocket token expiring; reconnecting.");
        try { ws.close(); } catch {}
      }
    });

    ws.on("close", () => {
      bloomState.connected = false;
      bloomState.reconnects += 1;
      console.log("Bloom console websocket closed. Reconnecting in 10 seconds...");
      setTimeout(startBloomConsoleWatcher, 10000);
    });

    ws.on("error", (err) => {
      bloomState.lastError = err.message;
      console.error("Bloom console websocket error:", err.message);
    });
  } catch (e) {
    bloomState.connected = false;
    bloomState.lastError = e.message;
    bloomState.reconnects += 1;
    console.error("Bloom console watcher startup failed:", e.message);
    setTimeout(startBloomConsoleWatcher, 15000);
  }
}

app.listen(PORT, () => {
  console.log(`FieldTech Discord Bridge v2.1 listening on port ${PORT}`);
  startBloomConsoleWatcher();
});

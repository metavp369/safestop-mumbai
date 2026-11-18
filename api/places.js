// SafeStop Mumbai – cached map-data lookups.
// The app asks OpenStreetMap's free Overpass servers for nearby places. Those servers
// get slow at busy times, so this function caches each answer in Upstash Redis for
// 12 hours: the first person searching an area waits, everyone after gets it instantly.
const crypto = require("crypto");

function findEnv(suffixes) {
  for (const k of suffixes) if (process.env[k]) return process.env[k];
  for (const name of Object.keys(process.env))
    for (const k of suffixes) if (name.endsWith("_" + k.split("_").slice(-3).join("_")) && process.env[name]) return process.env[name];
  return "";
}
const URL_ = findEnv(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]);
const TOKEN = findEnv(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const TTL = 12 * 3600;

async function redis(cmds) {
  if (!URL_ || !TOKEN) return cmds.map(() => null);
  try {
    const r = await fetch(URL_ + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
    if (!r.ok) return cmds.map(() => null);
    return (await r.json()).map((x) => (x.error ? null : x.result));
  } catch (e) { return cmds.map(() => null); }
}

// Only the kinds of queries the app itself makes: JSON output, "around" searches, read-only.
function allowed(q) {
  return typeof q === "string" && q.length <= 6000 && q.startsWith("[out:json]") && q.includes("around:") &&
    /^[\[\]\(\)\w:;"=~^|$.,\s\-!]+$/.test(q) && !/\b(out\s+(body|geom|meta|skel))\b/.test(q);
}

async function fromOverpass(q) {
  let last;
  for (const ep of ENDPOINTS) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SafeStopMumbai/1.0 (+https://safestop-mumbai.vercel.app)" }, signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = await r.text();
      if (!text.startsWith("{")) throw new Error("bad response");
      return text;
    } catch (e) { last = e; }
  }
  throw last || new Error("unavailable");
}

module.exports = async (req, res) => {
  // GET /api/places?health=1 – checks each public map server with a tiny fixed query (no user data)
  if (req.method === "GET" && req.query && req.query.health) {
    const q = '[out:json][timeout:20];nwr["amenity"="police"](around:1500,19.12,72.84);out center tags 5;';
    const out = { cache: !!(URL_ && TOKEN), servers: [] };
    await Promise.all(ENDPOINTS.map(async (ep) => {
      const t = Date.now();
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SafeStopMumbai/1.0 (+https://safestop-mumbai.vercel.app)" }, signal: ctl.signal });
        clearTimeout(to); const txt = await r.text();
        out.servers.push({ ep, status: r.status, ms: Date.now() - t, ok: txt.startsWith("{"), sample: txt.slice(0, 120) });
      } catch (e) { out.servers.push({ ep, error: String(e.message || e), ms: Date.now() - t }); }
    }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(out);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const q = b.q;
  if (!allowed(q)) return res.status(400).json({ error: "Query not allowed" });
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const hour = Math.floor(Date.now() / 3600000);
  const key = "ovp:" + crypto.createHash("sha1").update(q).digest("hex");
  const [hit, n] = await redis([["GET", key], ["INCR", `rl:places:${ip}:${hour}`], ["EXPIRE", `rl:places:${ip}:${hour}`, 3700]]);
  res.setHeader("Content-Type", "application/json");
  if (hit) { res.setHeader("X-Cache", "HIT"); return res.status(200).end(hit); }
  if (n && n > 150) return res.status(429).json({ error: "Too many searches – try again in a while" });
  try {
    const text = await fromOverpass(q);
    if (text.length < 900000) await redis([["SET", key, text, "EX", TTL]]);
    res.setHeader("X-Cache", "MISS");
    return res.status(200).end(text);
  } catch (e) {
    return res.status(502).json({ error: "Map data server is busy" });
  }
};

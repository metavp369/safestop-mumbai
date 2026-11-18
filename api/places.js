// SafeStop Mumbai – cached map-data lookups.
// The app asks OpenStreetMap's free Overpass servers for nearby places. Those servers
// get slow at busy times, so this function caches each answer in Upstash Redis for
// 12 hours: the first person searching an area waits, everyone after gets it instantly.
const crypto = require("crypto");

const { redis: rawRedis, connected } = require("../lib/redis.js");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const TTL = 3 * 24 * 3600; // map places change slowly; the nightly worker keeps busy areas fresh
// overpass-api.de rejects (406) requests that don't identify themselves properly
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "User-Agent": "SafeStopMumbai/1.0 (public-safety web app; +https://safestop-mumbai.vercel.app; github.com/metavp369/safestop-mumbai)",
  "Referer": "https://safestop-mumbai.vercel.app/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en",
};

async function redis(cmds) { if (!connected()) return cmds.map(() => null); try { return await rawRedis(cmds); } catch (e) { return cmds.map(() => null); } }

// Only the kinds of queries the app itself makes: JSON output, "around" searches, read-only.
function allowed(q) {
  return typeof q === "string" && q.length <= 6000 && q.startsWith("[out:json]") && q.includes("around:") &&
    /^[\[\]\(\)\w:;"=~^|$.,\s\-!]+$/.test(q) && !/\b(out\s+(body|geom|meta|skel))\b/.test(q);
}

// Ask every server at once and use the first good answer (then cancel the rest).
function fromOverpass(q) {
  return new Promise((resolve, reject) => {
    let done = false, failed = 0; const ctls = [];
    ENDPOINTS.forEach((ep) => {
      const ctl = new AbortController(); ctls.push(ctl);
      const to = setTimeout(() => ctl.abort(), 40000);
      fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: HEADERS, signal: ctl.signal })
        .then(async (r) => { clearTimeout(to); const t = await r.text(); if (!r.ok || !t.startsWith("{")) throw new Error("HTTP " + r.status); return t; })
        .then((t) => { if (!done) { done = true; ctls.forEach((c) => c !== ctl && c.abort()); resolve(t); } })
        .catch((e) => { if (++failed === ENDPOINTS.length && !done) reject(e); });
    });
  });
}

module.exports = async (req, res) => {
  // GET /api/places?health=1 – checks each public map server with a tiny fixed query (no user data)
  if (req.method === "GET" && req.query && req.query.health) {
    const q = '[out:json][timeout:20];nwr["amenity"="police"](around:1500,19.12,72.84);out center tags 5;';
    const out = { cache: connected(), servers: [] };
    await Promise.all(ENDPOINTS.map(async (ep) => {
      const t = Date.now();
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: HEADERS, signal: ctl.signal });
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
  // Keep a 30-day backup copy of every answer. If the map servers are slow (>12 s) and we have a backup,
  // answer with the backup straight away rather than keep the person waiting.
  const staleKey = "ovps:" + key.slice(4);
  const [stale] = await redis([["GET", staleKey]]);
  const live = fromOverpass(q).then(async (text) => {
    if (text.length < 900000) await redis([["SET", key, text, "EX", TTL], ["SET", staleKey, text, "EX", 30 * 86400]]);
    return text;
  });
  try {
    const text = await (stale ? Promise.race([live, new Promise((r) => setTimeout(() => r(null), 12000))]) : live);
    if (text) { res.setHeader("X-Cache", "MISS"); return res.status(200).end(text); }
    res.setHeader("X-Cache", "STALE"); return res.status(200).end(stale);
  } catch (e) {
    if (stale) { res.setHeader("X-Cache", "STALE"); return res.status(200).end(stale); }
    return res.status(502).json({ error: "Map data server is busy" });
  }
};
module.exports.fromOverpass = fromOverpass;
module.exports.cacheKey = (q) => "ovp:" + crypto.createHash("sha1").update(q).digest("hex");
module.exports.TTL = TTL;

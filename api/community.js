// SafeStop Mumbai – shared community data (added places, ratings, reports).
// Runs as a Vercel serverless function. Storage: Upstash Redis (REST API),
// created from Vercel → Storage → Upstash Redis and connected to this project.
// Env vars (either naming works): KV_REST_API_URL / KV_REST_API_TOKEN
//                                  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

const { redis, connected } = require("../lib/redis.js");

const MODES = { toilet: "toilet", police: "police", medical: "medical", safe: "safe", hazard: "hazard" };
const TYPES = {
  toilet: [""],
  police: [""],
  medical: ["pharmacy", "hospital", "clinic"],
  safe: ["shop", "fuel", "police", "hospital", "pharmacy", "other"],
  hazard: ["dark", "streetlight", "harassment", "deserted", "other"],
};
const HAZARD_NAMES = { dark: "Dark lane / no lights", streetlight: "Broken streetlight", harassment: "Harassment reported", deserted: "Deserted at night", other: "Feels unsafe" };
const HAZARD_MAX_AGE = 180 * 24 * 3600 * 1000; // reports fade after ~6 months
const FLAGS = ["closed", "dirty", "nowater", "unsafe", "wrong", "dark", "good", "confirm", "fixed"];
const BBOX = { minLat: 18.85, maxLat: 19.5, minLon: 72.7, maxLon: 73.25 }; // Mumbai Metropolitan Region
const LIMITS = { add: 15, vote: 300, delete: 30, read: 600, nav: 200 }; // per IP per hour
const DAY = 86400000, VOTE_MAX_AGE = 180 * DAY, HALF_LIFE = 45 * DAY;
const isNight = (h) => h >= 19 || h < 6;

const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const num = (v) => (typeof v === "number" ? v : parseFloat(v));
const inBox = (lat, lon) => lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
const okDevice = (d) => typeof d === "string" && /^[a-z0-9]{12,40}$/i.test(d);
const okId = (id) => typeof id === "string" && /^[nwrc][0-9a-z]{1,24}$/i.test(id);

async function rateLimit(ip, action) {
  const hour = Math.floor(Date.now() / 3600000);
  const key = `rl:${action}:${ip}:${hour}`;
  const [n] = await redis([["INCR", key], ["EXPIRE", key, 3700]]);
  return n <= (LIMITS[action] || 100);
}

function cleanPlace(p, mode) {
  const lat = num(p.lat), lon = num(p.lon);
  if (!isFinite(lat) || !isFinite(lon) || !inBox(lat, lon)) throw new Error("Location must be in Mumbai");
  if (mode === "hazard") p = { ...p, name: HAZARD_NAMES[str(p.type, 20)] || "Unsafe spot" };
  const name = str(p.name, 80);
  if (name.length < 2) throw new Error("Name is required");
  const type = str(p.type, 20);
  if (!TYPES[mode].includes(type)) throw new Error("Bad type");
  const phone = str(p.phone, 30).replace(/[^0-9+ \-]/g, "");
  const out = { lat: +lat.toFixed(6), lon: +lon.toFixed(6), name, type, phone };
  if (mode === "toilet") {
    out.female = p.female === "yes" ? "yes" : "";
    out.wheelchair = p.wheelchair === "yes" ? "yes" : "";
    out.baby = p.baby === "yes" ? "yes" : "";
    out.fee = p.fee === "no" ? "no" : "";
    out.seated = !!p.seated;
  }
  if (mode === "police") { out.chowki = !!p.chowki; out.womenDesk = !!p.womenDesk; }
  if (mode === "medical") out.emergency = !!p.emergency;
  if (mode === "safe") out.lit = !!p.lit;
  if (mode === "hazard") { out.when = p.when === "always" ? "always" : "night"; delete out.phone; }
  out.hours = p.hours === "24/7" ? "24/7" : "";
  return out;
}

// Votes are learned from: recent votes count more (45-day half-life), votes older than 6 months are ignored,
// and every vote remembers the hour it was made so the app can learn day vs night behaviour (e.g. "closed at night").
function aggregate(hash, navHash) {
  const now = Date.now();
  const agg = { n: 0, stars: 0, sn: 0, c: {}, w: {}, cn: {}, cd: {}, last: 0, nav: { day: 0, night: 0 } };
  if (Array.isArray(hash)) for (let i = 1; i < hash.length; i += 2) {
    let v; try { v = JSON.parse(hash[i]); } catch (e) { continue; }
    const t = v.t || 0; if (t && now - t > VOTE_MAX_AGE) continue;
    const wt = t ? Math.pow(0.5, (now - t) / HALF_LIFE) : 0.5;
    agg.n++; if (t > agg.last) agg.last = t;
    if (v.stars >= 1 && v.stars <= 5) { agg.stars += v.stars; agg.sn++; }
    const night = Number.isInteger(v.h) ? isNight(v.h) : null;
    for (const f of FLAGS) if (v[f]) {
      agg.c[f] = (agg.c[f] || 0) + 1;
      agg.w[f] = Math.round(((agg.w[f] || 0) + wt) * 100) / 100;
      if (night === true) agg.cn[f] = (agg.cn[f] || 0) + 1;
      if (night === false) agg.cd[f] = (agg.cd[f] || 0) + 1;
    }
  }
  if (agg.sn) agg.stars = Math.round((agg.stars / agg.sn) * 10) / 10;
  if (Array.isArray(navHash)) for (let i = 0; i < navHash.length; i += 2) agg.nav[navHash[i]] = parseInt(navHash[i + 1], 10) || 0;
  return agg;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!connected()) return res.status(503).json({ error: "Community database not connected yet" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "x").split(",")[0].trim();

  try {
    // ---- GET: community-added places near a point ----
    if (req.method === "GET") {
      if (!(await rateLimit(ip, "read"))) return res.status(429).json({ error: "Too many requests" });
      const mode = MODES[req.query.mode];
      const lat = num(req.query.lat), lon = num(req.query.lon);
      const r = Math.min(num(req.query.r) || 3000, 6000);
      if (!mode || !isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: "Bad query" });
      const [ids] = await redis([["GEOSEARCH", "geo:" + mode, "FROMLONLAT", lon, lat, "BYRADIUS", r, "m", "ASC", "COUNT", 200]]);
      if (!ids || !ids.length) return res.json({ places: [] });
      const [vals] = await redis([["MGET", ...ids.map((id) => "p:" + id)]]);
      const places = (vals || []).map((v) => { try { return JSON.parse(v); } catch (e) { return null; } })
        .filter(Boolean)
        .filter((p) => mode !== "hazard" || Date.now() - (p.at || 0) < HAZARD_MAX_AGE)
        .filter((p) => !p.dupOf && !p.flagged)
        .map(({ owner, ...p }) => p); // never expose device ids
      return res.json({ places });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { action, device } = b;

    // ---- votes for many places (read-only, no device needed) ----
    if (action === "votes") {
      if (!(await rateLimit(ip, "read"))) return res.status(429).json({ error: "Too many requests" });
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter(okId).slice(0, 200);
      if (!ids.length) return res.json({ votes: {} });
      const hashes = await redis(ids.flatMap((id) => [["HGETALL", "v:" + id], ["HGETALL", "n:" + id]]));
      const votes = {};
      ids.forEach((id, i) => { const a = aggregate(hashes[2 * i], hashes[2 * i + 1]); if (a.n || a.nav.day || a.nav.night) votes[id] = a; });
      return res.json({ votes });
    }

    if (!okDevice(device)) return res.status(400).json({ error: "Bad device" });

    // ---- add a place ----
    if (action === "add") {
      if (!(await rateLimit(ip, "add"))) return res.status(429).json({ error: "You've added a lot of places this hour. Try again later." });
      const mode = MODES[b.mode];
      if (!mode) return res.status(400).json({ error: "Bad mode" });
      const p = cleanPlace(b.place || {}, mode);
      const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const kind = mode === "toilet" ? undefined : mode;
      if (mode === "hazard") p.at = Date.now();
      const rec = { id, kind, ...p, community: true, mode, at: Date.now(), owner: device };
      await redis([["SET", "p:" + id, JSON.stringify(rec)], ["GEOADD", "geo:" + mode, p.lon, p.lat, id]]);
      return res.json({ id });
    }

    // ---- vote / report on any place (OSM or community) ----
    if (action === "vote") {
      if (!(await rateLimit(ip, "vote"))) return res.status(429).json({ error: "Too many requests" });
      if (!okId(b.id)) return res.status(400).json({ error: "Bad id" });
      const v = b.vote || {}, clean = {};
      const s = parseInt(v.stars, 10); if (s >= 1 && s <= 5) clean.stars = s;
      for (const f of FLAGS) if (v[f] === true) clean[f] = true;
      const h = parseInt(b.h, 10);
      if (Object.keys(clean).length) await redis([["HSET", "v:" + b.id, device, JSON.stringify({ ...clean, t: Date.now(), ...(h >= 0 && h <= 23 ? { h } : {}) })]]);
      // feed the nightly community report: places most often found closed / felt unsafe this month
      const mon = new Date().toISOString().slice(0, 7).replace("-", ""), extra = [];
      if (clean.closed) extra.push(["ZINCRBY", "hot:closed:" + mon, 1, b.id]);
      if (clean.unsafe || clean.dark) extra.push(["ZINCRBY", "hot:unsafe:" + mon, 1, b.id]);
      if (extra.length) { const nm = str(b.name, 60); if (nm) extra.push(["HSET", "names", b.id, nm]); extra.push(["EXPIRE", "hot:closed:" + mon, 70 * 86400], ["EXPIRE", "hot:unsafe:" + mon, 70 * 86400]); await redis(extra); }
      else await redis([["HDEL", "v:" + b.id, device]]);
      const [vh, nh] = await redis([["HGETALL", "v:" + b.id], ["HGETALL", "n:" + b.id]]);
      return res.json({ votes: aggregate(vh, nh) });
    }

    // ---- someone started directions to a place: learn which places people actually use ----
    if (action === "nav") {
      if (!(await rateLimit(ip, "nav"))) return res.status(429).json({ error: "Too many requests" });
      if (!okId(b.id)) return res.status(400).json({ error: "Bad id" });
      const h = parseInt(b.h, 10); const bucket = h >= 0 && h <= 23 && isNight(h) ? "night" : "day";
      const once = `nv:${b.id}:${device}:${Math.floor(Date.now() / DAY)}`;
      const [first] = await redis([["SET", once, "1", "NX", "EX", 90000]]);
      if (first) await redis([["HINCRBY", "n:" + b.id, bucket, 1], ["EXPIRE", "n:" + b.id, 180 * 86400]]);
      return res.json({ ok: true });
    }

    // ---- delete your own added place ----
    if (action === "delete") {
      if (!(await rateLimit(ip, "delete"))) return res.status(429).json({ error: "Too many requests" });
      if (!okId(b.id) || b.id[0] !== "c") return res.status(400).json({ error: "Bad id" });
      const [raw] = await redis([["GET", "p:" + b.id]]);
      if (!raw) return res.json({ ok: true });
      const rec = JSON.parse(raw);
      if (rec.owner !== device) return res.status(403).json({ error: "Only the person who added it can delete it" });
      await redis([["DEL", "p:" + b.id, "v:" + b.id], ["ZREM", "geo:" + rec.mode, b.id]]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Error" });
  }
};

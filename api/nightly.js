// SafeStop Mumbai – nightly worker (runs ~3 am IST via Vercel Cron, see vercel.json).
// 1. Cleans community data: merges duplicate places, hides suspected spam.
// 2. Pre-loads map data for busy areas so searches are instant.
// 3. Writes the community safety report (served by /api/report, shown on /report.html).
// Safe to call by hand: it runs at most once every 20 hours (GET /api/nightly?status=1 just shows the last run).
const { redis, connected } = require("../lib/redis.js");
const { buildQuery } = require("../lib/query.js");
const places = require("./places.js");

const AREAS = [["CSMT / Fort",18.9400,72.8353],["Colaba",18.9067,72.8147],["Marine Drive / Churchgate",18.9440,72.8235],["Lower Parel",18.9953,72.8302],["Dadar",19.0178,72.8478],["Sion",19.0390,72.8619],["Bandra",19.0596,72.8295],["Kurla",19.0726,72.8845],["Chembur",19.0522,72.9005],["Ghatkopar",19.0860,72.9081],["Vile Parle",19.0990,72.8492],["Juhu",19.1075,72.8263],["Andheri",19.1197,72.8468],["Powai",19.1176,72.9060],["Goregaon",19.1663,72.8526],["Malad",19.1874,72.8484],["Mulund",19.1726,72.9425],["Borivali",19.2307,72.8567],["Thane",19.2183,72.9781],["Vashi",19.0771,72.9986]];
const MODES = ["toilet", "police", "medical", "safe", "hazard"];
const DAY = 86400000;
const hav = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, s = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, "");
const similar = (a, b) => { a = norm(a); b = norm(b); return !a || !b || a === b || a.includes(b) || b.includes(a); };
const month = (t) => new Date(t).toISOString().slice(0, 7).replace("-", "");
const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };

async function cleanMode(mode, log) {
  const [ids] = await redis([["ZRANGE", "geo:" + mode, 0, -1]]);
  if (!ids || !ids.length) return [];
  const recs = [];
  for (let i = 0; i < ids.length; i += 200) {
    const [vals] = await redis([["MGET", ...ids.slice(i, i + 200).map((id) => "p:" + id)]]);
    (vals || []).forEach((v) => { const r = parse(v); if (r) recs.push(r); });
  }
  const now = Date.now();
  // spam: one phone adding more than 25 places of one kind in a week
  const perOwner = {};
  recs.forEach((r) => { if (now - (r.at || 0) < 7 * DAY) perOwner[r.owner] = (perOwner[r.owner] || 0) + 1; });
  const cmds = [];
  for (const r of recs) if (!r.flagged && perOwner[r.owner] > 25) { r.flagged = true; cmds.push(["SET", "p:" + r.id, JSON.stringify(r)], ["ZREM", "geo:" + mode, r.id]); log.flagged++; }
  // duplicates: same type, within 30 m (40 m for unsafe-spot reports), similar name → keep the oldest, move votes over
  const live = recs.filter((r) => !r.flagged && !r.dupOf).sort((a, b) => (a.at || 0) - (b.at || 0));
  const gone = new Set();
  for (let i = 0; i < live.length; i++) {
    const a = live[i]; if (gone.has(a.id)) continue;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j]; if (gone.has(b.id) || (a.type || "") !== (b.type || "")) continue;
      if (hav(a.lat, a.lon, b.lat, b.lon) > (mode === "hazard" ? 40 : 30) || (mode !== "hazard" && !similar(a.name, b.name))) continue;
      gone.add(b.id); log.merged++;
      const [vh] = await redis([["HGETALL", "v:" + b.id]]);
      for (let k = 0; k + 1 < (vh || []).length; k += 2) cmds.push(["HSETNX", "v:" + a.id, vh[k], vh[k + 1]]);
      if (mode === "hazard" && b.owner !== a.owner) cmds.push(["HSETNX", "v:" + a.id, b.owner, JSON.stringify({ confirm: true, t: b.at || now })]); // a second reporter confirms
      cmds.push(["SET", "p:" + b.id, JSON.stringify({ ...b, dupOf: a.id })], ["ZREM", "geo:" + mode, b.id]);
    }
  }
  for (let i = 0; i < cmds.length; i += 100) await redis(cmds.slice(i, i + 100));
  return live.filter((r) => !gone.has(r.id));
}

async function prewarm(deadline, log) {
  // toilets first (the report needs them), then the other modes; rotates through all areas over several nights
  const combos = [];
  ["toilet", "safe", "medical", "police"].forEach((m) => AREAS.forEach((a) => combos.push([m, a[1], a[2]])));
  const [cur] = await redis([["GET", "nightly:cursor"]]);
  let i = parseInt(cur || "0", 10) || 0, done = 0, fails = 0;
  while (Date.now() < deadline - 3000 && done < combos.length && fails < 3) {
    const [m, lat, lon] = combos[i % combos.length];
    const q = buildQuery(m, lat, lon, false), key = places.cacheKey(q);
    const [ttl] = await redis([["TTL", key]]);
    if (!(ttl > DAY / 1000)) {
      const budget = Math.min(25000, deadline - Date.now());
      try { const text = await Promise.race([places.fromOverpass(q), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), budget))]);
        if (text.length < 900000) { await redis([["SET", key, text, "EX", places.TTL]]); log.prewarmed++; } }
      catch (e) { log.prewarmFailed++; fails++; }
    }
    i++; done++;
  }
  await redis([["SET", "nightly:cursor", String(i % combos.length)]]);
}

async function buildReport(byMode) {
  const now = Date.now(), m0 = month(now), m1 = month(now - 31 * DAY);
  const areas = [];
  for (const [name, lat, lon] of AREAS) {
    const [raw] = await redis([["GET", places.cacheKey(buildQuery("toilet", lat, lon, false))]]);
    const els = (parse(raw) || {}).elements;
    let toilets = null, women = 0, free = 0;
    if (Array.isArray(els)) {
      const near = els.filter((e) => { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; return la && hav(lat, lon, la, lo) <= 1000 && (e.tags || {}).access !== "private"; });
      toilets = near.length; women = near.filter((e) => (e.tags || {}).female === "yes" || (e.tags || {}).unisex === "yes").length; free = near.filter((e) => (e.tags || {}).fee === "no").length;
    }
    const added = (byMode.toilet || []).filter((r) => hav(lat, lon, r.lat, r.lon) <= 1000).length;
    const hz = (byMode.hazard || []).filter((r) => hav(lat, lon, r.lat, r.lon) <= 2000 && now - (r.at || 0) < 90 * DAY);
    const types = {}; hz.forEach((h) => (types[h.type] = (types[h.type] || 0) + 1));
    areas.push({ name, lat, lon, toilets, womenToilets: women, freeToilets: free, communityToilets: added, unsafeReports90d: hz.length, unsafeTypes: types });
  }
  const top = async (kind) => {
    const [a, b] = await redis([["ZREVRANGE", `hot:${kind}:${m0}`, 0, 19, "WITHSCORES"], ["ZREVRANGE", `hot:${kind}:${m1}`, 0, 19, "WITHSCORES"]]);
    const sc = {}; [a, b].forEach((l) => { for (let i = 0; i + 1 < (l || []).length; i += 2) sc[l[i]] = (sc[l[i]] || 0) + parseFloat(l[i + 1]); });
    const ids = Object.keys(sc).sort((x, y) => sc[y] - sc[x]).slice(0, 10);
    if (!ids.length) return [];
    const names = await redis(ids.map((id) => ["HGET", "names", id]));
    return ids.map((id, i) => ({ id, name: names[i] || "Unnamed place", reports: sc[id] }));
  };
  const totals = {}; MODES.forEach((m) => (totals[m] = (byMode[m] || []).length));
  return { generatedAt: now, areas, oftenClosed: await top("closed"), feltUnsafe: await top("unsafe"), communityTotals: totals };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!connected()) return res.status(503).json({ error: "Database not connected" });
  const [last] = await redis([["GET", "nightly:last"]]);
  if (req.query && req.query.status) return res.json({ last: parse(last) });
  const [ok] = await redis([["SET", "nightly:lock", String(Date.now()), "NX", "EX", 72000]]);
  if (!ok) return res.json({ skipped: "Already ran in the last 20 hours", last: parse(last) });
  const start = Date.now(), log = { flagged: 0, merged: 0, prewarmed: 0, prewarmFailed: 0 };
  const byMode = {};
  for (const m of MODES) { try { byMode[m] = await cleanMode(m, log); } catch (e) { log["error_" + m] = String(e.message); } }
  try { await prewarm(start + 45000, log); } catch (e) { log.prewarmError = String(e.message); }
  try { const report = await buildReport(byMode); await redis([["SET", "report:latest", JSON.stringify(report)]]); log.report = "ok"; } catch (e) { log.reportError = String(e.message); }
  const summary = { ranAt: start, tookMs: Date.now() - start, ...log };
  await redis([["SET", "nightly:last", JSON.stringify(summary)]]);
  return res.json(summary);
};

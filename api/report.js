// SafeStop Mumbai – latest community safety report (written nightly by /api/nightly).
const { redis, connected } = require("../lib/redis.js");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=600");
  if (!connected()) return res.status(503).json({ error: "Database not connected" });
  const [raw] = await redis([["GET", "report:latest"]]);
  if (!raw) return res.status(404).json({ error: "No report yet – it is created by the nightly worker" });
  res.setHeader("Content-Type", "application/json");
  return res.status(200).end(raw);
};

// Shared Upstash Redis (REST) helper for the API functions.
function findEnv(suffixes) {
  for (const k of suffixes) if (process.env[k]) return process.env[k];
  for (const name of Object.keys(process.env))
    for (const k of suffixes) if (name.endsWith("_" + k.split("_").slice(-3).join("_")) && process.env[name]) return process.env[name];
  return "";
}
const URL_ = findEnv(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]);
const TOKEN = findEnv(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
const connected = () => !!(URL_ && TOKEN);
async function redis(cmds) {
  const r = await fetch(URL_ + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map((x) => (x.error ? null : x.result));
}
module.exports = { redis, connected };

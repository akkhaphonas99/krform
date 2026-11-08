// API ເກັບປະຫວັດການບັນທຶກ — Vercel Function + Upstash Redis (ບໍ່ຕ້ອງຕິດຕັ້ງ package)
//   GET    /api/records            → ລາຍການທັງໝົດ (ສະຫຼຸບ)
//   GET    /api/records?ids=1,2    → ຂໍ້ມູນເຕັມຂອງ id ທີ່ລະບຸ
//   POST   /api/records            → { records: [...] } ບັນທຶກ (ຂ້າມລາຍການທີ່ຊ້ຳ)
//   DELETE /api/records?ids=1,2    → ລົບ
// (ຖ້າຕັ້ງ env APP_PASSWORD ຈຶ່ງຕ້ອງສົ່ງ header x-app-password)
const { createHash, timingSafeEqual } = require("node:crypto");

// ບໍ່ຕ້ອງໃຊ້ລະຫັດຜ່ານ (ທຸກຄົນທີ່ມີລິ້ງເຂົ້າໄດ້)
// ຖ້າຢາກເປີດລະຫັດຜ່ານພາຍຫຼັງ: ຕັ້ງ env APP_PASSWORD ໃນ Vercel (Settings → Environment Variables) ແລ້ວ Redeploy
const APP_PASSWORD = process.env.APP_PASSWORD || "";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const MAX_BATCH = 500;
const K_IDX = "app:idx";      // hash: id → ສະຫຼຸບ (JSON)
const K_HASHES = "app:hashes"; // set: hash ຂອງແຕ່ລະລາຍການ ໄວ້ກັນຊ້ຳ
const K_NEXT = "app:next";     // ຕົວນັບ id
const kRec = (id) => `app:rec:${id}`;

const sha = (s) => createHash("sha256").update(s).digest();
const authorized = (req) =>
  !APP_PASSWORD ||
  timingSafeEqual(sha(String(req.headers["x-app-password"] || "")), sha(APP_PASSWORD));

const str = (v, n = 500) => String(v ?? "").slice(0, n);
const parseIds = (raw) =>
  [...new Set(String(Array.isArray(raw) ? raw.join(",") : raw || "")
    .split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);

/* ສົ່ງຄຳສັ່ງ Redis ເປັນ pipeline ແບບແບ່ງກ້ອນ (ກັນ request ໃຫຍ່ເກີນ) */
async function redis(cmds, size = 50) {
  const out = [];
  for (let i = 0; i < cmds.length; i += size) {
    const r = await fetch(`${REDIS_URL.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds.slice(i, i + size)),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(j)) throw new Error("Redis ຕອບຜິດພາດ (" + r.status + ")");
    const bad = j.find((x) => x && x.error);
    if (bad) throw new Error(bad.error);
    out.push(...j.map((x) => x.result));
  }
  return out;
}

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

module.exports = async (req, res) => {
  const send = (status, data) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(status).json(data);
  };

  if (!authorized(req)) return send(401, { error: "unauthorized" });
  if (!REDIS_URL || !REDIS_TOKEN) {
    return send(500, { error: "ຍັງບໍ່ໄດ້ເຊື່ອມຖານຂໍ້ມູນ Redis ກັບ project (Vercel → Storage → Upstash Redis) ແລ້ວ Redeploy" });
  }

  try {
    /* ---------- GET ---------- */
    if (req.method === "GET") {
      const ids = parseIds(req.query && req.query.ids);
      if (ids.length) {
        const rows = await redis(ids.map((id) => ["GET", kRec(id)]));
        return send(200, { records: rows.map(parse).filter(Boolean) });
      }
      const [flat] = await redis([["HGETALL", K_IDX]]);
      const items = [];
      for (let i = 1; i < (flat || []).length; i += 2) {
        const o = parse(flat[i]);
        if (o) { delete o.hash; items.push(o); }
      }
      items.sort((a, b) => b.id - a.id);
      return send(200, { records: items });
    }

    /* ---------- POST ---------- */
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = parse(body);
      const list = body && Array.isArray(body.records) ? body.records : null;
      if (!list || !list.length) return send(400, { error: "ບໍ່ມີຂໍ້ມູນທີ່ຈະບັນທຶກ" });
      if (list.length > MAX_BATCH) return send(400, { error: `ບັນທຶກໄດ້ຄັ້ງລະບໍ່ເກີນ ${MAX_BATCH} ລາຍການ` });

      let skipped = 0;
      const cand = [];
      const inBatch = new Set();
      for (const r of list) {
        const fields = Array.isArray(r && r.fields)
          ? r.fields.slice(0, 200).map((f) => [str(f && f[0], 300), str(f && f[1], 5000)])
          : [];
        if (!fields.length) { skipped++; continue; }
        const hash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
        if (inBatch.has(hash)) { skipped++; continue; }
        inBatch.add(hash);
        cand.push({
          hash, fields,
          summary: {
            name: str(r.name, 200), gender: str(r.gender, 50), phone: str(r.phone, 100),
            province: str(r.province, 100), submitted_at: str(r.submitted_at, 30),
          },
        });
      }
      if (!cand.length) return send(200, { saved: 0, skipped });

      // SADD ຄືນ 1 = ໃໝ່, 0 = ມີແລ້ວ (ກວດຊ້ຳແບບ atomic ຈຶ່ງບໍ່ຊ້ຳແມ່ນແຕ່ບັນທຶກພ້ອມກັນ)
      const added = await redis(cand.map((c) => ["SADD", K_HASHES, c.hash]));
      const fresh = cand.filter((_, i) => added[i] === 1);
      skipped += cand.length - fresh.length;
      if (!fresh.length) return send(200, { saved: 0, skipped });

      try {
        const [end] = await redis([["INCRBY", K_NEXT, String(fresh.length)]]);
        const start = Number(end) - fresh.length + 1;
        const now = new Date().toISOString();
        const cmds = [];
        fresh.forEach((c, i) => {
          const id = start + i;
          const summary = { id, ...c.summary, created_at: now };
          cmds.push(["SET", kRec(id), JSON.stringify({ ...summary, fields: c.fields })]);
          cmds.push(["HSET", K_IDX, String(id), JSON.stringify({ ...summary, hash: c.hash })]);
        });
        await redis(cmds);
      } catch (e) {
        await redis(fresh.map((c) => ["SREM", K_HASHES, c.hash])).catch(() => {}); // ຍົກເລີກການຈອງ hash
        throw e;
      }
      return send(200, { saved: fresh.length, skipped });
    }

    /* ---------- DELETE ---------- */
    if (req.method === "DELETE") {
      const ids = parseIds(req.query && req.query.ids);
      if (!ids.length) return send(400, { error: "ບໍ່ໄດ້ລະບຸ ids" });
      const rows = await redis(ids.map((id) => ["HGET", K_IDX, String(id)]));
      const cmds = [];
      ids.forEach((id, i) => {
        const s = parse(rows[i]);
        cmds.push(["HDEL", K_IDX, String(id)], ["DEL", kRec(id)]);
        if (s && s.hash) cmds.push(["SREM", K_HASHES, s.hash]);
      });
      await redis(cmds);
      return send(200, { deleted: ids.length });
    }

    return send(405, { error: "method not allowed" });
  } catch (e) {
    console.error(e);
    return send(500, { error: "ເຊີບເວີຜິດພາດ: " + (e && e.message ? e.message : e) });
  }
};

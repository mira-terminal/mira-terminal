import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;
const IEX_KEY = process.env.IEX_API_KEY;
const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY;
const MOLTBOOK_BASE = "https://www.moltbook.com/api/v1";

async function moltbookGet(path, params = {}) {
  if (!MOLTBOOK_KEY) throw new Error("Missing MOLTBOOK_API_KEY");
  const url = new URL(`${MOLTBOOK_BASE}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MOLTBOOK_KEY}`,
      Accept: "application/json",
      "User-Agent": "MiraTerminal/1.0 read-only-reconnaissance",
    },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 5000) }; }
  if (!r.ok) throw new Error(`Moltbook HTTP ${r.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

app.get("/", (_req, res) => {
  res.send(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
    <body style="font-family:system-ui;padding:16px">
      <h2>Mira Terminal</h2>
      <p>Persistent runtime online.</p>
      <p><a href="/health">Health</a></p>
      <p>Moltbook bridge: read-only reconnaissance.</p>
    </body></html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, moltbookConfigured: Boolean(MOLTBOOK_KEY), time: new Date().toISOString() });
});

app.get("/api/moltbook/status", async (_req, res) => {
  try { res.json(await moltbookGet("agents/status")); }
  catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/moltbook/home", async (_req, res) => {
  try { res.json(await moltbookGet("home")); }
  catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/moltbook/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });
    res.json(await moltbookGet("search", { q, limit: 10 }));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/moltbook/post/:id", async (req, res) => {
  try { res.json(await moltbookGet(`posts/${encodeURIComponent(req.params.id)}`)); }
  catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/quote", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "AAPL").toString().toUpperCase();
    if (!IEX_KEY) return res.status(500).json({ error: "Missing IEX_API_KEY" });
    const url = `https://cloud.iexapis.com/stable/stock/${encodeURIComponent(symbol)}/quote?token=${IEX_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`IEX error ${r.status}`);
    const data = await r.json();
    res.json({ symbol, price: data.latestPrice, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.log(`Mira terminal listening on ${PORT}`));

import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;
const IEX_KEY = process.env.IEX_API_KEY;

app.get("/", (_req, res) => {
  res.send(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style="font-family: system-ui; padding:16px;">
        <h2>Mira Terminal — Live Check</h2>
        <p>Server running. Try the quote endpoint:</p>
        <code>/api/quote?symbol=AAPL</code>
        <p style="margin-top:12px;"><a href="/api/quote?symbol=AAPL">Test AAPL</a></p>
        <p><a href="/health">Health</a></p>
      </body>
    </html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`Mira starter listening on ${PORT}`);
});

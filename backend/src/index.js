require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { router: authRouter, userSessions } = require("./authRoutes");
const ctraderClient = require("./ctraderClient");

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(cookieParser());

const frontendPath = path.join(__dirname, "../../frontend");
console.log("Looking for frontend at:", frontendPath);
app.use(express.static(frontendPath));

app.use(authRouter);

function getSession(req) {
  return userSessions.get(req.cookies.session_id);
}

app.get("/api/positions", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const data = await ctraderClient.getPositions(req.query.accountId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const result = await ctraderClient.placeOrder(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/symbols", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const data = await ctraderClient.getSymbols(req.query.accountId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/trader", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const data = await ctraderClient.getTrader(req.query.accountId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/live-prices", (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const prices = ctraderClient.getLivePrices(req.query.accountId);
    res.json({ prices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/trendbars", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const { accountId, symbol, period } = req.query;
    const symbolId = await ctraderClient.getSymbolIdByName(accountId, symbol);
    if (!symbolId) return res.status(404).json({ error: "Symbol not found: " + symbol });
    const data = await ctraderClient.getTrendbars(accountId, symbolId, period || "M1", 100);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug-symbols", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  try {
    const data = await ctraderClient.getSymbols(req.query.accountId);
    const names = (data.symbol || []).map(s => s.symbolName);
    res.json({ count: names.length, names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;

async function start() {
  await ctraderClient.connect();
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
const { CTraderConnection } = require("@reiryoku/ctrader-layer");

const HOSTS = {
  demo: { host: "demo.ctraderapi.com", port: 5035 },
  live: { host: "live.ctraderapi.com", port: 5035 },
};

const WATCHLIST_CODES = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP"];

function normalize(name) {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

class CTraderClient {
  constructor() {
    this.connection = null;
    this.appAuthenticated = false;
    this.authenticatedAccounts = new Map();
    this.symbolCache = new Map();
    this.latestSpots = new Map();
    this.spotListenerStarted = false;
    this.serviceAccountId = null; // the account we use to feed public market data
  }

  async connect() {
    if (this.connection) return this.connection;

    const env = process.env.CTRADER_ENV === "live" ? "live" : "demo";
    const { host, port } = HOSTS[env];

    this.connection = new CTraderConnection({ host, port });
    await this.connection.open();

    await this.connection.sendCommand("ProtoOAApplicationAuthReq", {
      clientId: process.env.CTRADER_CLIENT_ID,
      clientSecret: process.env.CTRADER_CLIENT_SECRET,
    });
    this.appAuthenticated = true;

    this.heartbeat = setInterval(() => {
      this.connection.sendHeartbeat();
    }, 25000);

    this.startSpotListener();

    console.log(`[ctrader] connected + app-authenticated (${env})`);
    return this.connection;
  }

  startSpotListener() {
    if (this.spotListenerStarted || !this.connection) return;
    this.spotListenerStarted = true;
    this.connection.on("ProtoOASpotEvent", (event) => {
      this.latestSpots.set(event.symbolId, {
        bid: event.bid,
        ask: event.ask,
        timestamp: Date.now(),
      });
    });
    console.log("[ctrader] spot event listener attached");
  }

  // Uses env vars to auto-authorize one account at boot, so the app has a
  // live public price feed even before any visitor logs in personally.
  async authorizeServiceAccount() {
    const accountId = process.env.CTRADER_SERVICE_ACCOUNT_ID;
    const accessToken = process.env.CTRADER_SERVICE_ACCESS_TOKEN;

    if (!accountId || !accessToken) {
      console.log("[ctrader] no service account configured — public feed will use mock data until a user connects");
      return;
    }

    try {
      await this.authorizeAccount(accountId, accessToken);
      this.serviceAccountId = accountId;
      await this.subscribeToWatchlist(accountId);
      console.log("[ctrader] service account authorized + subscribed:", accountId);
    } catch (err) {
      console.error("[ctrader] failed to authorize service account:", err.message);
    }
  }

  async authorizeAccount(ctidTraderAccountId, accessToken) {
    await this.connect();
    await this.connection.sendCommand("ProtoOAAccountAuthReq", {
      accessToken,
      ctidTraderAccountId,
    });
    this.authenticatedAccounts.set(String(ctidTraderAccountId), {
      accessToken,
      ctidTraderAccountId,
    });
    return true;
  }

  requireConnection() {
    if (!this.connection) throw new Error("cTrader connection not established yet");
    return this.connection;
  }

  async getTrader(ctidTraderAccountId) {
    return this.requireConnection().sendCommand("ProtoOATraderReq", { ctidTraderAccountId });
  }

  async getPositions(ctidTraderAccountId) {
    return this.requireConnection().sendCommand("ProtoOAReconcileReq", { ctidTraderAccountId });
  }

  async getSymbols(ctidTraderAccountId) {
    return this.requireConnection().sendCommand("ProtoOASymbolsListReq", { ctidTraderAccountId });
  }

  async placeOrder({ ctidTraderAccountId, symbolId, side, orderType, volume, limitPrice, stopPrice }) {
    return this.requireConnection().sendCommand("ProtoOANewOrderReq", {
      ctidTraderAccountId,
      symbolId,
      orderType,
      tradeSide: side,
      volume,
      ...(limitPrice ? { limitPrice } : {}),
      ...(stopPrice ? { stopPrice } : {}),
    });
  }

  async subscribeSpots(ctidTraderAccountId, symbolIds) {
    return this.requireConnection().sendCommand("ProtoOASubscribeSpotsReq", {
      ctidTraderAccountId,
      symbolId: symbolIds,
    });
  }

  async subscribeToWatchlist(ctidTraderAccountId) {
    const res = await this.getSymbols(ctidTraderAccountId);
    const symbols = res.symbol || [];

    console.log(`[ctrader] account has ${symbols.length} symbols total. First 10 raw names:`,
      symbols.slice(0, 10).map(s => s.symbolName));

    const map = new Map();
    symbols.forEach((s) => {
      const norm = normalize(s.symbolName);
      const matchedCode = WATCHLIST_CODES.find((code) => norm.includes(code));
      if (matchedCode && !map.has(matchedCode)) {
        map.set(matchedCode, { id: s.symbolId, rawName: s.symbolName });
      }
    });

    this.symbolCache.set(String(ctidTraderAccountId), map);

    const ids = [...map.values()].map((v) => v.id);
    console.log(`[ctrader] matched ${ids.length}/${WATCHLIST_CODES.length} watchlist symbols:`,
      [...map.entries()].map(([code, v]) => `${code}->${v.rawName}(${v.id})`));

    if (ids.length) {
      await this.subscribeSpots(ctidTraderAccountId, ids);
      console.log(`[ctrader] subscribed to ${ids.length} live symbols for account`, ctidTraderAccountId);
    } else {
      console.warn("[ctrader] WARNING: no watchlist symbols matched — check raw names above.");
    }

    this.startSpotListener();
    return map;
  }

  async getSymbolIdByName(ctidTraderAccountId, displayName) {
    const code = normalize(displayName);
    const key = String(ctidTraderAccountId);
    if (!this.symbolCache.has(key)) {
      await this.subscribeToWatchlist(ctidTraderAccountId);
    }
    return this.symbolCache.get(key)?.get(code)?.id;
  }

  getLivePrices(ctidTraderAccountId) {
    const map = this.symbolCache.get(String(ctidTraderAccountId));
    if (!map) return {};
    const prices = {};
    for (const [code, entry] of map.entries()) {
      const spot = this.latestSpots.get(entry.id);
      if (spot) prices[code] = spot;
    }
    return prices;
  }

  // Public feed helpers — use the service account so anyone can see live
  // data without logging in themselves.
  getPublicLivePrices() {
    if (!this.serviceAccountId) return {};
    return this.getLivePrices(this.serviceAccountId);
  }

  async getPublicTrendbars(symbol, period, count) {
    if (!this.serviceAccountId) throw new Error("No service account configured");
    const symbolId = await this.getSymbolIdByName(this.serviceAccountId, symbol);
    if (!symbolId) throw new Error("Symbol not found: " + symbol);
    return this.getTrendbars(this.serviceAccountId, symbolId, period, count);
  }

  async getTrendbars(ctidTraderAccountId, symbolId, period = "M1", count = 100) {
    const periodMs = {
      M1: 60000, M5: 300000, M15: 900000, M30: 1800000,
      H1: 3600000, H4: 14400000, D1: 86400000,
    };
    const now = Date.now();
    const fromTimestamp = now - (periodMs[period] || 60000) * count;

    return this.requireConnection().sendCommand("ProtoOAGetTrendbarsReq", {
      ctidTraderAccountId,
      period,
      fromTimestamp,
      toTimestamp: now,
      symbolId,
    });
  }

  onEvent(eventName, handler) {
    this.requireConnection().on(eventName, handler);
  }
}

module.exports = new CTraderClient();
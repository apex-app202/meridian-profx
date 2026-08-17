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
    this.symbolCache = new Map(); // accountId -> Map(normalizedCode -> {id, rawName})
    this.latestSpots = new Map(); // symbolId -> { bid, ask, timestamp }
    this.spotListenerStarted = false;
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

  // Robust matching: normalize both our target codes and the broker's real
  // symbol names (strip dots, dashes, suffixes, case) and match on the core
  // 6-letter code being present, rather than requiring an exact string match.
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
      console.warn("[ctrader] WARNING: no watchlist symbols matched — live prices will not work. Check raw names above.");
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
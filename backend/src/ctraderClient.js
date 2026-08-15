const { CTraderConnection } = require("@reiryoku/ctrader-layer");

const HOSTS = {
  demo: { host: "demo.ctraderapi.com", port: 5035 },
  live: { host: "live.ctraderapi.com", port: 5035 },
};

const WATCHLIST_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP"];

class CTraderClient {
  constructor() {
    this.connection = null;
    this.appAuthenticated = false;
    this.authenticatedAccounts = new Map();
    this.symbolCache = new Map(); // accountId -> Map(symbolName -> symbolId)
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

  // Fetches the account's full symbol list once, builds a name -> id map,
  // subscribes to live spots for our default watchlist pairs.
  async subscribeToWatchlist(ctidTraderAccountId) {
    const res = await this.getSymbols(ctidTraderAccountId);
    const symbols = res.symbol || [];

    const map = new Map();
    symbols.forEach((s) => map.set(s.symbolName.toUpperCase(), s.symbolId));
    this.symbolCache.set(String(ctidTraderAccountId), map);

    const ids = WATCHLIST_SYMBOLS.map((n) => map.get(n)).filter(Boolean);
    if (ids.length) {
      await this.subscribeSpots(ctidTraderAccountId, ids);
      console.log(`Subscribed to ${ids.length} live symbols for account`, ctidTraderAccountId);
    }
    this.startSpotListener();
    return map;
  }

  async getSymbolIdByName(ctidTraderAccountId, displayName) {
    const cleanName = displayName.replace("/", "").toUpperCase();
    const key = String(ctidTraderAccountId);
    if (!this.symbolCache.has(key)) {
      await this.subscribeToWatchlist(ctidTraderAccountId);
    }
    return this.symbolCache.get(key)?.get(cleanName);
  }

  getLivePrices(ctidTraderAccountId) {
    const map = this.symbolCache.get(String(ctidTraderAccountId));
    if (!map) return {};
    const prices = {};
    for (const [name, id] of map.entries()) {
      const spot = this.latestSpots.get(id);
      if (spot) prices[name] = spot;
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
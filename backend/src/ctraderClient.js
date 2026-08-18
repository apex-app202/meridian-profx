const { CTraderConnection } = require("@reiryoku/ctrader-layer");

const HOSTS = {
  demo: { host: "demo.ctraderapi.com", port: 5035 },
  live: { host: "live.ctraderapi.com", port: 5035 },
};

const WATCHLIST_CODES = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP"];

function normalize(name) {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

function toDisplayName(code) {
  return code.length === 6 ? `${code.slice(0, 3)}/${code.slice(3)}` : code;
}

class CTraderClient {
  constructor() {
    this.connection = null;
    this.appAuthenticated = false;
    this.authenticatedAccounts = new Map();
    this.symbolCache = new Map();   // accountId -> Map(code -> {id, rawName})
    this.reverseCache = new Map();  // accountId -> Map(symbolId -> code)
    this.latestSpots = new Map();   // symbolId -> { bid, ask, timestamp }
    this.spotListenerStarted = false;
    this.serviceAccountId = null;
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

  async authorizeServiceAccount() {
    const accountId = process.env.CTRADER_SERVICE_ACCOUNT_ID;
    const accessToken = process.env.CTRADER_SERVICE_ACCESS_TOKEN;

    if (!accountId || !accessToken) {
      console.log("[ctrader] no service account configured — public feed will be empty until a user connects");
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

  async getSymbols(ctidTraderAccountId) {
    return this.requireConnection().sendCommand("ProtoOASymbolsListReq", { ctidTraderAccountId });
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
    const reverseMap = new Map();
    symbols.forEach((s) => {
      const norm = normalize(s.symbolName);
      const matchedCode = WATCHLIST_CODES.find((code) => norm.includes(code));
      if (matchedCode && !map.has(matchedCode)) {
        map.set(matchedCode, { id: s.symbolId, rawName: s.symbolName });
        reverseMap.set(s.symbolId, matchedCode);
      }
    });

    const key = String(ctidTraderAccountId);
    this.symbolCache.set(key, map);
    this.reverseCache.set(key, reverseMap);

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

  getSymbolCodeById(ctidTraderAccountId, symbolId) {
    const key = String(ctidTraderAccountId);
    return this.reverseCache.get(key)?.get(symbolId);
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

  // Raw reconcile call (kept for debugging/advanced use)
  async getPositionsRaw(ctidTraderAccountId) {
    return this.requireConnection().sendCommand("ProtoOAReconcileReq", { ctidTraderAccountId });
  }

  // Cleaned-up positions with display symbol names, ready for the frontend.
  async getFormattedPositions(ctidTraderAccountId) {
    const key = String(ctidTraderAccountId);
    if (!this.symbolCache.has(key)) {
      await this.subscribeToWatchlist(ctidTraderAccountId);
    }

    const raw = await this.getPositionsRaw(ctidTraderAccountId);
    const rawPositions = raw.position || [];

    const divisorFor = (code) => (code.includes("JPY") ? 1000 : 100000);

    return rawPositions.map((p) => {
      const code = this.getSymbolCodeById(ctidTraderAccountId, p.tradeData.symbolId) || `SYM${p.tradeData.symbolId}`;
      const displayName = toDisplayName(code);
      const divisor = divisorFor(code);

      const spot = this.latestSpots.get(p.tradeData.symbolId);
      const side = p.tradeData.tradeSide === "BUY" ? "BUY" : "SELL";
      const currentRaw = spot ? (side === "BUY" ? spot.bid : spot.ask) : null;
      const openPrice = p.price;
      const currentPrice = currentRaw !== null ? currentRaw / divisor : openPrice;

      const pipFactor = code.includes("JPY") ? 100 : 10000;
      const diff = side === "BUY" ? currentPrice - openPrice : openPrice - currentPrice;
      const pips = diff * pipFactor;
      const volumeLots = p.tradeData.volume / 100000;
      const pl = pips * volumeLots * 10;

      return {
        positionId: p.positionId,
        symbol: displayName,
        side,
        volume: volumeLots,
        openPrice,
        currentPrice,
        sl: p.stopLoss || null,
        tp: p.takeProfit || null,
        pl,
      };
    });
  }

  // Places an order using a display symbol name (e.g. "EUR/USD") — resolves
  // the broker's real symbolId internally so the frontend never has to know it.
  async placeOrderByName({ ctidTraderAccountId, symbol, side, orderType, volume, limitPrice, stopPrice }) {
    const symbolId = await this.getSymbolIdByName(ctidTraderAccountId, symbol);
    if (!symbolId) throw new Error("Symbol not found: " + symbol);

    const volumeInUnits = Math.round(volume * 100000);

    return this.requireConnection().sendCommand("ProtoOANewOrderReq", {
      ctidTraderAccountId,
      symbolId,
      orderType,
      tradeSide: side,
      volume: volumeInUnits,
      ...(limitPrice ? { limitPrice } : {}),
      ...(stopPrice ? { stopPrice } : {}),
    });
  }

  onEvent(eventName, handler) {
    this.requireConnection().on(eventName, handler);
  }
}

module.exports = new CTraderClient();
// ===== Meridian ProFX — app logic (real data only, no mock) =====

const WATCHLIST_NAMES = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "EUR/GBP"];

const state = {
  symbols: WATCHLIST_NAMES.map((name) => ({ symbol: name, bid: null, ask: null, openBid: null })),
  positions: [],
  activeTradeSymbol: "EUR/USD",
  orderType: "MARKET",
  timeframe: "M1",
};

const CANDLE_WIDTH = 10;
const CANDLE_GAP = 4;
const CHART_HEIGHT = 320;

const fmt = (n, dp = 5) => (n === null || n === undefined ? "—" : Number(n).toFixed(dp));
const fmtMoney = (n) => (n === null || n === undefined ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(2));

function getSymbol(name) {
  return state.symbols.find((s) => s.symbol === name);
}

function decimalsFor(symbol) {
  return symbol.includes("JPY") ? 3 : 5;
}

// ---------- Tabs ----------

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

// ---------- Ticker strip ----------

function renderTicker() {
  const ticker = document.getElementById("ticker");
  ticker.innerHTML = state.symbols
    .map(
      (s) => `
      <div class="ticker-item" data-symbol="${s.symbol}">
        <span class="sym">${s.symbol}</span>
        <span class="px mono" data-field="bid">${fmt(s.bid, decimalsFor(s.symbol))}</span>
      </div>`
    )
    .join("");
}

function flashPrice(el, direction) {
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth;
  el.classList.add(direction === "up" ? "flash-up" : "flash-down");
  setTimeout(() => el.classList.remove("flash-up", "flash-down"), 500);
}

// ---------- Watchlist (dashboard) ----------

function renderWatchlist() {
  const tbody = document.querySelector("#watchlist-table tbody");
  tbody.innerHTML = state.symbols
    .map((s) => {
      const dp = decimalsFor(s.symbol);
      let chgHtml = `<span class="muted">—</span>`;
      if (s.bid !== null && s.openBid) {
        const chgPct = ((s.bid - s.openBid) / s.openBid) * 100;
        const chgClass = chgPct >= 0 ? "pos" : "neg";
        const chgSign = chgPct >= 0 ? "+" : "";
        chgHtml = `<span class="mono ${chgClass}">${chgSign}${chgPct.toFixed(2)}%</span>`;
      }
      return `
        <tr>
          <td>${s.symbol}</td>
          <td class="mono">${fmt(s.bid, dp)}</td>
          <td class="mono">${fmt(s.ask, dp)}</td>
          <td>${chgHtml}</td>
        </tr>`;
    })
    .join("");
}

// ---------- Markets tab ----------

function renderMarkets(filter = "") {
  const tbody = document.querySelector("#markets-table tbody");
  const rows = state.symbols.filter((s) =>
    s.symbol.toLowerCase().includes(filter.toLowerCase())
  );
  tbody.innerHTML = rows
    .map((s) => {
      const dp = decimalsFor(s.symbol);
      const spread = s.bid !== null
        ? ((s.ask - s.bid) * (s.symbol.includes("JPY") ? 100 : 10000)).toFixed(1)
        : "—";
      let chgHtml = `<span class="muted">—</span>`;
      if (s.bid !== null && s.openBid) {
        const chgPct = ((s.bid - s.openBid) / s.openBid) * 100;
        const chgClass = chgPct >= 0 ? "pos" : "neg";
        const chgSign = chgPct >= 0 ? "+" : "";
        chgHtml = `<span class="mono ${chgClass}">${chgSign}${chgPct.toFixed(2)}%</span>`;
      }
      return `
        <tr>
          <td>${s.symbol}</td>
          <td class="mono">${fmt(s.bid, dp)}</td>
          <td class="mono">${fmt(s.ask, dp)}</td>
          <td class="mono muted">${spread}</td>
          <td>${chgHtml}</td>
          <td><button class="row-btn" data-goto-trade="${s.symbol}">Trade</button></td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-goto-trade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector('.tab[data-tab="trade"]').click();
      setTradeSymbol(btn.dataset.gotoTrade);
    });
  });
}

// ---------- Positions (real account only) ----------

function renderPositions() {
  const tbody = document.querySelector("#positions-table tbody");
  const dashTbody = document.querySelector("#dash-positions-table tbody");
  const empty = document.getElementById("positions-empty");
  const badge = document.getElementById("positions-badge");
  const dashCount = document.getElementById("pos-count");

  badge.textContent = state.positions.length;
  dashCount.textContent = state.positions.length;
  empty.style.display = state.positions.length ? "none" : "block";
  empty.textContent = window.realAccountId
    ? "No open positions on this account right now."
    : "Connect your cTrader account (Account tab) to see your open positions here.";

  tbody.innerHTML = state.positions
    .map((pos) => {
      const dp = decimalsFor(pos.symbol);
      const plClass = pos.pl >= 0 ? "pos" : "neg";
      const sideClass = pos.side === "BUY" ? "side-buy" : "side-sell";
      return `
        <tr>
          <td>${pos.symbol}</td>
          <td class="${sideClass}">${pos.side}</td>
          <td class="mono">${pos.volume.toFixed(2)}</td>
          <td class="mono">${fmt(pos.openPrice, dp)}</td>
          <td class="mono">${fmt(pos.currentPrice, dp)}</td>
          <td class="mono muted">${pos.sl ? fmt(pos.sl, dp) : "—"}</td>
          <td class="mono muted">${pos.tp ? fmt(pos.tp, dp) : "—"}</td>
          <td class="mono ${plClass}">${fmtMoney(pos.pl)}</td>
          <td><span class="muted" style="font-size:11px;">via cTrader</span></td>
        </tr>`;
    })
    .join("");

  dashTbody.innerHTML = state.positions
    .map((pos) => {
      const plClass = pos.pl >= 0 ? "pos" : "neg";
      const sideClass = pos.side === "BUY" ? "side-buy" : "side-sell";
      return `
        <tr>
          <td>${pos.symbol}</td>
          <td class="${sideClass}">${pos.side}</td>
          <td class="mono">${pos.volume.toFixed(2)}</td>
          <td class="mono ${plClass}">${fmtMoney(pos.pl)}</td>
        </tr>`;
    })
    .join("");

  renderSummary();
}

function renderSummary() {
  const totalPL = state.positions.reduce((sum, p) => sum + (p.pl || 0), 0);

  if (!window.realAccountId) {
    document.getElementById("stat-balance").textContent = "—";
    document.getElementById("stat-equity").textContent = "—";
    document.getElementById("stat-margin").textContent = "—";
    document.getElementById("stat-pl").textContent = "—";
    return;
  }

  document.getElementById("stat-pl").textContent = fmtMoney(totalPL);
  const plEl = document.getElementById("stat-pl");
  plEl.classList.toggle("pos", totalPL >= 0);
  plEl.classList.toggle("neg", totalPL < 0);
}

// ---------- History ----------

function renderHistory() {
  const tbody = document.querySelector("#history-table tbody");
  const empty = document.getElementById("history-empty");
  tbody.innerHTML = "";
  empty.style.display = "block";
}

// ---------- Trade ticket ----------

function populateTicketSymbols() {
  const select = document.getElementById("ticket-symbol");
  select.innerHTML = state.symbols
    .map((s) => `<option value="${s.symbol}">${s.symbol}</option>`)
    .join("");
  select.value = state.activeTradeSymbol;
  select.addEventListener("change", () => setTradeSymbol(select.value));
}

function setTradeSymbol(symbolName) {
  state.activeTradeSymbol = symbolName;
  document.getElementById("ticket-symbol").value = symbolName;
  document.getElementById("trade-symbol-title").textContent = symbolName;
  updateTicketPrices();
  refreshChart();
}

function updateTicketPrices() {
  const sym = getSymbol(state.activeTradeSymbol);
  if (!sym) return;
  const dp = decimalsFor(sym.symbol);
  document.getElementById("ticket-bid").textContent = fmt(sym.bid, dp);
  document.getElementById("ticket-ask").textContent = fmt(sym.ask, dp);
  document.getElementById("trade-symbol-price").textContent = fmt(sym.bid, dp);
}

function initOrderTypeSegmented() {
  const seg = document.getElementById("order-type-segmented");
  const entryRow = document.getElementById("entry-price-row");
  seg.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.orderType = btn.dataset.value;
      entryRow.style.display = state.orderType === "MARKET" ? "none" : "block";
    });
  });
}

function initTimeframeSegmented() {
  const seg = document.getElementById("timeframe-segmented");
  if (!seg) return;
  seg.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.timeframe = btn.dataset.tf;
      refreshChart();
    });
  });
}

function initOrderButtons() {
  document.getElementById("btn-buy").addEventListener("click", () => submitOrder("BUY"));
  document.getElementById("btn-sell").addEventListener("click", () => submitOrder("SELL"));
  document.getElementById("ticket-buy-box").addEventListener("click", () => submitOrder("BUY"));
  document.getElementById("ticket-sell-box").addEventListener("click", () => submitOrder("SELL"));
}

async function submitOrder(side) {
  const note = document.getElementById("ticket-note");

  if (!window.realAccountId) {
    note.textContent = "Connect your cTrader account (Account tab) before placing orders.";
    note.classList.add("neg");
    setTimeout(() => note.classList.remove("neg"), 3000);
    return;
  }

  const volume = parseFloat(document.getElementById("ticket-volume").value) || 0.1;

  note.textContent = `Sending ${side} order...`;

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ctidTraderAccountId: window.realAccountId,
        symbol: state.activeTradeSymbol,
        side,
        orderType: state.orderType,
        volume,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      note.textContent = "Order failed: " + (errData.error || res.status);
      note.classList.add("neg");
      return;
    }

    note.textContent = `${side} order sent for ${volume} lots ${state.activeTradeSymbol}.`;
    note.classList.add(side === "BUY" ? "pos" : "neg");
    pollPositions();
  } catch (err) {
    note.textContent = "Error: " + err.message;
    note.classList.add("neg");
  }

  setTimeout(() => {
    note.textContent = "Connected — orders placed here go to your real account.";
    note.classList.remove("pos", "neg");
  }, 4000);
}

// ---------- Chart: candle drawing ----------

function drawCandles(candles) {
  const svg = document.getElementById("chart-svg");
  const scrollBox = document.getElementById("chart-scroll");

  if (!candles.length) {
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", CHART_HEIGHT);
    svg.innerHTML = `<text x="20" y="${CHART_HEIGHT / 2}" fill="#7C8494" font-size="13">No chart data available yet.</text>`;
    return;
  }

  const allValues = candles.flatMap((c) => [c.high, c.low]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const step = CANDLE_WIDTH + CANDLE_GAP;
  const totalWidth = Math.max(candles.length * step + 20, 600);

  svg.setAttribute("width", totalWidth);
  svg.setAttribute("height", CHART_HEIGHT);

  const pad = 12;
  const priceToY = (p) => CHART_HEIGHT - pad - ((p - min) / range) * (CHART_HEIGHT - pad * 2);

  let svgContent = "";
  candles.forEach((c, i) => {
    const x = 10 + i * step;
    const isUp = c.close >= c.open;
    const color = isUp ? "#1FBF83" : "#F0554A";
    const yHigh = priceToY(c.high);
    const yLow = priceToY(c.low);
    const yOpen = priceToY(c.open);
    const yClose = priceToY(c.close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

    svgContent += `<line x1="${x + CANDLE_WIDTH / 2}" y1="${yHigh}" x2="${x + CANDLE_WIDTH / 2}" y2="${yLow}" stroke="${color}" stroke-width="1" />`;
    svgContent += `<rect x="${x}" y="${bodyTop}" width="${CANDLE_WIDTH}" height="${bodyHeight}" fill="${color}" />`;
  });

  svg.innerHTML = svgContent;

  if (scrollBox) {
    scrollBox.scrollLeft = scrollBox.scrollWidth;
  }
}

// Charts are pure market data, so they always come from the public feed
// regardless of whether a user is logged in.
async function refreshChart() {
  const svg = document.getElementById("chart-svg");
  const symbolName = state.activeTradeSymbol;
  const timeframe = state.timeframe;

  try {
    const res = await fetch(
      `/api/public/trendbars?symbol=${encodeURIComponent(symbolName)}&period=${timeframe}`,
      { credentials: "include" }
    );
    if (!res.ok) throw new Error("Trendbars request failed: " + res.status);
    const data = await res.json();
    const bars = data.trendbar || [];

    if (!bars.length) {
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", CHART_HEIGHT);
      svg.innerHTML = `<text x="20" y="${CHART_HEIGHT / 2}" fill="#7C8494" font-size="13">No candle data yet for ${symbolName} (${timeframe}).</text>`;
      return;
    }

    const divisor = symbolName.includes("JPY") ? 1000 : 100000;
    const candles = bars.map((b) => {
      const low = b.low / divisor;
      const open = low + b.deltaOpen / divisor;
      const high = low + b.deltaHigh / divisor;
      const close = low + b.deltaClose / divisor;
      return { open, high, low, close };
    });

    drawCandles(candles);
  } catch (err) {
    console.error("refreshChart error:", err);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", CHART_HEIGHT);
    svg.innerHTML = `<text x="20" y="${CHART_HEIGHT / 2}" fill="#F0554A" font-size="13">Chart error: ${err.message}</text>`;
  }
}

// Prices are pure market data too — always pull from the public feed,
// regardless of login state. Login only matters for positions/orders.
async function pollLivePrices() {
  try {
    const res = await fetch(`/api/public/live-prices`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const prices = data.prices || {};

    if (Object.keys(prices).length === 0) return;

    Object.entries(prices).forEach(([code, spot]) => {
      const displayName = code.length === 6 ? `${code.slice(0, 3)}/${code.slice(3)}` : code;
      const sym = getSymbol(displayName);
      if (!sym) return;
      const dp = decimalsFor(displayName);
      const divisor = displayName.includes("JPY") ? 1000 : 100000;

      const prevBid = sym.bid;
      sym.bid = Number((spot.bid / divisor).toFixed(dp));
      sym.ask = Number((spot.ask / divisor).toFixed(dp));
      if (sym.openBid === null) sym.openBid = sym.bid;

      const tickerEl = document.querySelector(`.ticker-item[data-symbol="${displayName}"] .px`);
      if (tickerEl) {
        tickerEl.textContent = fmt(sym.bid, dp);
        if (prevBid !== null) flashPrice(tickerEl, sym.bid >= prevBid ? "up" : "down");
      }
    });

    renderWatchlist();
    renderMarkets(document.getElementById("market-search").value);
    updateTicketPrices();
  } catch (err) {
    console.error("pollLivePrices error:", err);
  }
}

// ---------- Positions polling (real account only) ----------

async function pollPositions() {
  if (!window.realAccountId) {
    state.positions = [];
    renderPositions();
    return;
  }

  try {
    const res = await fetch(`/api/positions?accountId=${window.realAccountId}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    state.positions = data.positions || [];
    renderPositions();
  } catch (err) {
    console.error("pollPositions error:", err);
  }
}

// ---------- Init ----------

function init() {
  initTabs();
  renderTicker();
  renderWatchlist();
  renderMarkets();
  renderPositions();
  renderHistory();
  populateTicketSymbols();
  initOrderTypeSegmented();
  initTimeframeSegmented();
  initOrderButtons();
  setTradeSymbol(state.activeTradeSymbol);

  document.getElementById("market-search").addEventListener("input", (e) => {
    renderMarkets(e.target.value);
  });

  pollLivePrices();
  setInterval(pollLivePrices, 2000);
  setInterval(pollPositions, 5000);
}

document.addEventListener("DOMContentLoaded", init);
// ===== Meridian ProFX — app logic =====

const state = {
  symbols: JSON.parse(JSON.stringify(MOCK_SYMBOLS)),
  positions: JSON.parse(JSON.stringify(MOCK_POSITIONS)),
  history: MOCK_HISTORY,
  activeTradeSymbol: "EUR/USD",
  orderType: "MARKET",
  timeframe: "M1",
};

const CANDLE_WIDTH = 10;
const CANDLE_GAP = 4;
const CHART_HEIGHT = 320;

const fmt = (n, dp = 5) => Number(n).toFixed(dp);
const fmtMoney = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2);

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
      const chgClass = s.changePct >= 0 ? "pos" : "neg";
      const chgSign = s.changePct >= 0 ? "+" : "";
      return `
        <tr>
          <td>${s.symbol}</td>
          <td class="mono">${fmt(s.bid, dp)}</td>
          <td class="mono">${fmt(s.ask, dp)}</td>
          <td class="mono ${chgClass}">${chgSign}${s.changePct.toFixed(2)}%</td>
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
      const spread = ((s.ask - s.bid) * (s.symbol.includes("JPY") ? 100 : 10000)).toFixed(1);
      const chgClass = s.changePct >= 0 ? "pos" : "neg";
      const chgSign = s.changePct >= 0 ? "+" : "";
      return `
        <tr>
          <td>${s.symbol}</td>
          <td class="mono">${fmt(s.bid, dp)}</td>
          <td class="mono">${fmt(s.ask, dp)}</td>
          <td class="mono muted">${spread}</td>
          <td class="mono ${chgClass}">${chgSign}${s.changePct.toFixed(2)}%</td>
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

// ---------- Positions ----------

function calcPL(pos) {
  const sym = getSymbol(pos.symbol);
  if (!sym) return 0;
  const current = pos.side === "BUY" ? sym.bid : sym.ask;
  const diff = pos.side === "BUY" ? current - pos.openPrice : pos.openPrice - current;
  const pipFactor = pos.symbol.includes("JPY") ? 100 : 10000;
  const pips = diff * pipFactor;
  return pips * pos.volume * 10;
}

function renderPositions() {
  const tbody = document.querySelector("#positions-table tbody");
  const dashTbody = document.querySelector("#dash-positions-table tbody");
  const empty = document.getElementById("positions-empty");
  const badge = document.getElementById("positions-badge");
  const dashCount = document.getElementById("pos-count");

  badge.textContent = state.positions.length;
  dashCount.textContent = state.positions.length;
  empty.style.display = state.positions.length ? "none" : "block";

  tbody.innerHTML = state.positions
    .map((pos) => {
      const sym = getSymbol(pos.symbol);
      const dp = decimalsFor(pos.symbol);
      const current = sym ? (pos.side === "BUY" ? sym.bid : sym.ask) : pos.openPrice;
      const pl = calcPL(pos);
      const plClass = pl >= 0 ? "pos" : "neg";
      const sideClass = pos.side === "BUY" ? "side-buy" : "side-sell";
      return `
        <tr>
          <td>${pos.symbol}</td>
          <td class="${sideClass}">${pos.side}</td>
          <td class="mono">${pos.volume.toFixed(2)}</td>
          <td class="mono">${fmt(pos.openPrice, dp)}</td>
          <td class="mono">${fmt(current, dp)}</td>
          <td class="mono muted">${pos.sl ? fmt(pos.sl, dp) : "—"}</td>
          <td class="mono muted">${pos.tp ? fmt(pos.tp, dp) : "—"}</td>
          <td class="mono ${plClass}">${fmtMoney(pl)}</td>
          <td><button class="close-btn" data-close="${pos.id}">Close</button></td>
        </tr>`;
    })
    .join("");

  dashTbody.innerHTML = state.positions
    .map((pos) => {
      const pl = calcPL(pos);
      const plClass = pl >= 0 ? "pos" : "neg";
      const sideClass = pos.side === "BUY" ? "side-buy" : "side-sell";
      return `
        <tr>
          <td>${pos.symbol}</td>
          <td class="${sideClass}">${pos.side}</td>
          <td class="mono">${pos.volume.toFixed(2)}</td>
          <td class="mono ${plClass}">${fmtMoney(pl)}</td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.positions = state.positions.filter((p) => p.id !== btn.dataset.close);
      renderPositions();
      renderSummary();
    });
  });

  renderSummary();
}

function renderSummary() {
  const totalPL = state.positions.reduce((sum, p) => sum + calcPL(p), 0);
  const balance = 10000;
  const equity = balance + totalPL;

  document.getElementById("stat-balance").textContent = balance.toFixed(2);
  document.getElementById("stat-equity").textContent = equity.toFixed(2);
  document.getElementById("stat-margin").textContent = (state.positions.length * 104.13).toFixed(2);

  const plEl = document.getElementById("stat-pl");
  plEl.textContent = fmtMoney(totalPL);
  plEl.classList.toggle("pos", totalPL >= 0);
  plEl.classList.toggle("neg", totalPL < 0);
}

// ---------- History ----------

function renderHistory() {
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = state.history
    .map((h) => {
      const dp = h.symbol.includes("JPY") ? 3 : 5;
      const plClass = h.pl >= 0 ? "pos" : "neg";
      const sideClass = h.side === "BUY" ? "side-buy" : "side-sell";
      return `
        <tr>
          <td class="mono muted">${h.date}</td>
          <td>${h.symbol}</td>
          <td class="${sideClass}">${h.side}</td>
          <td class="mono">${h.volume.toFixed(2)}</td>
          <td class="mono">${fmt(h.open, dp)}</td>
          <td class="mono">${fmt(h.close, dp)}</td>
          <td class="mono ${plClass}">${fmtMoney(h.pl)}</td>
        </tr>`;
    })
    .join("");
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

function submitOrder(side) {
  const sym = getSymbol(state.activeTradeSymbol);
  const volume = parseFloat(document.getElementById("ticket-volume").value) || 0.1;
  const sl = parseFloat(document.getElementById("ticket-sl").value) || null;
  const tp = parseFloat(document.getElementById("ticket-tp").value) || null;

  if (!sym) return;

  const openPrice = side === "BUY" ? sym.ask : sym.bid;

  state.positions.push({
    id: "p" + Date.now(),
    symbol: sym.symbol,
    side,
    volume,
    openPrice,
    sl,
    tp,
  });

  renderPositions();

  const note = document.getElementById("ticket-note");
  note.textContent = `Mock ${side} order filled — ${volume} lots ${sym.symbol} @ ${fmt(openPrice, decimalsFor(sym.symbol))}. This is demo mode, no live order was sent.`;
  note.classList.add(side === "BUY" ? "pos" : "neg");
  setTimeout(() => {
    note.textContent = "Demo mode — no live order will be sent.";
    note.classList.remove("pos", "neg");
  }, 3000);
}

// ---------- Chart: shared candle-drawing helper ----------

function drawCandles(candles) {
  const svg = document.getElementById("chart-svg");
  const scrollBox = document.getElementById("chart-scroll");

  if (!candles.length) {
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", CHART_HEIGHT);
    svg.innerHTML = `<text x="20" y="${CHART_HEIGHT / 2}" fill="#7C8494" font-size="13">No chart data available.</text>`;
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

// ---------- Chart: mock (random walk) — only used if the public feed itself fails ----------

let chartHistory = {};

function renderMockChart(symbolName) {
  if (!chartHistory[symbolName]) {
    const sym = getSymbol(symbolName);
    const points = [];
    let price = sym.bid;
    for (let i = 0; i < 80; i++) {
      const open = price;
      price += (Math.random() - 0.5) * price * 0.0006;
      const close = price;
      const high = Math.max(open, close) + Math.random() * price * 0.0002;
      const low = Math.min(open, close) - Math.random() * price * 0.0002;
      points.push({ open, high, low, close });
    }
    chartHistory[symbolName] = points;
  }
  drawCandles(chartHistory[symbolName]);
}

// ---------- Chart: real candlesticks (public feed by default, or user's own account if connected) ----------

async function renderRealCandles(symbolName, timeframe) {
  const svg = document.getElementById("chart-svg");
  try {
    const endpoint = window.realAccountId
      ? `/api/trendbars?accountId=${window.realAccountId}&symbol=${encodeURIComponent(symbolName)}&period=${timeframe}`
      : `/api/public/trendbars?symbol=${encodeURIComponent(symbolName)}&period=${timeframe}`;

    const res = await fetch(endpoint, { credentials: "include" });
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
    console.error("renderRealCandles error, falling back to mock:", err);
    renderMockChart(symbolName);
  }
}

function refreshChart() {
  renderRealCandles(state.activeTradeSymbol, state.timeframe);
}

// ---------- Live price polling — public feed by default, user's own if connected ----------

async function pollLivePrices() {
  try {
    const endpoint = window.realAccountId
      ? `/api/live-prices?accountId=${window.realAccountId}`
      : `/api/public/live-prices`;

    const res = await fetch(endpoint, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const prices = data.prices || {};

    if (Object.keys(prices).length === 0) return; // nothing yet, keep last known values

    Object.entries(prices).forEach(([code, spot]) => {
      const displayName = code.length === 6 ? `${code.slice(0, 3)}/${code.slice(3)}` : code;
      const sym = getSymbol(displayName);
      if (!sym) return;
      const dp = decimalsFor(displayName);
      const divisor = displayName.includes("JPY") ? 1000 : 100000;
      const prevBid = sym.bid;
      sym.bid = Number((spot.bid / divisor).toFixed(dp));
      sym.ask = Number((spot.ask / divisor).toFixed(dp));

      const tickerEl = document.querySelector(`.ticker-item[data-symbol="${displayName}"] .px`);
      if (tickerEl) {
        tickerEl.textContent = fmt(sym.bid, dp);
        flashPrice(tickerEl, sym.bid >= prevBid ? "up" : "down");
      }
    });

    renderWatchlist();
    renderMarkets(document.getElementById("market-search").value);
    updateTicketPrices();
    renderPositions();
  } catch (err) {
    console.error("pollLivePrices error:", err);
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

  setInterval(pollLivePrices, 2000);
}

document.addEventListener("DOMContentLoaded", init);
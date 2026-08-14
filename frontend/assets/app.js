// ===== Meridian ProFX — app logic (mock mode) =====

const state = {
  symbols: JSON.parse(JSON.stringify(MOCK_SYMBOLS)),
  positions: JSON.parse(JSON.stringify(MOCK_POSITIONS)),
  history: MOCK_HISTORY,
  activeTradeSymbol: "EUR/USD",
  orderType: "MARKET",
};

const fmt = (n, dp = 5) => Number(n).toFixed(dp);
const fmtMoney = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2);

function getSymbol(name) {
  return state.symbols.find((s) => s.symbol === name);
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

function decimalsFor(symbol) {
  return symbol.includes("JPY") ? 3 : 5;
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
  renderMockChart(symbolName);
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

// ---------- Mock chart ----------

let chartHistory = {};

function renderMockChart(symbolName) {
  const svg = document.getElementById("chart-svg");
  if (!chartHistory[symbolName]) {
    const sym = getSymbol(symbolName);
    const points = [];
    let price = sym.bid;
    for (let i = 0; i < 60; i++) {
      price += (Math.random() - 0.5) * price * 0.0006;
      points.push(price);
    }
    chartHistory[symbolName] = points;
  }

  const points = chartHistory[symbolName];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const w = 600, h = 200, pad = 10;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastUp = points[points.length - 1] >= points[0];
  const stroke = lastUp ? "#1FBF83" : "#F0554A";

  svg.innerHTML = `
    <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" />
  `;
}

function pushChartTick(symbolName, newPrice) {
  if (!chartHistory[symbolName]) return;
  chartHistory[symbolName].push(newPrice);
  chartHistory[symbolName].shift();
  if (state.activeTradeSymbol === symbolName) renderMockChart(symbolName);
}

// ---------- Mock live price engine ----------

function tickPrices() {
  state.symbols.forEach((s) => {
    const dp = decimalsFor(s.symbol);
    const pipSize = dp === 3 ? 0.001 : 0.00001;
    const moveDir = Math.random() < 0.5 ? -1 : 1;
    const moveAmount = moveDir * pipSize * (1 + Math.floor(Math.random() * 3));

    const prevBid = s.bid;
    s.bid = Number((s.bid + moveAmount).toFixed(dp));
    s.ask = Number((s.bid + (dp === 3 ? 0.016 : 0.00012)).toFixed(dp));

    const tickerEl = document.querySelector(`.ticker-item[data-symbol="${s.symbol}"] .px`);
    if (tickerEl) {
      tickerEl.textContent = fmt(s.bid, dp);
      flashPrice(tickerEl, s.bid >= prevBid ? "up" : "down");
    }

    pushChartTick(s.symbol, s.bid);
  });

  renderWatchlist();
  renderMarkets(document.getElementById("market-search").value);
  updateTicketPrices();
  renderPositions();
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
  initOrderButtons();
  setTradeSymbol(state.activeTradeSymbol);

  document.getElementById("market-search").addEventListener("input", (e) => {
    renderMarkets(e.target.value);
  });

  setInterval(tickPrices, 1800);
}

document.addEventListener("DOMContentLoaded", init);
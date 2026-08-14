// ===== Meridian ProFX — mock data (replace with live cTrader feed later) =====

const MOCK_SYMBOLS = [
  { symbol: "EUR/USD", bid: 1.08415, ask: 1.08427, changePct: 0.12 },
  { symbol: "GBP/USD", bid: 1.27183, ask: 1.27201, changePct: -0.08 },
  { symbol: "USD/JPY", bid: 149.812, ask: 149.828, changePct: 0.24 },
  { symbol: "USD/CHF", bid: 0.88034, ask: 0.88051, changePct: -0.03 },
  { symbol: "AUD/USD", bid: 0.66142, ask: 0.66158, changePct: 0.31 },
  { symbol: "USD/CAD", bid: 1.35921, ask: 1.35939, changePct: -0.11 },
  { symbol: "NZD/USD", bid: 0.60312, ask: 0.60330, changePct: 0.05 },
  { symbol: "EUR/GBP", bid: 0.85241, ask: 0.85259, changePct: 0.02 },
];

const MOCK_POSITIONS = [
  {
    id: "p1",
    symbol: "EUR/USD",
    side: "BUY",
    volume: 0.50,
    openPrice: 1.08210,
    sl: 1.07900,
    tp: 1.08900,
  },
  {
    id: "p2",
    symbol: "GBP/USD",
    side: "SELL",
    volume: 0.25,
    openPrice: 1.27430,
    sl: 1.27800,
    tp: 1.26900,
  },
  {
    id: "p3",
    symbol: "USD/JPY",
    side: "BUY",
    volume: 0.10,
    openPrice: 149.520,
    sl: null,
    tp: 150.200,
  },
];

const MOCK_HISTORY = [
  { date: "2026-08-13", symbol: "EUR/USD", side: "BUY", volume: 0.30, open: 1.08050, close: 1.08310, pl: 78.00 },
  { date: "2026-08-13", symbol: "USD/CAD", side: "SELL", volume: 0.20, open: 1.36210, close: 1.36040, pl: 34.00 },
  { date: "2026-08-12", symbol: "GBP/USD", side: "BUY", volume: 0.40, open: 1.27050, close: 1.26890, pl: -64.00 },
  { date: "2026-08-11", symbol: "AUD/USD", side: "SELL", volume: 0.50, open: 0.66410, close: 0.66190, pl: 110.00 },
  { date: "2026-08-10", symbol: "EUR/USD", side: "SELL", volume: 0.25, open: 1.08620, close: 1.08710, pl: -22.50 },
];
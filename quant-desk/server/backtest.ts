import type { Candle } from "./market";

export interface Trade {
  entryDate: string;
  exitDate: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  returnPct: number;
  reason: string;
  bars: number;
}

export interface Metrics {
  numTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturnPct: number;
  avgReturnPct: number;
  maxDDPct: number;
}

// Signal on bar i -> enter at OPEN of bar i+1. ATR-based SL/TP. No overlapping trades.
export function backtest(
  c: Candle[],
  longE: boolean[],
  shortE: boolean[],
  atrArr: number[],
  slAtr = 1.5,
  tpAtr = 3,
  maxHold = 20,
  allowShort = true
): Trade[] {
  const n = c.length;
  const trades: Trade[] = [];
  let i = 0;
  while (i < n - 1) {
    const dir = longE[i] ? 1 : shortE[i] && allowShort ? -1 : 0;
    if (dir === 0) { i++; continue; }
    const ei = i + 1;
    const ep = c[ei].open;
    const av = atrArr[i];
    if (!isFinite(av) || av <= 0 || !isFinite(ep)) { i++; continue; }
    let sl: number, tp: number;
    if (dir === 1) { sl = ep - slAtr * av; tp = ep + tpAtr * av; }
    else { sl = ep + slAtr * av; tp = ep - tpAtr * av; }

    let xp = NaN, xi = -1, reason = "";
    const end = Math.min(ei + maxHold, n);
    for (let j = ei; j < end; j++) {
      const hh = c[j].high, ll = c[j].low;
      if (dir === 1) {
        if (ll <= sl) { xp = sl; xi = j; reason = "SL"; break; }
        if (hh >= tp) { xp = tp; xi = j; reason = "TP"; break; }
      } else {
        if (hh >= sl) { xp = sl; xi = j; reason = "SL"; break; }
        if (ll <= tp) { xp = tp; xi = j; reason = "TP"; break; }
      }
    }
    if (xi === -1) { xi = end - 1; xp = c[xi].close; reason = "TIME"; }

    const ret = dir === 1 ? (xp - ep) / ep : (ep - xp) / ep;
    trades.push({
      entryDate: c[ei].date,
      exitDate: c[xi].date,
      direction: dir === 1 ? "LONG" : "SHORT",
      entry: ep,
      exit: xp,
      returnPct: ret * 100,
      reason,
      bars: xi - ei,
    });
    i = xi + 1;
  }
  return trades;
}

export function metrics(t: Trade[]): Metrics {
  if (!t.length)
    return { numTrades: 0, winRate: 0, profitFactor: 0, totalReturnPct: 0, avgReturnPct: 0, maxDDPct: 0 };
  const r = t.map((x) => x.returnPct);
  const wins = r.filter((x) => x > 0);
  const losses = r.filter((x) => x <= 0);
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = -losses.reduce((a, b) => a + b, 0);
  const pf = gl > 0 ? gp / gl : gp > 0 ? 999 : 0;
  let eq = 1, peak = 1, dd = 0;
  for (const x of r) {
    eq *= 1 + x / 100;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq / peak - 1);
  }
  return {
    numTrades: t.length,
    winRate: +((wins.length / t.length) * 100).toFixed(1),
    profitFactor: +pf.toFixed(2),
    totalReturnPct: +((eq - 1) * 100).toFixed(1),
    avgReturnPct: +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2),
    maxDDPct: +(dd * 100).toFixed(1),
  };
}

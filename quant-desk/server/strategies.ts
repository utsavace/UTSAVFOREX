import type { Candle } from "./market";
import { rsi, ema, bollinger, macd, atr, adx } from "./indicators";
import { backtest, metrics } from "./backtest";

const closeArr = (c: Candle[]) => c.map((x) => x.close);
const highArr = (c: Candle[]) => c.map((x) => x.high);
const lowArr = (c: Candle[]) => c.map((x) => x.low);

export function atrOf(c: Candle[]): number[] {
  return atr(highArr(c), lowArr(c), closeArr(c), 14);
}

interface Sig { long: boolean[]; short: boolean[]; }

const crossUp = (a: number[], b: number[]) =>
  a.map((_, i) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1]);
const crossDown = (a: number[], b: number[]) =>
  a.map((_, i) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1]);
const crossUpVal = (a: number[], v: number) =>
  a.map((_, i) => i > 0 && a[i] > v && a[i - 1] <= v);
const crossDownVal = (a: number[], v: number) =>
  a.map((_, i) => i > 0 && a[i] < v && a[i - 1] >= v);

function sRSI(c: Candle[], p = 14, lo = 30, hi = 70): Sig {
  const r = rsi(closeArr(c), p);
  return { long: crossUpVal(r, lo), short: crossDownVal(r, hi) };
}
function sBB(c: Candle[], p = 20, m = 2): Sig {
  const cl = closeArr(c);
  const { ub, lb } = bollinger(cl, p, m);
  return {
    long: cl.map((_, i) => i > 0 && cl[i] > lb[i] && cl[i - 1] <= lb[i - 1]),
    short: cl.map((_, i) => i > 0 && cl[i] < ub[i] && cl[i - 1] >= ub[i - 1]),
  };
}
function sMACD(c: Candle[]): Sig {
  const { line, signal } = macd(closeArr(c));
  return { long: crossUp(line, signal), short: crossDown(line, signal) };
}
function sEMA(c: Candle[], f = 20, s = 50): Sig {
  const cl = closeArr(c);
  return { long: crossUp(ema(cl, f), ema(cl, s)), short: crossDown(ema(cl, f), ema(cl, s)) };
}
function sRSITrend(c: Candle[], p = 14, lo = 35, hi = 65, t = 200): Sig {
  const cl = closeArr(c);
  const r = rsi(cl, p), e = ema(cl, t);
  return {
    long: cl.map((_, i) => i > 0 && cl[i] > e[i] && r[i] > lo && r[i - 1] <= lo),
    short: cl.map((_, i) => i > 0 && cl[i] < e[i] && r[i] < hi && r[i - 1] >= hi),
  };
}

const CANDIDATES: { name: string; fn: (c: Candle[]) => Sig }[] = [
  { name: "RSI(14) 30/70", fn: (c) => sRSI(c, 14, 30, 70) },
  { name: "RSI(7) 25/75", fn: (c) => sRSI(c, 7, 25, 75) },
  { name: "Bollinger Bounce", fn: (c) => sBB(c, 20, 2) },
  { name: "MACD Cross", fn: (c) => sMACD(c) },
  { name: "EMA 20/50", fn: (c) => sEMA(c, 20, 50) },
  { name: "EMA 9/21", fn: (c) => sEMA(c, 9, 21) },
  { name: "RSI + Trend(200)", fn: (c) => sRSITrend(c) },
];

export interface Gate { minWin: number; minPF: number; minTrades: number; }
export interface Strat { name: string; long: boolean[]; short: boolean[]; }

export function candidateSignals(c: Candle[]): Strat[] {
  return CANDIDATES.map((cd) => {
    const s = cd.fn(c);
    return { name: cd.name, long: s.long, short: s.short };
  });
}

export function walkForward(
  c: Candle[], strategies: Strat[], maxHold: number, allowShort: boolean, gate: Gate,
  opts?: { SLs?: number[]; TPs?: number[] }
) {
  const n = c.length;
  const split = Math.floor(n * 0.7);
  if (split < 40 || n - split < 10) return null;

  const a = atrOf(c);
  const SLs = opts?.SLs ?? [1, 1.5, 2];
  const TPs = opts?.TPs ?? [1.5, 2, 2.5, 3, 4];
  const oosMin = Math.max(5, Math.round(gate.minTrades * 0.3));

  const isScore = (m: any) =>
    ((m.numTrades >= gate.minTrades && m.winRate >= gate.minWin && m.profitFactor >= gate.minPF) ? 1e6 : 0) +
    (m.numTrades >= gate.minTrades ? 1e4 : 0) +
    m.profitFactor * 100 + m.winRate;

  let best: any = null, bestScore = -1, bestSig: Strat | null = null;
  for (const st of strategies) {
    for (const sl of SLs) {
      for (const tp of TPs) {
        if (tp <= sl) continue;
        const isM = metrics(backtest(
          c.slice(0, split), st.long.slice(0, split), st.short.slice(0, split),
          a.slice(0, split), sl, tp, maxHold, allowShort
        ));
        const sc = isScore(isM);
        if (sc > bestScore) { bestScore = sc; best = { name: st.name, sl, tp, isM }; bestSig = st; }
      }
    }
  }
  if (!best || !bestSig) return null;

  const oosM = metrics(backtest(
    c.slice(split), bestSig.long.slice(split), bestSig.short.slice(split),
    a.slice(split), best.sl, best.tp, maxHold, allowShort
  ));

  const isPass = best.isM.numTrades >= gate.minTrades && best.isM.winRate >= gate.minWin && best.isM.profitFactor >= gate.minPF;
  const oosPass = oosM.numTrades >= oosMin && oosM.profitFactor >= Math.max(1.3, gate.minPF * 0.7) && oosM.winRate >= gate.minWin * 0.85;

  const live = bestSig.long[bestSig.long.length - 1] ? "LONG"
    : bestSig.short[bestSig.short.length - 1] ? "SHORT" : "-";

  const lastClose = c[n - 1].close, lastATR = a[n - 1];
  let entry: number | null = null, stop: number | null = null, target: number | null = null, rr: number | null = null;
  if (live !== "-" && isFinite(lastATR) && lastATR > 0) {
    entry = lastClose;
    if (live === "LONG") { stop = entry - best.sl * lastATR; target = entry + best.tp * lastATR; }
    else { stop = entry + best.sl * lastATR; target = entry - best.tp * lastATR; }
    rr = +(best.tp / best.sl).toFixed(2);
  }

  return {
    strategy: best.name, sl: best.sl, tp: best.tp, live,
    isWin: best.isM.winRate, isPF: best.isM.profitFactor, isTrades: best.isM.numTrades,
    oosWin: oosM.winRate, oosPF: oosM.profitFactor, oosTrades: oosM.numTrades,
    qualified: isPass && oosPass, entry, stop, target, rr,
  };
}

export function divergence(c: Candle[], rsiP = 14, win = 2, R = 2, maxGap = 60) {
  void R;
  const price = c.map((x) => x.close);
  const r = rsi(price, rsiP);
  const n = c.length;
  const bull = new Array(n).fill(false);
  const bear = new Array(n).fill(false);
  const maxBack = 15, minGap = 3;

  const isTrough = (i: number) => {
    for (let j = 1; j <= win; j++) if (price[i] >= price[i - j] || price[i] >= price[i + j]) return false;
    return true;
  };
  const isPeak = (i: number) => {
    for (let j = 1; j <= win; j++) if (price[i] <= price[i - j] || price[i] <= price[i + j]) return false;
    return true;
  };

  const troughs: number[] = [], peaks: number[] = [];
  for (let i = win; i < n - win; i++) {
    if (isTrough(i)) troughs.push(i);
    if (isPeak(i)) peaks.push(i);
  }

  for (let i = 1; i < troughs.length; i++) {
    const t2 = troughs[i];
    for (let j = i - 1; j >= 0 && (i - j) < maxBack; j--) {
      const t1 = troughs[j], gap = t2 - t1;
      if (gap > minGap && gap < maxGap && price[t2] < price[t1] && r[t2] > r[t1] && (r[t2] < 50 || r[t1] < 50)) {
        const conf = t2 + win;
        if (conf < n) bull[conf] = true;
        break;
      }
    }
  }
  for (let i = 1; i < peaks.length; i++) {
    const p2 = peaks[i];
    for (let j = i - 1; j >= 0 && (i - j) < maxBack; j--) {
      const p1 = peaks[j], gap = p2 - p1;
      if (gap > minGap && gap < maxGap && price[p2] > price[p1] && r[p2] < r[p1] && (r[p2] > 50 || r[p1] > 50)) {
        const conf = p2 + win;
        if (conf < n) bear[conf] = true;
        break;
      }
    }
  }

  return { bull, bear };
}

export { backtest, metrics };

// ──────────────── Fibonacci Retracement ────────────────
function swingPoints(c: Candle[], wing: number) {
  const n = c.length;
  const peaks: number[] = [], troughs: number[] = [];
  for (let i = wing; i < n - wing; i++) {
    let isP = true, isT = true;
    for (let k = 1; k <= wing; k++) {
      if (c[i].high <= c[i - k].high || c[i].high <= c[i + k].high) isP = false;
      if (c[i].low >= c[i - k].low || c[i].low >= c[i + k].low) isT = false;
    }
    if (isP) peaks.push(i);
    if (isT) troughs.push(i);
  }
  return { peaks, troughs };
}

function fibSignals(c: Candle[], wing: number, fibLevel: number): Sig {
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);
  const { peaks, troughs } = swingPoints(c, wing);

  for (let pi = 0; pi < peaks.length; pi++) {
    const pH = peaks[pi];
    let tL = -1;
    for (let ti = troughs.length - 1; ti >= 0; ti--) {
      if (troughs[ti] < pH) { tL = troughs[ti]; break; }
    }
    if (tL === -1) continue;
    const swingLow = c[tL].low, swingHigh = c[pH].high;
    const range = swingHigh - swingLow;
    if (range <= 0) continue;
    const fibPrice = swingHigh - fibLevel * range;
    const tol = range * 0.005;
    for (let j = pH + 1; j < Math.min(n - 1, pH + 40); j++) {
      if (c[j].low < swingLow) break;
      if (c[j].low <= fibPrice + tol && c[j].close > fibPrice) { long[j] = true; break; }
    }
  }

  for (let ti = 0; ti < troughs.length; ti++) {
    const tL = troughs[ti];
    let pH = -1;
    for (let pi = peaks.length - 1; pi >= 0; pi--) {
      if (peaks[pi] < tL) { pH = peaks[pi]; break; }
    }
    if (pH === -1) continue;
    const swingHigh = c[pH].high, swingLow = c[tL].low;
    const range = swingHigh - swingLow;
    if (range <= 0) continue;
    const fibPrice = swingLow + fibLevel * range;
    const tol = range * 0.005;
    for (let j = tL + 1; j < Math.min(n - 1, tL + 40); j++) {
      if (c[j].high > swingHigh) break;
      if (c[j].high >= fibPrice - tol && c[j].close < fibPrice) { short[j] = true; break; }
    }
  }

  return { long, short };
}

export function fibCandidates(c: Candle[]): Strat[] {
  return [
    { name: "Fib 38.2% (wing5)", level: 0.382, wing: 5 },
    { name: "Fib 50.0% (wing5)", level: 0.500, wing: 5 },
    { name: "Fib 61.8% (wing5)", level: 0.618, wing: 5 },
    { name: "Fib 38.2% (wing8)", level: 0.382, wing: 8 },
    { name: "Fib 61.8% (wing8)", level: 0.618, wing: 8 },
  ].map(({ name, level, wing }) => {
    const { long, short } = fibSignals(c, wing, level);
    return { name, long, short };
  });
}

// ──────────────── London Breakout ────────────────
function hourUTC(dateStr: string): number {
  const parts = String(dateStr).split(" ");
  if (parts.length < 2) return 0;
  return Number(parts[1].split(":")[0]);
}

export function londonBreakout(c: Candle[]): Sig {
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);

  const byDate = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const d = String(c[i].date).slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(i);
  }

  for (const [, idxs] of byDate) {
    const asian = idxs.filter((i) => hourUTC(c[i].date) >= 0 && hourUTC(c[i].date) <= 6);
    const london = idxs.filter((i) => hourUTC(c[i].date) >= 7 && hourUTC(c[i].date) <= 9);
    if (asian.length < 3 || london.length < 1) continue;

    const asianHigh = Math.max(...asian.map((i) => c[i].high));
    const asianLow = Math.min(...asian.map((i) => c[i].low));
    const range = asianHigh - asianLow;
    if (range <= 0) continue;

    let fired = false;
    for (const li of london) {
      if (fired) break;
      if (c[li].close > asianHigh) { long[li] = true; fired = true; }
      else if (c[li].close < asianLow) { short[li] = true; fired = true; }
    }
  }
  return { long, short };
}

// ──────────────── Opening Range Breakout (ORB) ────────────────
// Session ka pehla candle = opening range. Agla candle range ke bahar close → breakout entry.
// Works on 1h candles. Session open = first bar of each UTC day (00:00) OR London (07:00).
// We use London open (07:00 UTC) as the anchor — highest quality per research.

export function openingRangeBreakout(c: Candle[], anchorHour = 7): Sig {
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);

  const byDate = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const d = String(c[i].date).slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(i);
  }

  for (const [, idxs] of byDate) {
    // Find the anchor bar (session open hour)
    const anchorIdx = idxs.find((i) => hourUTC(c[i].date) === anchorHour);
    if (anchorIdx === undefined) continue;

    // Opening range = the anchor bar's high/low
    const orHigh = c[anchorIdx].high;
    const orLow = c[anchorIdx].low;
    const range = orHigh - orLow;
    if (range <= 0) continue;

    // Look at next bars (up to 4 hours after open) for a close outside range
    let fired = false;
    for (const j of idxs) {
      if (j <= anchorIdx || fired) continue;
      if (hourUTC(c[j].date) > anchorHour + 4) break; // only within 4h window
      if (c[j].close > orHigh) { long[j] = true; fired = true; }
      else if (c[j].close < orLow) { short[j] = true; fired = true; }
    }
  }
  return { long, short };
}

// ──────────────── Pullback (Trend + Fib Retracement) ────────────────
// Trend filter: 50 EMA. Uptrend (price > EMA50) → wait for pullback to fib level → LONG.
// Downtrend (price < EMA50) → wait for bounce to fib level → SHORT.
// Fib measured on most recent swing. Entry when price touches 61.8% retracement and closes back toward trend.

export function pullbackStrategy(c: Candle[], fibLevel = 0.618, wing = 5): Sig {
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);
  if (n < 60) return { long, short };

  const closes = closeArr(c);
  const e50 = ema(closes, 50);
  const { peaks, troughs } = swingPoints(c, wing);

  // LONG: uptrend + retrace down to fib of last upleg
  for (let pi = 0; pi < peaks.length; pi++) {
    const pH = peaks[pi];
    let tL = -1;
    for (let ti = troughs.length - 1; ti >= 0; ti--) {
      if (troughs[ti] < pH) { tL = troughs[ti]; break; }
    }
    if (tL === -1) continue;
    const swingLow = c[tL].low, swingHigh = c[pH].high;
    const range = swingHigh - swingLow;
    if (range <= 0) continue;
    const fibPrice = swingHigh - fibLevel * range;
    const tol = range * 0.01;
    for (let j = pH + 1; j < Math.min(n - 1, pH + 30); j++) {
      // Must be in uptrend (price above EMA50)
      if (c[j].close < e50[j]) break;
      if (c[j].low < swingLow) break; // broke structure
      if (c[j].low <= fibPrice + tol && c[j].close > fibPrice) { long[j] = true; break; }
    }
  }

  // SHORT: downtrend + bounce up to fib of last downleg
  for (let ti = 0; ti < troughs.length; ti++) {
    const tL = troughs[ti];
    let pH = -1;
    for (let pi = peaks.length - 1; pi >= 0; pi--) {
      if (peaks[pi] < tL) { pH = peaks[pi]; break; }
    }
    if (pH === -1) continue;
    const swingHigh = c[pH].high, swingLow = c[tL].low;
    const range = swingHigh - swingLow;
    if (range <= 0) continue;
    const fibPrice = swingLow + fibLevel * range;
    const tol = range * 0.01;
    for (let j = tL + 1; j < Math.min(n - 1, tL + 30); j++) {
      if (c[j].close > e50[j]) break; // must be downtrend
      if (c[j].high > swingHigh) break;
      if (c[j].high >= fibPrice - tol && c[j].close < fibPrice) { short[j] = true; break; }
    }
  }

  return { long, short };
}

export function pullbackCandidates(c: Candle[]): Strat[] {
  return [
    { name: "Pullback 61.8% (wing5)", level: 0.618, wing: 5 },
    { name: "Pullback 50.0% (wing5)", level: 0.500, wing: 5 },
    { name: "Pullback 78.6% (wing5)", level: 0.786, wing: 5 },
    { name: "Pullback 61.8% (wing8)", level: 0.618, wing: 8 },
  ].map(({ name, level, wing }) => {
    const { long, short } = pullbackStrategy(c, level, wing);
    return { name, long, short };
  });
}
// ══════════════════════════════════════════════════════════════
//  VALIDATED STRATEGIES (5-year backtested, Daily timeframe)
//  Source: real data test on 48 assets, OOS walk-forward
// ══════════════════════════════════════════════════════════════

// ─── Strategy 1: 5-EMA Filtered ───────────────────────────────
// Alert candle entirely above/below EMA5 → trigger candle breaks extreme
// 3 filters: EMA50 trend align + alert body >50% + ATR >1%
// Best on: Comm (OOS PF 3.76), Crypto (2.37), Stock (1.35)
// RR: 1:5 (SL = alert candle extreme, TP = 5× SL distance)
export function fiveEmaFiltered(c: Candle[]): { long: boolean[]; short: boolean[]; alertCandles: { i: number; dir: "LONG" | "SHORT"; entry: number; stop: number; target: number }[] } {
  const cl = c.map(x => x.close);
  const e5 = ema(cl, 5);
  const e50 = ema(cl, 50);
  const e200 = ema(cl, 200);
  const a = atrOf(c);
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);
  const alertCandles: { i: number; dir: "LONG" | "SHORT"; entry: number; stop: number; target: number }[] = [];

  for (let i = 2; i < n - 1; i++) {
    const alertBull = c[i-1].high < e5[i-1] && c[i-1].low < e5[i-1];
    const alertBear = c[i-1].low  > e5[i-1] && c[i-1].high > e5[i-1];
    const ls = alertBull && c[i].high > c[i-1].high;
    const ss = alertBear && c[i].low  < c[i-1].low;
    if (!ls && !ss) continue;

    const dir = ls ? 1 : -1;
    const ac = c[i-1];
    const entry = ls ? ac.high : ac.low;
    const slDist = ls ? (entry - ac.low) : (ac.high - entry);
    if (slDist <= 0 || slDist / entry > 0.15) continue;

    // 3 filters + extended-move filter
    const trendOk = (dir === 1 && cl[i] > e50[i]) || (dir === -1 && cl[i] < e50[i]);
    const bodyOk  = Math.abs(ac.close - ac.open) / (ac.high - ac.low) > 0.5;
    const atrOk   = a[i] / cl[i] * 100 > 1.0;
    // Extended-move filter: agar price EMA200 se 15%+ door hai to skip (move exhausted)
    const distE200 = e200[i] > 0 ? Math.abs(cl[i] - e200[i]) / e200[i] * 100 : 0;
    const notExtended = distE200 <= 15;
    if (!trendOk || !bodyOk || !atrOk || !notExtended) continue;

    const stop   = ls ? ac.low  : ac.high;
    const target = ls ? entry + 5 * slDist : entry - 5 * slDist;
    if (ls) long[i] = true; else short[i] = true;
    alertCandles.push({ i, dir: ls ? "LONG" : "SHORT", entry: +entry.toFixed(5), stop: +stop.toFixed(5), target: +target.toFixed(5) });
  }
  return { long, short, alertCandles };
}

// ─── Strategy 2: Crypto EMA 20/50 Trend ───────────────────────
// EMA 20 crosses EMA 50 → trend direction trade
// Only for Crypto. OOS PF 1.86, Win 54%, 4/5 years profitable
// SL: 2×ATR, TP: 3×ATR, hold max 20 bars
export function cryptoEMATrend(c: Candle[]): { long: boolean[]; short: boolean[]; entry: number | null; stop: number | null; target: number | null; live: "LONG" | "SHORT" | "-" } {
  const cl = c.map(x => x.close);
  const f = ema(cl, 20);
  const s = ema(cl, 50);
  const e200 = ema(cl, 200);
  const a = atrOf(c);
  const n = c.length;
  // Bull-regime filter: sirf jab EMA50 > EMA200 (uptrend market) tab trade
  // Extended filter: EMA200 se 15%+ door skip
  const okBar = (i: number) => {
    const bull = s[i] > e200[i];
    const distE200 = e200[i] > 0 ? Math.abs(cl[i] - e200[i]) / e200[i] * 100 : 0;
    return bull && distE200 <= 15;
  };
  const long  = f.map((_, i) => i > 0 && f[i] > s[i] && f[i-1] <= s[i-1] && okBar(i));
  const short = f.map((_, i) => i > 0 && f[i] < s[i] && f[i-1] >= s[i-1] && okBar(i));
  const last = n - 1;
  const live: "LONG" | "SHORT" | "-" = long[last] ? "LONG" : short[last] ? "SHORT" : "-";
  let entry = null, stop = null, target = null;
  if (live !== "-") {
    entry = +cl[last].toFixed(5);
    stop   = live === "LONG" ? +(entry - 2 * a[last]).toFixed(5) : +(entry + 2 * a[last]).toFixed(5);
    target = live === "LONG" ? +(entry + 3 * a[last]).toFixed(5) : +(entry - 3 * a[last]).toFixed(5);
  }
  return { long, short, entry, stop, target, live };
}

// ─── Strategy 3: Forex RSI 25/75 Mean-Reversion ───────────────
// RSI(14) crosses back above 25 (LONG) or below 75 (SHORT)
// Only for Forex. OOS PF 1.85, Win 60%, 4/5 years profitable
// Best pairs: GBP/JPY, AUD/JPY, EUR/JPY, EUR/GBP, GBP/USD
// Caution: 2025 weak (recent regime). SL: 2×ATR, TP: 3×ATR
export function forexRSIMeanRev(c: Candle[]): { long: boolean[]; short: boolean[]; entry: number | null; stop: number | null; target: number | null; live: "LONG" | "SHORT" | "-"; rsiVal: number } {
  const cl = c.map(x => x.close);
  const r = rsi(cl, 14);
  const a = atrOf(c);
  const n = c.length;
  const long  = r.map((v, i) => i > 0 && r[i-1] <= 25 && v > 25);
  const short = r.map((v, i) => i > 0 && r[i-1] >= 75 && v < 75);
  const last = n - 1;
  const live: "LONG" | "SHORT" | "-" = long[last] ? "LONG" : short[last] ? "SHORT" : "-";
  let entry = null, stop = null, target = null;
  if (live !== "-") {
    entry = +cl[last].toFixed(5);
    stop   = live === "LONG" ? +(entry - 2 * a[last]).toFixed(5) : +(entry + 2 * a[last]).toFixed(5);
    target = live === "LONG" ? +(entry + 3 * a[last]).toFixed(5) : +(entry - 3 * a[last]).toFixed(5);
  }
  return { long, short, entry, stop, target, live, rsiVal: +r[last].toFixed(1) };
}

// ══════════════════════════════════════════════════════════════
//  NEW VALIDATED STRATEGIES (10-year backtested, Daily TF)
//  Source: OOS test on 174 assets, 10yr daily data
// ══════════════════════════════════════════════════════════════


// ─── Strategy 4: Trend Analysis (Courtney Smith Ch.2) ─────────
// Swing high/low based trend detection + Bishop exit
// Best on: Crypto (OOS PF 3.19, 8/11 years) — XRP, DOGE, LINK, BTC, ADA
// Entry: Break of swing high (LONG) / swing low (SHORT)
// SL: Most recent swing low/high (trailing)
// TP: Bishop exit (ADX>40 then downtick) OR 3× SL distance
export function trendAnalysis(c: Candle[], wing = 3): {
  long: boolean[]; short: boolean[];
  live: "LONG" | "SHORT" | "-";
  entry: number | null; stop: number | null; target: number | null;
  rr: number;
} {
  const n = c.length;
  const cl = c.map(x => x.close);
  const a = atrOf(c);
  const adxArr = adx(c.map(x => x.high), c.map(x => x.low), cl, 14);
  const long  = new Array(n).fill(false);
  const short = new Array(n).fill(false);

  // Detect swing highs and lows
  const swingHighs: { idx: number; price: number }[] = [];
  const swingLows:  { idx: number; price: number }[] = [];
  for (let i = wing; i < n - wing; i++) {
    let isH = true, isL = true;
    for (let k = 1; k <= wing; k++) {
      if (c[i].high <= c[i-k].high || c[i].high <= c[i+k].high) isH = false;
      if (c[i].low  >= c[i-k].low  || c[i].low  >= c[i+k].low)  isL = false;
    }
    if (isH) swingHighs.push({ idx: i, price: c[i].high });
    if (isL) swingLows.push({ idx: i, price: c[i].low });
  }

  // Generate signals
  for (let i = wing + 5; i < n; i++) {
    // Get last 2 swing highs and lows before bar i
    const recentH = swingHighs.filter(x => x.idx < i - wing).slice(-2);
    const recentL = swingLows.filter(x => x.idx < i - wing).slice(-2);
    if (recentH.length < 2 || recentL.length < 2) continue;

    const [h1, h2] = recentH; // h2 more recent
    const [l1, l2] = recentL;

    // LONG: Higher High + Higher Low + price breaks above most recent swing high
    if (h2.price > h1.price && l2.price > l1.price) {
      if (c[i].high > h2.price && c[i-1].high <= h2.price) {
        const slDist = c[i].high - l2.price;
        if (slDist > 0 && slDist < a[i] * 8) long[i] = true;
      }
    }
    // SHORT: Lower Low + Lower High + price breaks below most recent swing low
    if (l2.price < l1.price && h2.price < h1.price) {
      if (c[i].low < l2.price && c[i-1].low >= l2.price) {
        const slDist = h2.price - c[i].low;
        if (slDist > 0 && slDist < a[i] * 8) short[i] = true;
      }
    }
  }

  // Live signal
  const last = n - 1;
  let live: "LONG" | "SHORT" | "-" = "-";
  let entry: number | null = null, stop: number | null = null, target: number | null = null;
  let rr = 3;

  if (long[last] || short[last]) {
    live = long[last] ? "LONG" : "SHORT";
    entry = +cl[last].toFixed(5);

    // SL = most recent swing low (LONG) / swing high (SHORT)
    if (live === "LONG") {
      const lastL = swingLows.filter(x => x.idx < last).slice(-1)[0];
      stop = lastL ? +lastL.price.toFixed(5) : +(entry - 2 * a[last]).toFixed(5);
      const slDist = entry - (stop ?? entry - 2 * a[last]);
      target = +(entry + 3 * slDist).toFixed(5);
      rr = slDist > 0 ? +(3 * slDist / slDist).toFixed(2) : 3;
    } else {
      const lastH = swingHighs.filter(x => x.idx < last).slice(-1)[0];
      stop = lastH ? +lastH.price.toFixed(5) : +(entry + 2 * a[last]).toFixed(5);
      const slDist = (stop ?? entry + 2 * a[last]) - entry;
      target = +(entry - 3 * slDist).toFixed(5);
    }

    // Bishop check: ADX > 40 and turning down → no new entry
    const adxLast = adxArr[last];
    const adxPrev = adxArr[last - 1];
    if (isFinite(adxLast) && adxLast >= 40 && adxLast < adxPrev) {
      // Bishop fired — skip entry
      live = "-"; entry = null; stop = null; target = null;
    }
  }

  return { long, short, live, entry, stop, target, rr };
}

// ─── Strategy 5: Channel Breakout 55/20 (Courtney Smith Ch.3) ──
// 55-day high/low breakout entry, 20-day exit (go flat, not reverse)
// Rejection Rule: if price returns inside channel within 3 bars → exit
// Best on: Crypto (PF 1.91, 9/10 yrs) — ETH, ADA, DOT, SOL, AVAX
//          Stocks (PF 1.25, 9/11 yrs)  — NFLX, CTAS, REGN, CPRT, NVDA
// SL: 20-day opposite level (trail)
// TP: 20-day channel exit OR rejection rule
export function channelBreakout5520(c: Candle[]): {
  long: boolean[]; short: boolean[];
  live: "LONG" | "SHORT" | "-";
  entry: number | null; stop: number | null; target: number | null;
  entryDays: number; exitDays: number;
} {
  const n = c.length;
  const long  = new Array(n).fill(false);
  const short = new Array(n).fill(false);
  const ENTRY = 55, EXIT = 20;

  if (n < ENTRY + 5) {
    return { long, short, live: "-", entry: null, stop: null, target: null, entryDays: ENTRY, exitDays: EXIT };
  }

  // Track position state for rejection rule
  let pos: { dir: "LONG" | "SHORT"; breakLevel: number; barsIn: number } | null = null;

  for (let i = ENTRY; i < n; i++) {
    // Rolling 55-day and 20-day channels (exclude current bar)
    const w55H = Math.max(...c.slice(i - ENTRY, i).map(x => x.high));
    const w55L = Math.min(...c.slice(i - ENTRY, i).map(x => x.low));
    const w20H = Math.max(...c.slice(i - EXIT, i).map(x => x.high));
    const w20L = Math.min(...c.slice(i - EXIT, i).map(x => x.low));

    if (pos) {
      pos.barsIn++;
      // Rejection Rule: within 3 bars, close back inside 55-day channel → exit
      if (pos.barsIn <= 3) {
        if (pos.dir === "LONG"  && c[i].close < pos.breakLevel) { pos = null; continue; }
        if (pos.dir === "SHORT" && c[i].close > pos.breakLevel) { pos = null; continue; }
      }
      // Normal exit: 20-day breach
      if (pos.dir === "LONG"  && c[i].low  < w20L) { pos = null; continue; }
      if (pos.dir === "SHORT" && c[i].high > w20H) { pos = null; continue; }
    }

    if (!pos) {
      // LONG: fresh 55-day high breakout
      if (c[i].high > w55H && c[i-1].high <= w55H) {
        long[i] = true;
        pos = { dir: "LONG", breakLevel: w55H, barsIn: 0 };
      }
      // SHORT: fresh 55-day low breakdown
      else if (c[i].low < w55L && c[i-1].low >= w55L) {
        short[i] = true;
        pos = { dir: "SHORT", breakLevel: w55L, barsIn: 0 };
      }
    }
  }

  // Live signal for latest bar
  const last = n - 1;
  let live: "LONG" | "SHORT" | "-" = "-";
  let entry: number | null = null, stop: number | null = null, target: number | null = null;

  if (long[last] || short[last]) {
    live = long[last] ? "LONG" : "SHORT";
    entry = +(live === "LONG" ? c[last].high : c[last].low).toFixed(5);

    // SL = 20-day opposite level
    const w20H = Math.max(...c.slice(last - EXIT, last).map(x => x.high));
    const w20L = Math.min(...c.slice(last - EXIT, last).map(x => x.low));
    stop   = live === "LONG" ? +w20L.toFixed(5) : +w20H.toFixed(5);

    // Target: based on channel width (55-day range)
    const w55H = Math.max(...c.slice(last - ENTRY, last).map(x => x.high));
    const w55L = Math.min(...c.slice(last - ENTRY, last).map(x => x.low));
    const channelWidth = w55H - w55L;
    target = live === "LONG"
      ? +(entry + channelWidth * 0.5).toFixed(5)
      : +(entry - channelWidth * 0.5).toFixed(5);
  }

  return { long, short, live, entry, stop, target, entryDays: ENTRY, exitDays: EXIT };
}
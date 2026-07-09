import type { Candle } from "./market";
import { rsi, ema, bollinger, macd, atr } from "./indicators";
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

export function sFib(c: Candle[], level: number, lookback = 40): Sig {
  const n = c.length;
  const long = new Array(n).fill(false);
  const short = new Array(n).fill(false);
  
  for (let i = lookback; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    let idxHH = -1, idxLL = -1;
    for (let j = i - lookback; j < i; j++) {
      if (c[j].high > hh) { hh = c[j].high; idxHH = j; }
      if (c[j].low < ll) { ll = c[j].low; idxLL = j; }
    }
    const range = hh - ll;
    if (range <= 0) continue;
    
    if (idxLL < idxHH) {
      const lvlPrice = hh - level * range;
      if (c[i - 1].close > lvlPrice && c[i].low <= lvlPrice) {
        long[i] = true;
      }
    } else {
      const lvlPrice = ll + level * range;
      if (c[i - 1].close < lvlPrice && c[i].high >= lvlPrice) {
        short[i] = true;
      }
    }
  }
  return { long, short };
}

export function fibonacciSignals(c: Candle[]): Strat[] {
  const levels = [0.236, 0.382, 0.500, 0.618, 0.786];
  const names = ["Fib 23.6%", "Fib 38.2%", "Fib 50.0%", "Fib 61.8%", "Fib 78.6%"];
  return levels.map((lvl, idx) => {
    const s = sFib(c, lvl, 50);
    return { name: names[idx], long: s.long, short: s.short };
  });
}

export { backtest, metrics };

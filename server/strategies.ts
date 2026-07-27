import type { Candle } from "./market";
import { rsi, ema, bollinger, atr, adx } from "./indicators";

const cl  = (c: Candle[]) => c.map(x => x.close);
const hi  = (c: Candle[]) => c.map(x => x.high);
const lo  = (c: Candle[]) => c.map(x => x.low);

// SMA helper
function sma(arr: number[], p: number): number[] {
  return arr.map((_, i) => {
    if (i < p - 1) return NaN;
    return arr.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p;
  });
}

// ── Regime filter ──────────────────────────────────────────────
// Range mode: ADX(14) < 25 AND SMA20 slope flat (< 0.05% over 5 bars)
function isRange(c: Candle[]): boolean {
  const n  = c.length;
  const adxArr = adx(hi(c), lo(c), cl(c), 14);
  const s20    = sma(cl(c), 20);
  const last   = n - 1;
  if (isNaN(adxArr[last]) || isNaN(s20[last]) || isNaN(s20[last - 5])) return false;
  const slope  = Math.abs(s20[last] - s20[last - 5]) / s20[last - 5];
  return adxArr[last] < 25 && slope < 0.0005;
}

export interface StratResult {
  live:   "LONG" | "SHORT" | "-";
  entry:  number | null;
  stop:   number | null;
  target: number | null;
  note:   string;
  regime: "range" | "trend" | "-";
  // optional extras
  rsiVal?: number | null;
  zVal?:   number | null;
  adxVal?: number | null;
}

function noSignal(regime: "range" | "trend" | "-" = "-"): StratResult {
  return { live: "-", entry: null, stop: null, target: null, note: "", regime };
}

// ══════════════════════════════════════════════════════════════
//  TIER 1 — MEAN REVERSION (Range Regime Only)
//  All use ADX(14) < 25 AND SMA20 slope flat as prerequisite
// ══════════════════════════════════════════════════════════════

// ── S1: ATR Stretch Reversion ─────────────────────────────────
// OOS PF 2.48 | Win 55% | 1678 trades | 6/6 years
// Close < SMA50 - 1.5×ATR → LONG | Close > SMA50 + 1.5×ATR → SHORT
// Exit: price crosses SMA50 | SL: 2×ATR
export function atrStretchReversion(c: Candle[]): StratResult {
  const n    = c.length;
  if (n < 60) return noSignal();
  const range = isRange(c);
  if (!range) return noSignal("trend");

  const close  = cl(c);
  const s50    = sma(close, 50);
  const atrArr = atr(hi(c), lo(c), close, 14);
  const last   = n - 1;
  const prev   = n - 2;

  if (isNaN(s50[last]) || isNaN(atrArr[last])) return noSignal("range");

  const distNow  = close[last] - s50[last];
  const distPrev = close[prev] - s50[prev];
  const a        = atrArr[last];

  // LONG: close just crossed below SMA50 - 1.5×ATR
  if (distNow < -1.5 * a && distPrev >= -1.5 * atrArr[prev]) {
    const entry  = close[last];
    const stop   = +(entry - 2 * a).toFixed(5);
    const target = +(s50[last]).toFixed(5);
    return {
      live: "LONG", entry: +entry.toFixed(5), stop, target,
      note: `Close ${(distNow / a).toFixed(1)}× ATR below SMA50 · revert to mean`,
      regime: "range",
    };
  }
  // SHORT: close just crossed above SMA50 + 1.5×ATR
  if (distNow > 1.5 * a && distPrev <= 1.5 * atrArr[prev]) {
    const entry  = close[last];
    const stop   = +(entry + 2 * a).toFixed(5);
    const target = +(s50[last]).toFixed(5);
    return {
      live: "SHORT", entry: +entry.toFixed(5), stop, target,
      note: `Close ${(distNow / a).toFixed(1)}× ATR above SMA50 · revert to mean`,
      regime: "range",
    };
  }
  return noSignal("range");
}

// ── S2: BB Reversion (Bollinger Band) ─────────────────────────
// OOS PF 3.53 | Win 64% | 633 trades | 6/6 years
// Close crosses below lower BB → LONG | above upper BB → SHORT
// Exit: BB midline (SMA20) | SL: 2×ATR
export function bbReversion(c: Candle[]): StratResult {
  const n = c.length;
  if (n < 25) return noSignal();
  const range = isRange(c);
  if (!range) return noSignal("trend");

  const close  = cl(c);
  const bb     = bollinger(close, 20, 2);
  const atrArr = atr(hi(c), lo(c), close, 14);
  const last   = n - 1;
  const prev   = n - 2;

  if (isNaN(bb.lb[last]) || isNaN(bb.ub[last])) return noSignal("range");

  const a = atrArr[last];

  // LONG: close crossed below lower BB (prev was above)
  if (close[last] < bb.lb[last] && close[prev] >= bb.lb[prev]) {
    return {
      live: "LONG",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] - 2 * a).toFixed(5),
      target: +bb.mb[last].toFixed(5),
      note:   `Close below lower BB (${bb.lb[last].toFixed(4)}) · revert to midline`,
      regime: "range",
    };
  }
  // SHORT: close crossed above upper BB
  if (close[last] > bb.ub[last] && close[prev] <= bb.ub[prev]) {
    return {
      live: "SHORT",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] + 2 * a).toFixed(5),
      target: +bb.mb[last].toFixed(5),
      note:   `Close above upper BB (${bb.ub[last].toFixed(4)}) · revert to midline`,
      regime: "range",
    };
  }
  return noSignal("range");
}

// ── S3: RSI(2) Mean Reversion ─────────────────────────────────
// OOS PF 9.36 | Win 82% | 375 trades | 6/6 years
// RSI(2) < 5 AND price above SMA200 → LONG
// RSI(2) > 95 AND price below SMA200 → SHORT
// Exit: RSI(2) crosses 70 (long) or 30 (short) | SL: 2×ATR
export function rsi2MeanRev(c: Candle[]): StratResult {
  const n = c.length;
  if (n < 210) return noSignal();
  const range = isRange(c);
  if (!range) return noSignal("trend");

  const close  = cl(c);
  const r2     = rsi(close, 2);
  const s200   = sma(close, 200);
  const atrArr = atr(hi(c), lo(c), close, 14);
  const last   = n - 1;

  if (isNaN(r2[last]) || isNaN(s200[last])) return noSignal("range");

  const a = atrArr[last];

  if (r2[last] < 5 && close[last] > s200[last]) {
    return {
      live: "LONG",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] - 2 * a).toFixed(5),
      target: null, // exit when RSI(2) > 70 — no fixed TP
      note:   `RSI(2) = ${r2[last].toFixed(1)} · extreme oversold above SMA200 · exit RSI>70`,
      regime: "range",
      rsiVal: +r2[last].toFixed(1),
    };
  }
  if (r2[last] > 95 && close[last] < s200[last]) {
    return {
      live: "SHORT",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] + 2 * a).toFixed(5),
      target: null,
      note:   `RSI(2) = ${r2[last].toFixed(1)} · extreme overbought below SMA200 · exit RSI<30`,
      regime: "range",
      rsiVal: +r2[last].toFixed(1),
    };
  }
  return noSignal("range");
}

// ── S4: Z-Score ±2 Reversion ──────────────────────────────────
// OOS PF 5.33 | Win 73% | 381 trades | 6/6 years
// Z = (close - SMA20) / StdDev20
// Z crosses back above -2 → LONG | crosses back below +2 → SHORT
// Exit: Z returns to 0 (price at SMA20) | SL: 2×ATR
export function zScoreReversion(c: Candle[]): StratResult {
  const n = c.length;
  if (n < 25) return noSignal();
  const range = isRange(c);
  if (!range) return noSignal("trend");

  const close  = cl(c);
  const bb     = bollinger(close, 20, 1); // std = bb std
  const atrArr = atr(hi(c), lo(c), close, 14);
  const last   = n - 1;
  const prev   = n - 2;

  if (isNaN(bb.mb[last])) return noSignal("range");

  const stdLast = (bb.ub[last] - bb.mb[last]);
  const stdPrev = (bb.ub[prev] - bb.mb[prev]);
  if (!stdLast || !stdPrev) return noSignal("range");

  const zNow  = (close[last] - bb.mb[last]) / stdLast;
  const zPrev = (close[prev] - bb.mb[prev]) / stdPrev;
  const a     = atrArr[last];

  // LONG: Z crossed back above -2 (was ≤ -2)
  if (zPrev <= -2 && zNow > -2) {
    return {
      live: "LONG",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] - 2 * a).toFixed(5),
      target: +bb.mb[last].toFixed(5),
      note:   `Z-Score ${zNow.toFixed(2)} — crossed back above -2 · target SMA20`,
      regime: "range",
      zVal:   +zNow.toFixed(2),
    };
  }
  // SHORT: Z crossed back below +2 (was ≥ +2)
  if (zPrev >= 2 && zNow < 2) {
    return {
      live: "SHORT",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] + 2 * a).toFixed(5),
      target: +bb.mb[last].toFixed(5),
      note:   `Z-Score ${zNow.toFixed(2)} — crossed back below +2 · target SMA20`,
      regime: "range",
      zVal:   +zNow.toFixed(2),
    };
  }
  return noSignal("range");
}

// ── S5: MA Reversion (SMA20 Stretch) ─────────────────────────
// OOS PF 2.91 | Win 59% | 263 trades | 6/6 years
// Close < SMA20 - 2×ATR → LONG | Close > SMA20 + 2×ATR → SHORT
// Exit: close crosses SMA20 | SL: 2×ATR
export function maReversion(c: Candle[]): StratResult {
  const n = c.length;
  if (n < 25) return noSignal();
  const range = isRange(c);
  if (!range) return noSignal("trend");

  const close  = cl(c);
  const s20    = sma(close, 20);
  const atrArr = atr(hi(c), lo(c), close, 14);
  const last   = n - 1;
  const prev   = n - 2;

  if (isNaN(s20[last])) return noSignal("range");

  const a        = atrArr[last];
  const distNow  = close[last] - s20[last];
  const distPrev = close[prev] - s20[prev];

  if (distNow < -2 * a && distPrev >= -2 * atrArr[prev]) {
    return {
      live: "LONG",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] - 2 * a).toFixed(5),
      target: +s20[last].toFixed(5),
      note:   `Close ${(distNow / a).toFixed(1)}× ATR below SMA20 · revert to SMA20`,
      regime: "range",
    };
  }
  if (distNow > 2 * a && distPrev <= 2 * atrArr[prev]) {
    return {
      live: "SHORT",
      entry:  +close[last].toFixed(5),
      stop:   +(close[last] + 2 * a).toFixed(5),
      target: +s20[last].toFixed(5),
      note:   `Close ${(distNow / a).toFixed(1)}× ATR above SMA20 · revert to SMA20`,
      regime: "range",
    };
  }
  return noSignal("range");
}


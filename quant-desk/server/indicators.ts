// Array-based technical indicators (no external TA library).

export function ema(v: number[], p: number): number[] {
  const k = 2 / (p + 1);
  const out = new Array(v.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!isFinite(x)) { out[i] = prev; continue; }
    prev = isNaN(prev) ? x : x * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder's smoothing (RMA)
function rma(v: number[], p: number): number[] {
  const a = 1 / p;
  const out = new Array(v.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!isFinite(x)) { out[i] = prev; continue; }
    prev = isNaN(prev) ? x : x * a + prev * (1 - a);
    out[i] = prev;
  }
  return out;
}

export function rsi(close: number[], p = 14): number[] {
  const gain: number[] = [], loss: number[] = [];
  for (let i = 0; i < close.length; i++) {
    if (i === 0) { gain.push(0); loss.push(0); continue; }
    const d = close[i] - close[i - 1];
    gain.push(Math.max(d, 0));
    loss.push(Math.max(-d, 0));
  }
  const ag = rma(gain, p), al = rma(loss, p);
  return close.map((_, i) => {
    const l = al[i];
    if (!l) return 100;
    const rs = ag[i] / l;
    return 100 - 100 / (1 + rs);
  });
}

export function bollinger(close: number[], p = 20, m = 2) {
  const mb: number[] = [], ub: number[] = [], lb: number[] = [];
  for (let i = 0; i < close.length; i++) {
    if (i < p - 1) { mb.push(NaN); ub.push(NaN); lb.push(NaN); continue; }
    const w = close.slice(i - p + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / p;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
    mb.push(mean); ub.push(mean + m * sd); lb.push(mean - m * sd);
  }
  return { mb, ub, lb };
}

export function macd(close: number[], fast = 12, slow = 26, sig = 9) {
  const ef = ema(close, fast), es = ema(close, slow);
  const line = close.map((_, i) => ef[i] - es[i]);
  const signal = ema(line, sig);
  const hist = line.map((_, i) => line[i] - signal[i]);
  return { line, signal, hist };
}

export function atr(high: number[], low: number[], close: number[], p = 14): number[] {
  const tr = high.map((_, i) =>
    i === 0
      ? high[i] - low[i]
      : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  );
  return rma(tr, p);
}

export function adx(high: number[], low: number[], close: number[], p = 14): number[] {
  const n = high.length;
  const plusDM = new Array(n).fill(0), minusDM = new Array(n).fill(0), tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const dn = low[i - 1] - low[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  const atrr = rma(tr, p), pdm = rma(plusDM, p), mdm = rma(minusDM, p);
  const pdi = pdm.map((x, i) => (atrr[i] ? (100 * x) / atrr[i] : 0));
  const mdi = mdm.map((x, i) => (atrr[i] ? (100 * x) / atrr[i] : 0));
  const dx = pdi.map((_, i) => {
    const s = pdi[i] + mdi[i];
    return s ? (100 * Math.abs(pdi[i] - mdi[i])) / s : 0;
  });
  return rma(dx, p);
}

// Real market data from Yahoo Finance. No simulated fallback — errors surface honestly.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
  "Accept": "application/json",
};

export interface Candle {
  t: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Yahoo has no native 4h — fetch 1h and merge every 4 candles.
function aggregate(c: Candle[], factor: number): Candle[] {
  if (factor <= 1) return c;
  const out: Candle[] = [];
  for (let i = 0; i < c.length; i += factor) {
    const chunk = c.slice(i, i + factor);
    if (!chunk.length) continue;
    const last = chunk[chunk.length - 1];
    out.push({
      t: last.t,
      date: last.date,
      open: chunk[0].open,
      high: Math.max(...chunk.map((x) => x.high)),
      low: Math.min(...chunk.map((x) => x.low)),
      close: last.close,
      volume: chunk.reduce((a, b) => a + b.volume, 0),
    });
  }
  return out;
}

export async function fetchHistory(
  symbol: string,
  startSec: number,
  interval: string
): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);

  // map requested timeframe to a Yahoo interval (+ aggregation factor)
  let yInterval = interval;
  let factor = 1;
  if (interval === "4h") { yInterval = "1h"; factor = 4; }

  // intraday history is capped by Yahoo; clamp start so the request is valid.
  let p1 = startSec;
  if (yInterval === "1h") {
    const minStart = now - 720 * 86400;
    if (p1 < minStart) p1 = minStart;
  } else if (yInterval === "5m" || yInterval === "15m") {
    const minStart = now - 58 * 86400; // Yahoo ~60d cap on 5m/15m
    if (p1 < minStart) p1 = minStart;
  }
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${p1}&period2=${now}&interval=${yInterval}`;

  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) {
    if (r.status === 429)
      throw new Error("Yahoo rate-limited (429) — thodi der baad retry karein");
    throw new Error(`Yahoo Finance status ${r.status}`);
  }
  const json: any = await r.json();
  const res = json?.chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error("No data returned");

  const ts: number[] = res.timestamp;
  const q = res.indicators?.quote?.[0] || {};
  const intraday = yInterval.endsWith("h") || yInterval.endsWith("m");
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    const dt = new Date(ts[i] * 1000);
    out.push({
      t: ts[i],
      date: intraday ? dt.toISOString().slice(0, 16).replace("T", " ") : dt.toISOString().slice(0, 10),
      open: o, high: h, low: l, close: c, volume: v || 0,
    });
  }
  if (out.length === 0) throw new Error("Empty series after cleaning");
  return factor > 1 ? aggregate(out, factor) : out;
}

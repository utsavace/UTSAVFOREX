import type { Express } from "express";
import { fetchHistory, type Candle } from "./market";

// Crypto funding-rate research. Funding from OKX (public, no key, reachable), price from Yahoo daily.
// Thesis: very HIGH funding (crowd over-long) -> future returns fall (short edge); very LOW -> long edge.

const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

const MAP: Record<string, { okx: string; yf: string }> = {
  BTC: { okx: "BTC-USDT-SWAP", yf: "BTC-USD" },
  ETH: { okx: "ETH-USDT-SWAP", yf: "ETH-USD" },
  SOL: { okx: "SOL-USDT-SWAP", yf: "SOL-USD" },
  BNB: { okx: "BNB-USDT-SWAP", yf: "BNB-USD" },
  XRP: { okx: "XRP-USDT-SWAP", yf: "XRP-USD" },
};

interface FR { t: number; rate: number; }

async function okxFunding(instId: string): Promise<FR[]> {
  const out: FR[] = [];
  let after = "";
  for (let page = 0; page < 16; page++) {
    const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${after ? `&after=${after}` : ""}`;
    let j: any;
    try { const r = await fetch(url, { headers: H }); if (!r.ok) break; j = await r.json(); } catch { break; }
    const data: any[] = j?.data || [];
    if (!data.length) break;
    for (const x of data) out.push({ t: Number(x.fundingTime), rate: Number(x.fundingRate) });
    after = data[data.length - 1].fundingTime;
    if (data.length < 100) break;
  }
  return out.sort((a, b) => a.t - b.t);
}

function toDaily(funding: FR[]): { date: string; rate: number }[] {
  const by = new Map<string, { sum: number; n: number }>();
  for (const f of funding) {
    const d = new Date(f.t).toISOString().slice(0, 10);
    const e = by.get(d) || { sum: 0, n: 0 };
    e.sum += f.rate; e.n++; by.set(d, e);
  }
  return [...by.entries()].map(([date, e]) => ({ date, rate: e.sum / e.n })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function analyze(daily: { date: string; rate: number }[], price: Candle[], holdDays: number) {
  const idxByDate = new Map<string, number>();
  price.forEach((c, i) => idxByDate.set(c.date, i));
  const pairs: { rate: number; fwd: number }[] = [];
  for (const d of daily) {
    const i = idxByDate.get(d.date);
    if (i == null || i + holdDays >= price.length) continue;
    const ep = price[i].close, xp = price[i + holdDays].close;
    if (!(ep > 0)) continue;
    pairs.push({ rate: d.rate, fwd: (xp - ep) / ep * 100 });
  }
  if (pairs.length < 30) return null;

  const rates = pairs.map((p) => p.rate).sort((a, b) => a - b);
  const pct = (q: number) => rates[Math.floor(q * (rates.length - 1))];
  const p10 = pct(0.10), p25 = pct(0.25), p75 = pct(0.75), p90 = pct(0.90);

  const bucket = (name: string, keep: (r: number) => boolean) => {
    const g = pairs.filter((p) => keep(p.rate));
    const n = g.length || 1;
    return {
      name, count: g.length,
      avgFwd: +(g.reduce((a, b) => a + b.fwd, 0) / n).toFixed(3),
      pctUp: +((100 * g.filter((p) => p.fwd > 0).length) / n).toFixed(0),
    };
  };
  const buckets = [
    bucket("very high funding (top 10%)", (r) => r >= p90),
    bucket("high (10-25%)", (r) => r >= p75 && r < p90),
    bucket("normal (mid 50%)", (r) => r > p25 && r < p75),
    bucket("low (25-10%)", (r) => r > p10 && r <= p25),
    bucket("very low funding (bottom 10%)", (r) => r <= p10),
  ];

  const shorts = pairs.filter((p) => p.rate >= p90).map((p) => -p.fwd);
  const longs = pairs.filter((p) => p.rate <= p10).map((p) => p.fwd);
  const trades = [...shorts, ...longs];
  const tN = trades.length || 1;
  const contrarian = {
    trades: trades.length,
    winRate: +((100 * trades.filter((r) => r > 0).length) / tN).toFixed(1),
    avgReturn: +(trades.reduce((a, b) => a + b, 0) / tN).toFixed(3),
  };
  return { pairs: pairs.length, buckets, contrarian };
}

export function registerFundingTest(app: Express) {
  app.get("/api/funding-test", async (req, res) => {
    const syms = String(req.query.symbols || "BTC,ETH").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const holds = String(req.query.holds || "1,3").split(",").map((h) => Number(h)).filter((h) => h > 0);
    const startSec = Math.floor(new Date("2021-01-01T00:00:00Z").getTime() / 1000);
    const out: any[] = [];
    for (const s of syms) {
      const m = MAP[s];
      if (!m) { out.push({ symbol: s, error: "unsupported (BTC/ETH/SOL/BNB/XRP only)" }); continue; }
      try {
        const [funding, price] = await Promise.all([okxFunding(m.okx), fetchHistory(m.yf, startSec, "1d")]);
        if (!funding.length) { out.push({ symbol: s, error: "OKX funding not reachable" }); continue; }
        if (!price.length) { out.push({ symbol: s, error: "price not reachable" }); continue; }
        const daily = toDaily(funding);
        const byHold: any = {};
        for (const h of holds) byHold[`${h}d`] = analyze(daily, price, h);
        out.push({ symbol: s, fundingDays: daily.length, priceDays: price.length, holds: byHold });
      } catch (e: any) {
        out.push({ symbol: s, error: e?.message || "fetch failed" });
      }
    }
    res.json({
      ok: true, results: out,
      note: "avgFwd = us din ke funding level ke baad agle N din ka average % move (LONG perspective). High-funding bucket ka avgFwd NEGATIVE ho to shorting edge. contrarian = top10% short + bottom10% long. Funding: OKX, price: Yahoo daily.",
    });
  });
}

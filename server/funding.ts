import type { Express } from "express";

// Crypto funding-rate research. Data: Bybit v5 public API (no key, US-accessible).
// Thesis to test: when perp funding is very HIGH (crowd over-long) → future returns fall (short edge);
// when very LOW/negative (crowd over-short) → future returns rise (long edge). We just MEASURE it.

const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

interface FR { t: number; rate: number; }
interface KL { t: number; open: number; high: number; low: number; close: number; }

async function bybitFunding(symbol: string): Promise<FR[]> {
  const out: FR[] = [];
  let end = Date.now();
  for (let page = 0; page < 8; page++) {
    const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200&endTime=${end}`;
    let j: any;
    try { const r = await fetch(url, { headers: H }); if (!r.ok) break; j = await r.json(); } catch { break; }
    const list: any[] = j?.result?.list || [];
    if (!list.length) break;
    for (const x of list) out.push({ t: Number(x.fundingRateTimestamp), rate: Number(x.fundingRate) });
    const oldest = Math.min(...list.map((x) => Number(x.fundingRateTimestamp)));
    end = oldest - 1;
    if (list.length < 200) break;
  }
  return out.sort((a, b) => a.t - b.t);
}

async function bybitKlines(symbol: string): Promise<KL[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=480&limit=1000`;
  try {
    const r = await fetch(url, { headers: H }); if (!r.ok) return [];
    const j: any = await r.json();
    const list: any[] = j?.result?.list || [];
    return list.map((x) => ({ t: Number(x[0]), open: +x[1], high: +x[2], low: +x[3], close: +x[4] })).sort((a, b) => a.t - b.t);
  } catch { return []; }
}

function entryIdx(kl: KL[], ft: number): number {
  let lo = 0, hi = kl.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (kl[m].t >= ft) { ans = m; hi = m - 1; } else lo = m + 1; }
  return ans;
}

function analyze(funding: FR[], kl: KL[], hold: number) {
  const pairs: { rate: number; fwd: number }[] = [];
  for (const f of funding) {
    const i = entryIdx(kl, f.t);
    if (i < 0 || i + hold >= kl.length) continue;
    const ep = kl[i].open, xp = kl[i + hold].open;
    if (!(ep > 0)) continue;
    pairs.push({ rate: f.rate, fwd: (xp - ep) / ep * 100 });
  }
  if (pairs.length < 30) return null;

  const rates = pairs.map((p) => p.rate).sort((a, b) => a - b);
  const pct = (q: number) => rates[Math.floor(q * (rates.length - 1))];
  const p10 = pct(0.10), p25 = pct(0.25), p75 = pct(0.75), p90 = pct(0.90);

  const bucket = (name: string, keep: (r: number) => boolean) => {
    const g = pairs.filter((p) => keep(p.rate));
    const n = g.length || 1;
    const avg = g.reduce((a, b) => a + b.fwd, 0) / n;
    const up = g.filter((p) => p.fwd > 0).length;
    return { name, count: g.length, avgFwd: +avg.toFixed(3), pctUp: +((100 * up) / n).toFixed(0) };
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
    const symbols = String(req.query.symbols || "BTCUSDT,ETHUSDT").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const holds = String(req.query.holds || "3,9").split(",").map((h) => Number(h)).filter((h) => h > 0);
    const out: any[] = [];
    for (const sym of symbols) {
      try {
        const [funding, kl] = await Promise.all([bybitFunding(sym), bybitKlines(sym)]);
        if (!funding.length || !kl.length) { out.push({ symbol: sym, error: "no data (Bybit reachable? symbol sahi?)" }); continue; }
        const byHold: any = {};
        for (const h of holds) byHold[`${h}p_${(h * 8) / 24 || 1}d`] = analyze(funding, kl, h);
        out.push({ symbol: sym, fundingPoints: funding.length, klines: kl.length, holds: byHold });
      } catch (e: any) {
        out.push({ symbol: sym, error: e?.message || "fetch failed" });
      }
    }
    res.json({
      ok: true, results: out,
      note: "avgFwd = us funding-level ke baad agle N period ka average % move (LONG perspective). High-funding bucket ka avgFwd NEGATIVE ho to shorting edge deta hai. contrarian = top10% short + bottom10% long.",
    });
  });
}

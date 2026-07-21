import express from "express";
import path from "path";
import fs from "fs";
import { fetchHistory, type Candle } from "./server/market";
import { fiveEmaFiltered, cryptoEMATrend, forexRSIMeanRev, trendAnalysis, channelBreakout5520 } from "./server/strategies";
import { fetchCot, cotSupported } from "./server/cot";
import { registerJournalRoutes } from "./server/journal";
import { registerScoreBacktest } from "./server/scorebacktest";
import { registerFundingTest } from "./server/funding";

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV !== "development";

// ── Journal storage ──
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const LIVE_JOURNAL = path.join(DATA_DIR, "mytrades.json");
const PB_JOURNAL   = path.join(DATA_DIR, "playback_trades.json");

interface JTrade {
  id: string; symbol: string; name?: string;
  direction: "LONG" | "SHORT"; strategyLabel?: string; module?: string;
  takenAt: string; takenAsOf?: string;
  entryDate: string | null; entryPrice: number | null;
  stopPrice: number; targetPrice: number;
  status: "PENDING" | "OPEN" | "SL_HIT" | "TARGET_HIT" | "CLOSED_MANUAL";
  exitPrice?: number; exitDate?: string; returnPct?: number;
  currentPrice?: number; unrealizedPct?: number;
}
const readJ  = (f: string): JTrade[] => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return []; } };
const writeJ = (f: string, t: JTrade[]) => fs.writeFileSync(f, JSON.stringify(t, null, 2));

// ── History cache ──
const histCache = new Map<string, { at: number; candles: Candle[] }>();
async function getHistory(sym: string, startSec: number, interval = "1d"): Promise<Candle[]> {
  const key = `${sym}|${interval}|${startSec}`;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.candles;
  const c = await fetchHistory(sym, startSec, interval);
  histCache.set(key, { at: Date.now(), candles: c });
  return c;
}

// ── Asset categories (server-side — query parsing pe depend nahi) ──
const ASSET_CAT: Record<string, string> = {
  // Forex (28)
  "EURUSD=X":"Forex","GBPUSD=X":"Forex","USDJPY=X":"Forex","USDCHF=X":"Forex",
  "AUDUSD=X":"Forex","USDCAD=X":"Forex","NZDUSD=X":"Forex","EURJPY=X":"Forex",
  "GBPJPY=X":"Forex","EURGBP=X":"Forex","AUDJPY=X":"Forex","GBPCHF=X":"Forex",
  "EURCHF=X":"Forex","GBPCAD=X":"Forex","GBPAUD=X":"Forex","GBPNZD=X":"Forex",
  "EURCAD=X":"Forex","EURAUD=X":"Forex","EURNZD=X":"Forex","CADJPY=X":"Forex",
  "AUDCAD=X":"Forex","AUDNZD=X":"Forex","AUDCHF=X":"Forex","NZDJPY=X":"Forex",
  "NZDCAD=X":"Forex","CHFJPY=X":"Forex","CADCHF=X":"Forex","NZDCHF=X":"Forex",
  // Crypto (10)
  "BTC-USD":"Crypto","ETH-USD":"Crypto","SOL-USD":"Crypto","XRP-USD":"Crypto",
  "BNB-USD":"Crypto","DOGE-USD":"Crypto","ADA-USD":"Crypto","LINK-USD":"Crypto",
  "AVAX-USD":"Crypto","DOT-USD":"Crypto",
  // Commodities (4)
  "GC=F":"Comm","SI=F":"Comm","HG=F":"Comm","PL=F":"Comm",
  // Nasdaq 100 Stocks (92)
  "NVDA":"Stock","AAPL":"Stock","MSFT":"Stock","AMZN":"Stock","GOOGL":"Stock",
  "GOOG":"Stock","AVGO":"Stock","META":"Stock","TSLA":"Stock","MU":"Stock",
  "WMT":"Stock","AMD":"Stock","ASML":"Stock","INTC":"Stock","CSCO":"Stock",
  "AMAT":"Stock","COST":"Stock","LRCX":"Stock","PLTR":"Stock","ARM":"Stock",
  "NFLX":"Stock","PANW":"Stock","KLAC":"Stock","TXN":"Stock","LIN":"Stock",
  "TMUS":"Stock","CRWD":"Stock","AMGN":"Stock","PEP":"Stock","STX":"Stock",
  "ADI":"Stock","QCOM":"Stock","MRVL":"Stock","WDC":"Stock","GILD":"Stock",
  "SHOP":"Stock","APP":"Stock","BKNG":"Stock","ISRG":"Stock","PDD":"Stock",
  "VRTX":"Stock","SBUX":"Stock","FTNT":"Stock","ADP":"Stock","MAR":"Stock",
  "DDOG":"Stock","MNST":"Stock","ADBE":"Stock","CSX":"Stock","MELI":"Stock",
  "CDNS":"Stock","CEG":"Stock","ABNB":"Stock","CMCSA":"Stock","DASH":"Stock",
  "CTAS":"Stock","INTU":"Stock","MDLZ":"Stock","ROST":"Stock","SNPS":"Stock",
  "HON":"Stock","AEP":"Stock","REGN":"Stock","ORLY":"Stock","NXPI":"Stock",
  "PCAR":"Stock","MPWR":"Stock","WBD":"Stock","FANG":"Stock","BKR":"Stock",
  "EA":"Stock","TER":"Stock","FAST":"Stock","PYPL":"Stock","XEL":"Stock",
  "ODFL":"Stock","EXC":"Stock","CCEP":"Stock","ADSK":"Stock","IDXX":"Stock",
  "TTWO":"Stock","MCHP":"Stock","AXON":"Stock","KDP":"Stock","PAYX":"Stock",
  "ROP":"Stock","ALNY":"Stock","WDAY":"Stock","KHC":"Stock","DXCM":"Stock",
  "GEHC":"Stock","CPRT":"Stock",
  // Indices (3)
  "^GSPC":"Index","^NDX":"Index","^RUT":"Index",
};

// ── Helpers ──
const day = (d: string) => (d || "").slice(0, 10);
function startSec(dateStr: string): number {
  const d = new Date((dateStr || "2021-01-01") + "T00:00:00Z");
  const s = Math.floor(d.getTime() / 1000);
  return isFinite(s) ? s : Math.floor(Date.now() / 1000) - 1825 * 86400;
}
function symbols(req: any): string[] {
  return String(req.query.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
}

// ══════════════════════════════════════════════════════════
//  /api/history — price chart data
// ══════════════════════════════════════════════════════════
app.get("/api/history", async (req, res) => {
  try {
    const sym = String(req.query.symbol || "");
    const start = startSec(String(req.query.start || "2021-01-01"));
    const c = await getHistory(sym, start, "1d");
    res.json({ symbol: sym, candles: c });
  } catch (e: any) { res.status(502).json({ error: e?.message || "fetch failed" }); }
});

// ══════════════════════════════════════════════════════════
//  /api/screener — MAIN ENDPOINT
//  Runs all 3 validated strategies on each asset
//  Returns signals sorted by confidence
// ══════════════════════════════════════════════════════════
app.get("/api/screener", async (req, res) => {
  const start = startSec(String(req.query.start || "2021-01-01"));
  const syms  = symbols(req);
  const out: any[] = [];

  for (const sym of syms) {
    try {
      const c = await getHistory(sym, start, "1d");
      if (c.length < 60) { out.push({ symbol: sym, error: "not enough data" }); continue; }

      // ── COT (jo assets supported hain unke liye) ──
      let cot: any = null;
      if (cotSupported(sym)) {
        try { cot = await fetchCot(sym, 52); } catch { cot = null; }
      }

      const cat = ASSET_CAT[sym] || "";
      const row: any = { symbol: sym, signals: [] };

      // ── Strategy 1: 5-EMA Filtered (Comm + Stock only — Crypto removed, overfitting risk) ──
      if (cat === "Comm" || cat === "Stock" || cat === "Index") {
        const { alertCandles } = fiveEmaFiltered(c);
        const latest = alertCandles[alertCandles.length - 1];
        if (latest && latest.i >= c.length - 2) {
          // fired today or yesterday
          row.signals.push({
            strategy: "5-EMA Filtered",
            dir: latest.dir,
            entry: latest.entry,
            stop: latest.stop,
            target: latest.target,
            rr: "1:5",
            oosPF: 1.98,
            winRate: 36,
            note: "Alert candle extreme SL · EMA50 + body + ATR filtered",
          });
        }
      }

      // ── Strategy 2: Crypto EMA 20/50 (Crypto only) ──
      if (cat === "Crypto") {
        const r = cryptoEMATrend(c);
        if (r.live !== "-") {
          row.signals.push({
            strategy: "Crypto EMA 20/50",
            dir: r.live,
            entry: r.entry,
            stop: r.stop,
            target: r.target,
            rr: "1:3 (2ATR/3ATR)",
            oosPF: 1.86,
            winRate: 54,
            note: "EMA20 cross EMA50 · trend following",
          });
        }
      }

      // ── Strategy 3: Forex RSI 25/75 (Forex only) ──
      if (cat === "Forex") {
        const r = forexRSIMeanRev(c);
        if (r.live !== "-") {
          row.signals.push({
            strategy: "Forex RSI 25/75",
            dir: r.live,
            entry: r.entry,
            stop: r.stop,
            target: r.target,
            rr: "1:3 (2ATR/3ATR)",
            oosPF: 1.85,
            winRate: 60,
            rsiVal: r.rsiVal,
            note: `RSI ${r.rsiVal} crossed ${r.live === "LONG" ? "above 25" : "below 75"} · mean-reversion`,
          });
        }
      }

      // ── Strategy 4: Trend Analysis + Bishop Exit (Crypto only) ──
      // Swing HH+HL → LONG | LL+LH → SHORT | Bishop exit (ADX>40 downtick)
      // OOS PF 3.19 | 8/11 years | Best: XRP, DOGE, LINK, BTC, ADA
      if (cat === "Crypto") {
        const r = trendAnalysis(c);
        if (r.live !== "-") {
          row.signals.push({
            strategy: "Trend Analysis",
            dir: r.live,
            entry: r.entry,
            stop: r.stop,
            target: r.target,
            rr: "1:3 (trailing swing SL)",
            oosPF: 3.19,
            winRate: 30,
            note: `Swing ${r.live === "LONG" ? "HH+HL breakout" : "LL+LH breakdown"} · Bishop ADX exit`,
          });
        }
      }

      // ── Strategy 5: Channel Breakout 55/20 (Crypto + Stock) ──
      // 55-day breakout entry, 20-day exit (flat), rejection rule
      // Crypto OOS PF 1.91 (9/10 yrs) | Stock OOS PF 1.25 (9/11 yrs)
      if (cat === "Crypto" || cat === "Stock" || cat === "Index") {
        const r = channelBreakout5520(c);
        if (r.live !== "-") {
          row.signals.push({
            strategy: "Channel 55/20",
            dir: r.live,
            entry: r.entry,
            stop: r.stop,
            target: r.target,
            rr: "Dynamic (55-day channel width)",
            oosPF: cat === "Crypto" ? 1.91 : 1.25,
            winRate: cat === "Crypto" ? 27 : 22,
            note: `55-day ${r.live === "LONG" ? "high" : "low"} breakout · exit on 20-day breach · rejection rule`,
          });
        }
      }

      if (row.signals.length > 0) out.push({ ...row, cot });
      else out.push({ symbol: sym, signals: [], cot }); // no signal today

    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "fetch failed" });
    }
  }

  // Sort: errors last, then assets with signals first
  out.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return (b.signals?.length ?? 0) - (a.signals?.length ?? 0);
  });

  res.json(out);
});

// ══════════════════════════════════════════════════════════
//  JOURNAL ROUTES
// ══════════════════════════════════════════════════════════
const upTo = (c: Candle[], asOf: string) => c.filter((x) => day(x.date) <= asOf);

function resolveTrade(t: JTrade, candles: Candle[], asOf: string | null): boolean {
  const series = asOf ? candles.filter((c) => day(c.date) <= asOf) : candles;
  if (!series.length) return false;
  let changed = false;
  const dir = t.direction === "SHORT" ? -1 : 1;

  if (t.status === "PENDING") {
    const last = series[series.length - 1];
    t.currentPrice = +last.close.toFixed(5);
    // Check: SL already breached before entry? Mark invalid.
    if (dir === 1 && last.close <= t.stopPrice) {
      t.status = "SL_HIT"; t.exitPrice = +last.close.toFixed(5);
      t.exitDate = day(last.date); t.returnPct = -100; return true;
    }
    if (dir === -1 && last.close >= t.stopPrice) {
      t.status = "SL_HIT"; t.exitPrice = +last.close.toFixed(5);
      t.exitDate = day(last.date); t.returnPct = -100; return true;
    }
    const ref = t.takenAsOf || day(t.takenAt);
    const idx = series.findIndex((c) => day(c.date) > ref);
    if (idx === -1) { return false; }
    t.entryDate = day(series[idx].date);
    t.entryPrice = +series[idx].open.toFixed(5);
    t.status = "OPEN"; changed = true;
  }

  if (t.status !== "OPEN" || t.entryDate == null || t.entryPrice == null) return changed;
  const startIdx = series.findIndex((c) => day(c.date) >= (t.entryDate as string));
  if (startIdx === -1) return changed;
  for (let j = startIdx; j < series.length; j++) {
    const c = series[j]; const isEntry = j === startIdx;
    let exit: number | null = null, reason: "SL_HIT" | "TARGET_HIT" | null = null;
    if (dir === 1) {
      if (!isEntry && c.open <= t.stopPrice) { exit = c.open; reason = "SL_HIT"; }
      else if (!isEntry && c.open >= t.targetPrice) { exit = c.open; reason = "TARGET_HIT"; }
      else if (c.low <= t.stopPrice) { exit = t.stopPrice; reason = "SL_HIT"; }
      else if (c.high >= t.targetPrice) { exit = t.targetPrice; reason = "TARGET_HIT"; }
    } else {
      if (!isEntry && c.open >= t.stopPrice) { exit = c.open; reason = "SL_HIT"; }
      else if (!isEntry && c.open <= t.targetPrice) { exit = c.open; reason = "TARGET_HIT"; }
      else if (c.high >= t.stopPrice) { exit = t.stopPrice; reason = "SL_HIT"; }
      else if (c.low <= t.targetPrice) { exit = t.targetPrice; reason = "TARGET_HIT"; }
    }
    if (exit != null && reason) {
      t.status = reason; t.exitPrice = +exit.toFixed(5); t.exitDate = day(c.date);
      t.returnPct = +((dir === 1 ? (exit - t.entryPrice) / t.entryPrice : (t.entryPrice - exit) / t.entryPrice) * 100).toFixed(2);
      t.currentPrice = t.exitPrice; t.unrealizedPct = undefined; return true;
    }
  }
  const last = series[series.length - 1].close;
  t.currentPrice = +last.toFixed(5);
  t.unrealizedPct = +((dir === 1 ? (last - t.entryPrice) / t.entryPrice : (t.entryPrice - last) / t.entryPrice) * 100).toFixed(2);
  return changed;
}

async function checkJournal(file: string, asOf: string | null, start: number) {
  const trades = readJ(file); let updated = 0; const failed: string[] = [];
  for (const t of trades) {
    if (t.status !== "OPEN" && t.status !== "PENDING") continue;
    try {
      const candles = await getHistory(t.symbol, start, "1d");
      const before = t.status;
      resolveTrade(t, candles, asOf);
      if (t.status !== "OPEN" && t.status !== "PENDING" && before !== t.status) updated++;
    } catch { failed.push(t.symbol); }
  }
  writeJ(file, trades);
  return { trades, updated, failedSymbols: failed };
}

function journalRoutes(base: string, file: string) {
  app.get(base, (_req, res) => res.json({ ok: true, trades: readJ(file) }));
  app.post(base, (req, res) => {
    const b = req.body || {};
    if (!b.symbol || !isFinite(+b.stop) || !isFinite(+b.target))
      return res.json({ ok: false, error: "symbol/stop/target required" });
    const trades = readJ(file);
    const t: JTrade = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      symbol: String(b.symbol), name: b.name,
      direction: b.direction === "SHORT" ? "SHORT" : "LONG",
      strategyLabel: b.strategyLabel, module: b.module,
      takenAt: new Date().toISOString(),
      takenAsOf: day(new Date().toISOString()),
      entryDate: null, entryPrice: null,
      stopPrice: +b.stop, targetPrice: +b.target, status: "PENDING",
    };
    trades.push(t); writeJ(file, trades);
    res.json({ ok: true, trade: t, trades });
  });
  app.post(`${base}/check`, async (req, res) => {
    try {
      const start = startSec(String(req.body?.start || "2021-01-01"));
      res.json({ ok: true, ...(await checkJournal(file, null, start)) });
    } catch (e: any) { res.json({ ok: false, error: e?.message || "check failed" }); }
  });
  app.post(`${base}/close`, async (req, res) => {
    const { id, exitPrice } = req.body || {};
    const trades = readJ(file);
    const t = trades.find((x) => x.id === id);
    if (!t) return res.json({ ok: false, error: "trade nahi mila" });
    if (t.status !== "OPEN") return res.json({ ok: false, error: "sirf OPEN trade close hota hai" });
    const px = +exitPrice;
    if (!isFinite(px) || px <= 0) return res.json({ ok: false, error: "valid exit price do" });
    const dir = t.direction === "SHORT" ? -1 : 1;
    const xd = day(new Date().toISOString());
    t.status = "CLOSED_MANUAL"; t.exitPrice = +px.toFixed(5); t.exitDate = xd;
    t.returnPct = +((dir === 1 ? (px - (t.entryPrice as number)) / (t.entryPrice as number) : ((t.entryPrice as number) - px) / (t.entryPrice as number)) * 100).toFixed(2);
    writeJ(file, trades);
    res.json({ ok: true, trade: t, trades });
  });
  app.post(`${base}/delete`, (req, res) => {
    const trades = readJ(file).filter((x) => x.id !== req.body?.id);
    writeJ(file, trades); res.json({ ok: true, trades });
  });
  app.post(`${base}/reset`, (_req, res) => { writeJ(file, []); res.json({ ok: true, trades: [] }); });
}

journalRoutes("/api/trades", LIVE_JOURNAL);

registerJournalRoutes(app);
registerScoreBacktest(app);
registerFundingTest(app);

// ── Standalone COT endpoint — sabhi supported assets ──
app.get("/api/cot-all", async (req, res) => {
  const syms = String(req.query.symbols || "").split(",").map(s => s.trim()).filter(Boolean);
  const out: any[] = [];
  for (const sym of syms) {
    if (!cotSupported(sym)) { out.push({ symbol: sym, supported: false }); continue; }
    try {
      const cot = await fetchCot(sym, 52);
      if (!cot) {
        out.push({ symbol: sym, supported: true, error: "API returned null — CFTC data unavailable or symbol not found in CFTC database" });
      } else {
        out.push({ symbol: sym, supported: true, ...cot });
      }
    } catch (e: any) {
      out.push({ symbol: sym, supported: true, error: e?.message || "COT fetch failed" });
    }
  }
  res.json(out);
});

// ══════════════════════════════════════════════════════════
//  /api/playback — Market replay
//  Ek date range ke har din ke signals precompute karke bhejta hai
//  Client day-by-day autoplay karta hai
// ══════════════════════════════════════════════════════════
app.get("/api/playback", async (req, res) => {
  const syms = symbols(req);
  const fromDate = String(req.query.from || "");   // playback start date YYYY-MM-DD
  const daysAhead = Math.min(120, Math.max(5, Number(req.query.days) || 60));
  const histStart = startSec("2021-01-01"); // strategies need long history

  if (!fromDate) return res.json({ error: "from date required" });

  try {
    // Har asset ka full history load karo
    const assetData: Record<string, Candle[]> = {};
    for (const sym of syms) {
      try {
        const c = await getHistory(sym, histStart, "1d");
        if (c.length >= 60) assetData[sym] = c;
      } catch { /* skip */ }
    }

    // fromDate ka index nikaalo (koi bhi ek asset se — common timeline)
    const anySym = Object.keys(assetData)[0];
    if (!anySym) return res.json({ error: "no data" });

    // Build timeline of trading days from fromDate onward
    const refCandles = assetData[anySym];
    const startIdx = refCandles.findIndex((c) => day(c.date) >= fromDate);
    if (startIdx === -1) return res.json({ error: "date out of range" });

    const frames: any[] = [];
    const endIdx = Math.min(refCandles.length - 1, startIdx + daysAhead);

    for (let di = startIdx; di <= endIdx; di++) {
      const curDate = day(refCandles[di].date);
      const dayFrame: any = { date: curDate, signals: [], ohlc: {} };

      for (const sym of Object.keys(assetData)) {
        const full = assetData[sym];
        // us date tak ka data slice karo (as-of)
        const upto = full.filter((c) => day(c.date) <= curDate);
        if (upto.length < 60) continue;

        const cat = ASSET_CAT[sym] || "";
        const bar = upto[upto.length - 1];
        // OHLC bhejo — client SL/TP resolve kar sake
        dayFrame.ohlc[sym] = {
          o: +bar.open.toFixed(5), h: +bar.high.toFixed(5),
          l: +bar.low.toFixed(5), c: +bar.close.toFixed(5),
        };

        // 5-EMA Filtered (Comm + Stock only — Crypto hataya, overfitting risk)
        if (cat === "Comm" || cat === "Stock" || cat === "Index") {
          const { alertCandles } = fiveEmaFiltered(upto);
          const latest = alertCandles[alertCandles.length - 1];
          if (latest && latest.i >= upto.length - 2) {
            dayFrame.signals.push({
              symbol: sym, strategy: "5-EMA Filtered", dir: latest.dir,
              entry: latest.entry, stop: latest.stop, target: latest.target, rr: "1:5",
            });
          }
        }
        // Crypto EMA
        if (cat === "Crypto") {
          const r = cryptoEMATrend(upto);
          if (r.live !== "-") {
            dayFrame.signals.push({
              symbol: sym, strategy: "Crypto EMA 20/50", dir: r.live,
              entry: r.entry, stop: r.stop, target: r.target, rr: "1:3",
            });
          }
        }
        // Forex RSI
        if (cat === "Forex") {
          const r = forexRSIMeanRev(upto);
          if (r.live !== "-") {
            dayFrame.signals.push({
              symbol: sym, strategy: "Forex RSI 25/75", dir: r.live,
              entry: r.entry, stop: r.stop, target: r.target, rr: "1:3", rsiVal: r.rsiVal,
            });
          }
        }
        // Trend Analysis (Crypto)
        if (cat === "Crypto") {
          const r = trendAnalysis(upto);
          if (r.live !== "-") {
            dayFrame.signals.push({
              symbol: sym, strategy: "Trend Analysis", dir: r.live,
              entry: r.entry, stop: r.stop, target: r.target, rr: "1:3",
            });
          }
        }
        // Channel 55/20 (Crypto + Stock)
        if (cat === "Crypto" || cat === "Stock" || cat === "Index") {
          const r = channelBreakout5520(upto);
          if (r.live !== "-") {
            dayFrame.signals.push({
              symbol: sym, strategy: "Channel 55/20", dir: r.live,
              entry: r.entry, stop: r.stop, target: r.target, rr: "Dynamic",
            });
          }
        }
      }
      frames.push(dayFrame);
    }

    res.json({ from: fromDate, frames });
  } catch (e: any) {
    res.json({ error: e?.message || "playback failed" });
  }
});

// ── Boot ──
async function start() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", root: process.cwd() });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      try {
        let html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) { next(e); }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Quant Desk on http://0.0.0.0:${PORT}`));
}

start();
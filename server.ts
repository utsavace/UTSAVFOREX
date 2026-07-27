import express from "express";
import path from "path";
import fs from "fs";
import { fetchHistory, type Candle } from "./server/market";
import {
  atrStretchReversion,
  bbReversion,
  rsi2MeanRev,
  zScoreReversion,
  maReversion,
} from "./server/strategies";
import { fetchCot, cotSupported } from "./server/cot";
import { registerJournalRoutes } from "./server/journal";
import { registerScoreBacktest } from "./server/scorebacktest";
import { registerFundingTest } from "./server/funding";

const app  = express();
app.use(express.json());
const PORT   = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV !== "development";

// ── Journal storage ──────────────────────────────────────────
const DATA_DIR    = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const LIVE_JOURNAL = path.join(DATA_DIR, "mytrades.json");

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

// ── History cache ─────────────────────────────────────────────
const histCache = new Map<string, { at: number; candles: Candle[] }>();
async function getHistory(sym: string, startSec: number, interval = "1d"): Promise<Candle[]> {
  const key = `${sym}|${interval}|${startSec}`;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.candles;
  const c = await fetchHistory(sym, startSec, interval);
  histCache.set(key, { at: Date.now(), candles: c });
  return c;
}

// ── Asset categories ──────────────────────────────────────────
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
  // Nasdaq 100 (92)
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

const day = (d: string) => (d || "").slice(0, 10);
function startSec(dateStr: string): number {
  const d = new Date((dateStr || "2021-01-01") + "T00:00:00Z");
  const s = Math.floor(d.getTime() / 1000);
  return isFinite(s) ? s : Math.floor(Date.now() / 1000) - 1825 * 86400;
}
function symbols(req: any): string[] {
  return String(req.query.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
}

// ── 5 Tier 1 strategy definitions ────────────────────────────
const TIER1 = [
  {
    key:     "atr_stretch",
    name:    "ATR Stretch Reversion",
    fn:      atrStretchReversion,
    oosPF:   2.48,
    winRate: 55,
    rr:      "1:2 (SL:2ATR, TP:SMA50)",
    assets:  "All",
    note:    "Close 1.5×ATR from SMA50 · range regime",
  },
  {
    key:     "bb_reversion",
    name:    "BB Reversion",
    fn:      bbReversion,
    oosPF:   3.53,
    winRate: 64,
    rr:      "1:2 (SL:2ATR, TP:BB mid)",
    assets:  "All",
    note:    "Close outside BB(20,2σ) · range regime",
  },
  {
    key:     "rsi2_mean_rev",
    name:    "RSI(2) Mean Rev",
    fn:      rsi2MeanRev,
    oosPF:   9.36,
    winRate: 82,
    rr:      "Exit RSI>70 / <30",
    assets:  "All",
    note:    "RSI(2)<5 above SMA200 · range regime",
  },
  {
    key:     "zscore",
    name:    "Z-Score ±2",
    fn:      zScoreReversion,
    oosPF:   5.33,
    winRate: 73,
    rr:      "1:2 (SL:2ATR, TP:SMA20)",
    assets:  "All",
    note:    "Z-score crosses ±2 · range regime",
  },
  {
    key:     "ma_reversion",
    name:    "MA Reversion",
    fn:      maReversion,
    oosPF:   2.91,
    winRate: 59,
    rr:      "1:2 (SL:2ATR, TP:SMA20)",
    assets:  "All",
    note:    "Close 2×ATR from SMA20 · range regime",
  },
];

// ══════════════════════════════════════════════════════════
//  /api/history
// ══════════════════════════════════════════════════════════
app.get("/api/history", async (req, res) => {
  try {
    const sym   = String(req.query.symbol || "");
    const start = startSec(String(req.query.start || "2021-01-01"));
    const c     = await getHistory(sym, start, "1d");
    res.json({ symbol: sym, candles: c });
  } catch (e: any) { res.status(502).json({ error: e?.message || "fetch failed" }); }
});

// ══════════════════════════════════════════════════════════
//  /api/screener — 5 Tier 1 strategies, ADX regime filter
// ══════════════════════════════════════════════════════════
app.get("/api/screener", async (req, res) => {
  const start = startSec(String(req.query.start || "2021-01-01"));
  const syms  = symbols(req);
  const out: any[] = [];

  for (const sym of syms) {
    try {
      const c = await getHistory(sym, start, "1d");
      if (c.length < 60) { out.push({ symbol: sym, error: "not enough data" }); continue; }

      let cot: any = null;
      if (cotSupported(sym)) {
        try { cot = await fetchCot(sym, 52); } catch { cot = null; }
      }

      const row: any = { symbol: sym, signals: [], regime: "-" };

      for (const strat of TIER1) {
        const r = strat.fn(c);
        if (r.live !== "-") {
          row.regime = r.regime;
          row.signals.push({
            strategy:   strat.name,
            stratKey:   strat.key,
            dir:        r.live,
            entry:      r.entry,
            stop:       r.stop,
            target:     r.target,
            rr:         strat.rr,
            oosPF:      strat.oosPF,
            winRate:    strat.winRate,
            note:       r.note,
            rsiVal:     r.rsiVal,
            zVal:       r.zVal,
            regime:     r.regime,
          });
        } else {
          // Track regime even with no signal
          if (r.regime !== "-") row.regime = r.regime;
        }
      }

      out.push({ ...row, cot });
    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "fetch failed" });
    }
  }

  // Signals wale pehle, then no-signal, then errors
  out.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return (b.signals?.length ?? 0) - (a.signals?.length ?? 0);
  });

  res.json(out);
});

// ══════════════════════════════════════════════════════════
//  /api/strategies — metadata for UI dashboard modules
// ══════════════════════════════════════════════════════════
app.get("/api/strategies", (_req, res) => {
  res.json(TIER1.map(s => ({
    key:     s.key,
    name:    s.name,
    oosPF:   s.oosPF,
    winRate: s.winRate,
    rr:      s.rr,
    assets:  s.assets,
    note:    s.note,
  })));
});

// ══════════════════════════════════════════════════════════
//  /api/playback — historical replay
// ══════════════════════════════════════════════════════════
app.get("/api/playback", async (req, res) => {
  const syms      = symbols(req);
  const fromDate  = String(req.query.from || "");
  const daysAhead = Math.min(120, Math.max(5, Number(req.query.days) || 60));
  const histStart = startSec("2021-01-01");

  if (!fromDate) return res.json({ error: "from date required" });

  try {
    const assetData: Record<string, Candle[]> = {};
    for (const sym of syms) {
      try {
        const c = await getHistory(sym, histStart, "1d");
        if (c.length >= 60) assetData[sym] = c;
      } catch { /* skip */ }
    }

    const anySym = Object.keys(assetData)[0];
    if (!anySym) return res.json({ error: "no data" });

    const refCandles = assetData[anySym];
    const startIdx   = refCandles.findIndex((c) => day(c.date) >= fromDate);
    if (startIdx === -1) return res.json({ error: "date out of range" });

    const frames: any[] = [];
    const endIdx = Math.min(refCandles.length - 1, startIdx + daysAhead);

    for (let di = startIdx; di <= endIdx; di++) {
      const curDate  = day(refCandles[di].date);
      const dayFrame: any = { date: curDate, signals: [], ohlc: {} };

      for (const sym of Object.keys(assetData)) {
        const full = assetData[sym];
        const upto = full.filter((c) => day(c.date) <= curDate);
        if (upto.length < 60) continue;

        const bar = upto[upto.length - 1];
        dayFrame.ohlc[sym] = {
          o: +bar.open.toFixed(5), h: +bar.high.toFixed(5),
          l: +bar.low.toFixed(5),  c: +bar.close.toFixed(5),
        };

        for (const strat of TIER1) {
          const r = strat.fn(upto);
          if (r.live !== "-") {
            dayFrame.signals.push({
              symbol: sym, strategy: strat.name, stratKey: strat.key,
              dir: r.live, entry: r.entry, stop: r.stop, target: r.target,
              rr: strat.rr, regime: r.regime, note: r.note,
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

// ── Journal ───────────────────────────────────────────────────
const upTo = (c: Candle[], asOf: string) => c.filter((x) => day(x.date) <= asOf);

function resolveTrade(t: JTrade, candles: Candle[], asOf: string | null): boolean {
  const series = asOf ? candles.filter((c) => day(c.date) <= asOf) : candles;
  if (!series.length) return false;
  let changed = false;
  const dir = t.direction === "SHORT" ? -1 : 1;
  if (t.status === "PENDING") {
    const last = series[series.length - 1];
    t.currentPrice = +last.close.toFixed(5);
    const ref = t.takenAsOf || day(t.takenAt);
    const idx = series.findIndex((c) => day(c.date) > ref);
    if (idx === -1) return false;
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
      takenAt: new Date().toISOString(), takenAsOf: day(new Date().toISOString()),
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
    t.status = "CLOSED_MANUAL"; t.exitPrice = +px.toFixed(5);
    t.exitDate = day(new Date().toISOString());
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

// ── COT ──────────────────────────────────────────────────────
app.get("/api/cot-all", async (req, res) => {
  const syms = String(req.query.symbols || "").split(",").map(s => s.trim()).filter(Boolean);
  const out: any[] = [];
  for (const sym of syms) {
    if (!cotSupported(sym)) { out.push({ symbol: sym, supported: false }); continue; }
    try {
      const cot = await fetchCot(sym, 52);
      out.push(cot ? { symbol: sym, supported: true, ...cot } : { symbol: sym, supported: true, error: "no data" });
    } catch (e: any) {
      out.push({ symbol: sym, supported: true, error: e?.message || "COT fetch failed" });
    }
  }
  res.json(out);
});

// ── Boot ──────────────────────────────────────────────────────
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

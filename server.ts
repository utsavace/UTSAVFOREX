import express from "express";
import path from "path";
import fs from "fs";
import { fetchHistory, type Candle } from "./server/market";
import { walkForward, candidateSignals, divergence, fibCandidates, type Gate } from "./server/strategies";
import { fetchCot, cotSupported } from "./server/cot";
import { registerJournalRoutes } from "./server/journal";
import { registerScoreBacktest } from "./server/scorebacktest";
import { registerFundingTest } from "./server/funding";

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV !== "development";

const HOLD = 20;
const ALLOW_SHORT = true;

// ==================== JOURNAL STORAGE (file-based) ====================
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const LIVE_JOURNAL = path.join(DATA_DIR, "mytrades.json");
const PB_JOURNAL = path.join(DATA_DIR, "playback_trades.json");

interface JTrade {
  id: string;
  symbol: string;
  name?: string;
  direction: "LONG" | "SHORT";
  strategyLabel?: string;
  module?: string;
  takenAt: string;
  takenAsOf?: string; // playback: virtual date the trade was taken on
  entryDate: string | null;
  entryPrice: number | null;
  stopPrice: number;
  targetPrice: number;
  status: "PENDING" | "OPEN" | "SL_HIT" | "TARGET_HIT" | "CLOSED_MANUAL";
  exitPrice?: number;
  exitDate?: string;
  returnPct?: number;
  currentPrice?: number;
  unrealizedPct?: number;
}

const readJ = (f: string): JTrade[] => {
  try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return []; }
};
const writeJ = (f: string, t: JTrade[]) => fs.writeFileSync(f, JSON.stringify(t, null, 2));

// ==================== IN-MEMORY HISTORY CACHE ====================
// Playback steps re-read the same series every virtual day — cache avoids hammering Yahoo.
const histCache = new Map<string, { at: number; candles: Candle[] }>();
const HIST_TTL = 10 * 60 * 1000;

async function getHistory(sym: string, startSec: number, interval: string): Promise<Candle[]> {
  const key = `${sym}|${interval}|${startSec}`;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < HIST_TTL) return hit.candles;
  const c = await fetchHistory(sym, startSec, interval);
  histCache.set(key, { at: Date.now(), candles: c });
  return c;
}

const day = (d: string) => (d || "").slice(0, 10);
const upTo = (c: Candle[], asOf: string) => c.filter((x) => day(x.date) <= asOf);

// ==================== REQUEST HELPERS ====================
function startSec(dateStr: string): number {
  const d = new Date((dateStr || "2022-01-01") + "T00:00:00Z");
  const s = Math.floor(d.getTime() / 1000);
  return isFinite(s) ? s : Math.floor(Date.now() / 1000) - 730 * 86400;
}
function symbols(req: any): string[] {
  return String(req.query.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
}
function ctx(req: any) {
  return {
    interval: String(req.query.interval || "1d"),
    start: startSec(String(req.query.start || "")),
  };
}
function gateOf(req: any): Gate {
  return {
    minWin: Number(req.query.minWin ?? 60),
    minPF: Number(req.query.minPF ?? 2),
    minTrades: Number(req.query.minTrades ?? 20),
  };
}

// ==================== CORE COMPUTE (shared by live + playback) ====================
function computeOptRow(sym: string, c: Candle[], gate: Gate) {
  if (c.length < 80) return { symbol: sym, error: "not enough data" };
  const wf = walkForward(c, candidateSignals(c), HOLD, ALLOW_SHORT, gate);
  if (!wf) return { symbol: sym, error: "not enough data for 70/30 split" };
  return { symbol: sym, ...wf };
}

function computeDivRow(sym: string, c: Candle[], gate: Gate, rsiP: number, piv: number) {
  if (c.length < 80) return { symbol: sym, error: "not enough data" };
  const { bull, bear } = divergence(c, rsiP, piv, piv);
  const wf = walkForward(c, [{ name: "RSI Divergence", long: bull, short: bear }], HOLD, ALLOW_SHORT, gate);
  if (!wf) return { symbol: sym, error: "not enough data for 70/30 split" };
  const pivots: any[] = [];
  for (let i = 0; i < c.length; i++) {
    if (bull[i]) pivots.push({ date: c[i].date, price: c[i].close, type: "bull" });
    else if (bear[i]) pivots.push({ date: c[i].date, price: c[i].close, type: "bear" });
  }
  return {
    symbol: sym,
    signals: bull.filter(Boolean).length + bear.filter(Boolean).length,
    pivots: pivots.slice(-14),
    ...wf,
  };
}

function computeFibRow(sym: string, c: Candle[], gate: Gate) {
  if (c.length < 80) return { symbol: sym, error: "not enough data" };
  const wf = walkForward(c, fibCandidates(c), HOLD, ALLOW_SHORT, gate);
  if (!wf) return { symbol: sym, error: "not enough data for 70/30 split" };
  return { symbol: sym, ...wf };
}

// ==================== LIVE API (same logic as before) ====================
app.get("/api/history", async (req, res) => {
  try {
    const sym = String(req.query.symbol || "");
    const { start, interval } = ctx(req);
    const c = await getHistory(sym, start, interval);
    res.json({ symbol: sym, candles: c });
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "fetch failed" });
  }
});

app.get("/api/optimize", async (req, res) => {
  const { interval, start } = ctx(req);
  const gate = gateOf(req);
  const out: any[] = [];
  for (const sym of symbols(req)) {
    try {
      const c = await getHistory(sym, start, interval);
      out.push(computeOptRow(sym, c, gate));
    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "fetch failed" });
    }
  }
  res.json(out);
});

app.get("/api/divergence", async (req, res) => {
  const { interval, start } = ctx(req);
  const gate = gateOf(req);
  const rsiP = Number(req.query.rsiP ?? 14);
  const piv = Number(req.query.piv ?? 3);
  const out: any[] = [];
  for (const sym of symbols(req)) {
    try {
      const c = await getHistory(sym, start, interval);
      out.push(computeDivRow(sym, c, gate, rsiP, piv));
    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "fetch failed" });
    }
  }
  res.json(out);
});

app.get("/api/fibonacci", async (req, res) => {
  const { interval, start } = ctx(req);
  const gate = gateOf(req);
  const out: any[] = [];
  for (const sym of symbols(req)) {
    try {
      const c = await getHistory(sym, start, interval);
      out.push(computeFibRow(sym, c, gate));
    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "fetch failed" });
    }
  }
  res.json(out);
});

app.get("/api/overview", async (req, res) => {
  const { interval, start } = ctx(req);
  const gate = gateOf(req);
  const out: any[] = [];
  for (const sym of symbols(req)) {
    const row: any = { symbol: sym };
    try {
      const c = await getHistory(sym, start, interval);
      if (c.length < 80) { out.push({ symbol: sym, error: "not enough data" }); continue; }
      const opt = walkForward(c, candidateSignals(c), HOLD, ALLOW_SHORT, gate);
      const { bull, bear } = divergence(c, 14, 2, 2);
      const div = walkForward(c, [{ name: "RSI Divergence", long: bull, short: bear }], HOLD, ALLOW_SHORT, gate);
      const fib = walkForward(c, fibCandidates(c), HOLD, ALLOW_SHORT, gate);
      row.opt = opt && { strategy: opt.strategy, live: opt.live, isPF: opt.isPF, oosPF: opt.oosPF, oosTrades: opt.oosTrades, qualified: opt.qualified, entry: opt.entry, stop: opt.stop, target: opt.target };
      row.div = div && { live: div.live, oosPF: div.oosPF, oosTrades: div.oosTrades, qualified: div.qualified, entry: div.entry, stop: div.stop, target: div.target };
      row.fib = fib && { strategy: fib.strategy, live: fib.live, isPF: fib.isPF, oosPF: fib.oosPF, oosTrades: fib.oosTrades, qualified: fib.qualified, entry: fib.entry, stop: fib.stop, target: fib.target };
    } catch (e: any) { out.push({ symbol: sym, error: e?.message || "fetch failed" }); continue; }
    if (cotSupported(sym)) {
      try { row.cot = (await fetchCot(sym, 52)) || null; } catch { row.cot = null; }
    } else row.cot = null;
    out.push(row);
  }
  res.json(out);
});

app.get("/api/cot", async (req, res) => {
  const out: any[] = [];
  for (const sym of symbols(req)) {
    if (!cotSupported(sym)) { out.push({ symbol: sym, error: "no COT (not a futures asset)" }); continue; }
    try {
      const info = await fetchCot(sym, 52);
      if (!info) { out.push({ symbol: sym, error: "COT unavailable (verify feed on deploy)" }); continue; }
      out.push({ symbol: sym, ...info });
    } catch (e: any) {
      out.push({ symbol: sym, error: e?.message || "COT fetch failed" });
    }
  }
  res.json(out);
});

// ==================== 🕰 PLAYBACK (TIME MACHINE) ====================
// No pre-built cache needed: history is fetched once (memory-cached), then sliced
// to "as-of" date and every module is recomputed on that truncated series —
// engine ko us date ke baad ka koi data nahi dikhta (no lookahead).
// Playback always runs on DAILY candles.

app.get("/api/playback/axis", async (req, res) => {
  const { start } = ctx(req);
  const syms = symbols(req);
  if (!syms.length) return res.json({ ok: false, error: "koi asset select nahi hai" });
  const set = new Set<string>();
  let okAny = false;
  for (const s of syms) {
    try {
      const c = await getHistory(s, start, "1d");
      okAny = true;
      for (const x of c) set.add(day(x.date));
    } catch { /* skip failed symbol; axis = union of the rest */ }
  }
  if (!okAny) return res.json({ ok: false, error: "kisi bhi asset ka history nahi mila (Yahoo down/rate-limit?)" });
  res.json({ ok: true, dates: [...set].sort() });
});

app.get("/api/playback/snapshot", async (req, res) => {
  const date = day(String(req.query.date || ""));
  if (!date) return res.json({ ok: false, error: "date required" });
  const { start } = ctx(req);
  const gate = gateOf(req);
  const rsiP = Number(req.query.rsiP ?? 14);
  const piv = Number(req.query.piv ?? 2);
  const syms = symbols(req);

  const optimize: any[] = [];
  const diverg: any[] = [];
  const overview: any[] = [];
  const fibonacci: any[] = [];

  for (const sym of syms) {
    try {
      const full = await getHistory(sym, start, "1d");
      const c = upTo(full, date);
      const o = computeOptRow(sym, c, gate);
      const d = computeDivRow(sym, c, gate, rsiP, piv);
      const f = computeFibRow(sym, c, gate);
      optimize.push(o);
      diverg.push(d);
      fibonacci.push(f);
      const oAny: any = o, dAny: any = d, fAny: any = f;
      overview.push({
        symbol: sym,
        opt: oAny.error ? null : { strategy: oAny.strategy, live: oAny.live, isPF: oAny.isPF, oosPF: oAny.oosPF, qualified: oAny.qualified, entry: oAny.entry, stop: oAny.stop, target: oAny.target },
        div: dAny.error ? null : { live: dAny.live, oosPF: dAny.oosPF, qualified: dAny.qualified, entry: dAny.entry, stop: dAny.stop, target: dAny.target },
        fib: fAny.error ? null : { strategy: fAny.strategy, live: fAny.live, isPF: fAny.isPF, oosPF: fAny.oosPF, qualified: fAny.qualified, entry: fAny.entry, stop: fAny.stop, target: fAny.target },
        cot: null, // historical COT reconstruction not supported — context only in live mode
        error: oAny.error && dAny.error && fAny.error ? oAny.error : undefined,
      });
    } catch (e: any) {
      const err = { symbol: sym, error: e?.message || "fetch failed" };
      optimize.push(err); diverg.push(err); overview.push(err); fibonacci.push(err);
    }
  }

  const q = (rows: any[]) => rows.filter((r) => r.qualified).length;
  res.json({
    ok: true,
    date,
    optimize,
    divergence: diverg,
    fibonacci,
    overview,
    counts: { optimize: q(optimize), divergence: q(diverg), fibonacci: q(fibonacci) },
  });
});

// ==================== JOURNAL ENGINE (shared live + playback) ====================
// Gap-aware SL/TP resolution on daily candles. PENDING trades enter at the NEXT
// bar's open after the day they were taken (no same-bar cherry-picking).
function resolveTrade(t: JTrade, candles: Candle[], asOf: string | null): boolean {
  const series = asOf ? candles.filter((c) => day(c.date) <= asOf) : candles;
  if (!series.length) return false;
  let changed = false;
  const dir = t.direction === "SHORT" ? -1 : 1;

  if (t.status === "PENDING") {
    const ref = t.takenAsOf || day(t.takenAt);
    const idx = series.findIndex((c) => day(c.date) > ref);
    if (idx === -1) {
      // no next bar visible yet — still pending
      t.currentPrice = +series[series.length - 1].close.toFixed(4);
      return false;
    }
    t.entryDate = day(series[idx].date);
    t.entryPrice = +series[idx].open.toFixed(4);
    t.status = "OPEN";
    changed = true;
  }

  if (t.status !== "OPEN" || t.entryDate == null || t.entryPrice == null) return changed;

  const startIdx = series.findIndex((c) => day(c.date) >= (t.entryDate as string));
  if (startIdx === -1) return changed;

  for (let j = startIdx; j < series.length; j++) {
    const c = series[j];
    const isEntryBar = j === startIdx;
    let exit: number | null = null, reason: "SL_HIT" | "TARGET_HIT" | null = null;
    if (dir === 1) {
      // gap-aware: if a later bar OPENS beyond a level, fill at the open (realistic)
      if (!isEntryBar && c.open <= t.stopPrice) { exit = c.open; reason = "SL_HIT"; }
      else if (!isEntryBar && c.open >= t.targetPrice) { exit = c.open; reason = "TARGET_HIT"; }
      else if (c.low <= t.stopPrice) { exit = t.stopPrice; reason = "SL_HIT"; }
      else if (c.high >= t.targetPrice) { exit = t.targetPrice; reason = "TARGET_HIT"; }
    } else {
      if (!isEntryBar && c.open >= t.stopPrice) { exit = c.open; reason = "SL_HIT"; }
      else if (!isEntryBar && c.open <= t.targetPrice) { exit = c.open; reason = "TARGET_HIT"; }
      else if (c.high >= t.stopPrice) { exit = t.stopPrice; reason = "SL_HIT"; }
      else if (c.low <= t.targetPrice) { exit = t.targetPrice; reason = "TARGET_HIT"; }
    }
    if (exit != null && reason) {
      t.status = reason;
      t.exitPrice = +exit.toFixed(4);
      t.exitDate = day(c.date);
      t.returnPct = +((dir === 1 ? (exit - t.entryPrice) / t.entryPrice : (t.entryPrice - exit) / t.entryPrice) * 100).toFixed(2);
      t.currentPrice = t.exitPrice;
      t.unrealizedPct = undefined;
      return true;
    }
  }

  const last = series[series.length - 1].close;
  t.currentPrice = +last.toFixed(4);
  t.unrealizedPct = +((dir === 1 ? (last - t.entryPrice) / t.entryPrice : (t.entryPrice - last) / t.entryPrice) * 100).toFixed(2);
  return changed;
}

async function checkJournal(file: string, asOf: string | null, start: number) {
  const trades = readJ(file);
  let updated = 0;
  const failed: string[] = [];
  for (const t of trades) {
    if (t.status !== "OPEN" && t.status !== "PENDING") continue;
    try {
      const candles = await getHistory(t.symbol, start, "1d");
      const wasOpen = t.status === "OPEN" || t.status === "PENDING";
      const before = t.status;
      resolveTrade(t, candles, asOf);
      if (wasOpen && t.status !== "OPEN" && t.status !== "PENDING" && before !== t.status) updated++;
    } catch {
      failed.push(t.symbol);
    }
  }
  writeJ(file, trades);
  return { trades, updated, failedSymbols: failed };
}

function journalRoutes(base: string, file: string, isPlayback: boolean) {
  app.get(base, (req, res) => {
    res.json({ ok: true, trades: readJ(file) });
  });

  app.post(base, (req, res) => {
    const b = req.body || {};
    if (!b.symbol || !isFinite(+b.stop) || !isFinite(+b.target)) {
      return res.json({ ok: false, error: "symbol/stop/target required" });
    }
    const trades = readJ(file);
    const t: JTrade = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      symbol: String(b.symbol),
      name: b.name,
      direction: b.direction === "SHORT" ? "SHORT" : "LONG",
      strategyLabel: b.strategyLabel,
      module: b.module,
      takenAt: new Date().toISOString(),
      takenAsOf: isPlayback ? day(String(b.asOfDate || "")) : undefined,
      // both journals enter on the NEXT bar's open — consistent with the backtester
      entryDate: null,
      entryPrice: null,
      stopPrice: +b.stop,
      targetPrice: +b.target,
      status: "PENDING",
    };
    if (!isPlayback) t.takenAsOf = day(new Date().toISOString());
    trades.push(t);
    writeJ(file, trades);
    res.json({ ok: true, trade: t, trades });
  });

  app.post(`${base}/check`, async (req, res) => {
    try {
      const asOf = isPlayback ? day(String(req.body?.asOfDate || "")) || null : null;
      const start = startSec(String(req.body?.start || "2022-01-01"));
      const r = await checkJournal(file, asOf, start);
      res.json({ ok: true, ...r });
    } catch (e: any) {
      res.json({ ok: false, error: e?.message || "check failed" });
    }
  });

  app.post(`${base}/close`, async (req, res) => {
    const { id, exitPrice, asOfDate } = req.body || {};
    const trades = readJ(file);
    const t = trades.find((x) => x.id === id);
    if (!t) return res.json({ ok: false, error: "trade nahi mila" });
    if (t.status !== "OPEN") return res.json({ ok: false, error: "sirf OPEN trade close hota hai" });
    try {
      let px: number, xd: string;
      if (isPlayback) {
        // exit at the virtual day's CLOSE — no price cherry-picking
        const c = await getHistory(t.symbol, startSec("2022-01-01"), "1d");
        const series = upTo(c, day(String(asOfDate || "")));
        if (!series.length) return res.json({ ok: false, error: "us date ka data nahi" });
        px = series[series.length - 1].close;
        xd = day(series[series.length - 1].date);
      } else {
        px = +exitPrice;
        if (!isFinite(px) || px <= 0) return res.json({ ok: false, error: "valid exit price do" });
        xd = day(new Date().toISOString());
      }
      const dir = t.direction === "SHORT" ? -1 : 1;
      t.status = "CLOSED_MANUAL";
      t.exitPrice = +px.toFixed(4);
      t.exitDate = xd;
      t.returnPct = +((dir === 1 ? (px - (t.entryPrice as number)) / (t.entryPrice as number) : ((t.entryPrice as number) - px) / (t.entryPrice as number)) * 100).toFixed(2);
      writeJ(file, trades);
      res.json({ ok: true, trade: t, trades });
    } catch (e: any) {
      res.json({ ok: false, error: e?.message || "close failed" });
    }
  });

  app.post(`${base}/delete`, (req, res) => {
    const trades = readJ(file).filter((x) => x.id !== req.body?.id);
    writeJ(file, trades);
    res.json({ ok: true, trades });
  });

  app.post(`${base}/reset`, (_req, res) => {
    writeJ(file, []);
    res.json({ ok: true, trades: [] });
  });
}

journalRoutes("/api/trades", LIVE_JOURNAL, false);
journalRoutes("/api/playback/trades", PB_JOURNAL, true);

registerJournalRoutes(app);
registerScoreBacktest(app);
registerFundingTest(app);

// ==================== BOOT ====================
async function start() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: process.cwd(),
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      try {
        let html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Quant Desk running on http://0.0.0.0:${PORT}`));
}

start();

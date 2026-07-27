import fs from "fs";
import path from "path";
import type { Express } from "express";
import { fetchHistory, type Candle } from "./market";

// ------------------------------------------------------------------ storage
// JSON file store under ./data. NOTE: on Render free tier the disk is ephemeral —
// the journal resets on redeploy/restart. Fine for a practice journal.
const DATA_DIR = path.join(process.cwd(), "data");
function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ } }
function loadStore(file: string): any[] {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")); } catch { return []; }
}
function saveStore(file: string, trades: any[]) {
  ensureDir();
  try { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(trades, null, 2)); } catch { /* ignore */ }
}

function startSec(dateStr: string): number {
  const d = new Date((dateStr || "2022-01-01") + "T00:00:00Z");
  const s = Math.floor(d.getTime() / 1000);
  return isFinite(s) ? s : Math.floor(Date.now() / 1000) - 730 * 86400;
}
const dayOf = (s: string) => String(s).slice(0, 10);

// per-request candle cache so a /check across many trades fetches each symbol once
async function dailyCandles(symbol: string, start: string, cache: Map<string, Candle[] | null>): Promise<Candle[] | null> {
  if (cache.has(symbol)) return cache.get(symbol)!;
  try {
    const c = await fetchHistory(symbol, startSec(start), "1d");
    cache.set(symbol, c); return c;
  } catch { cache.set(symbol, null); return null; }
}

// ------------------------------------------------------------------ resolution
// Resolve a trade against daily candles (already bounded to <= asOf for playback).
// Entry = open of the first bar AFTER the taken date. Then gap-aware SL/target scan.
// Returns { changed } true if it moved from PENDING/OPEN to a closed state this pass.
function resolveTrade(t: any, candles: Candle[]): { changed: boolean } {
  const closed = t.status === "SL_HIT" || t.status === "TARGET_HIT" || t.status === "CLOSED_MANUAL";
  if (closed) return { changed: false };
  if (!candles || !candles.length) return { changed: false };

  const refDay = dayOf(t.takenAsOf || t.takenAt || "");
  // find entry bar (first candle strictly after the taken/as-of day)
  let entryIdx = candles.findIndex((c) => dayOf(c.date) > refDay);
  if (entryIdx === -1) { t.status = "PENDING"; return { changed: false }; }
  t.entryDate = candles[entryIdx].date;
  t.entryPrice = candles[entryIdx].open;
  if (t.status === "PENDING") t.status = "OPEN";

  const long = t.direction !== "SHORT";
  const stop = Number(t.stopPrice), tgt = Number(t.targetPrice), ep = Number(t.entryPrice);

  for (let i = entryIdx; i < candles.length; i++) {
    const c = candles[i];
    let hit: "" | "SL" | "TP" = "", xp = NaN;
    if (long) {
      const slGap = c.open <= stop, slHit = c.low <= stop;
      const tpGap = c.open >= tgt, tpHit = c.high >= tgt;
      if (slHit && tpHit) { hit = "SL"; xp = slGap ? c.open : stop; }        // ambiguous → conservative SL
      else if (slHit) { hit = "SL"; xp = slGap ? c.open : stop; }
      else if (tpHit) { hit = "TP"; xp = tpGap ? c.open : tgt; }
    } else {
      const slGap = c.open >= stop, slHit = c.high >= stop;
      const tpGap = c.open <= tgt, tpHit = c.low <= tgt;
      if (slHit && tpHit) { hit = "SL"; xp = slGap ? c.open : stop; }
      else if (slHit) { hit = "SL"; xp = slGap ? c.open : stop; }
      else if (tpHit) { hit = "TP"; xp = tpGap ? c.open : tgt; }
    }
    if (hit) {
      t.status = hit === "SL" ? "SL_HIT" : "TARGET_HIT";
      t.exitPrice = xp; t.exitDate = c.date;
      t.returnPct = +(((long ? xp - ep : ep - xp) / ep) * 100).toFixed(2);
      t.currentPrice = xp; t.unrealizedPct = t.returnPct;
      return { changed: true };
    }
  }
  // still open — mark to-date price
  const last = candles[candles.length - 1];
  t.currentPrice = last.close;
  t.unrealizedPct = +(((long ? last.close - ep : ep - last.close) / ep) * 100).toFixed(2);
  return { changed: false };
}

// ------------------------------------------------------------------ journal routes (live + playback share this)
function registerJournal(app: Express, opts: { prefix: string; file: string; playback: boolean }) {
  const { prefix, file, playback } = opts;

  app.get(prefix, (_req, res) => res.json({ trades: loadStore(file) }));

  app.post(prefix, (req, res) => {
    const b = req.body || {};
    if (b.stop == null || b.target == null || !b.symbol) return res.json({ ok: false, error: "symbol/stop/target chahiye" });
    const trade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: b.symbol, name: b.name || b.symbol,
      direction: b.direction === "SHORT" ? "SHORT" : "LONG",
      strategyLabel: b.strategyLabel || "", module: b.module || "",
      takenAt: new Date().toISOString(),
      takenAsOf: playback ? (b.asOfDate || null) : null,
      entryDate: null, entryPrice: null,
      stopPrice: Number(b.stop), targetPrice: Number(b.target),
      status: "PENDING" as const,
    };
    const trades = loadStore(file); trades.push(trade); saveStore(file, trades);
    res.json({ ok: true, trade });
  });

  app.post(`${prefix}/check`, async (req, res) => {
    const b = req.body || {};
    const start = b.start || "2022-01-01";
    const asOf = playback ? (b.asOfDate || null) : null;
    const trades = loadStore(file);
    const cache = new Map<string, Candle[] | null>();
    const failed = new Set<string>();
    let updated = 0;
    for (const t of trades) {
      let candles = await dailyCandles(t.symbol, start, cache);
      if (!candles) { failed.add(t.symbol); continue; }
      if (asOf) candles = candles.filter((c) => dayOf(c.date) <= asOf);
      const { changed } = resolveTrade(t, candles);
      if (changed) updated++;
    }
    saveStore(file, trades);
    res.json({ ok: true, trades, updated, failedSymbols: [...failed] });
  });

  app.post(`${prefix}/close`, async (req, res) => {
    const b = req.body || {};
    const trades = loadStore(file);
    const t = trades.find((x) => x.id === b.id);
    if (!t) return res.json({ ok: false, error: "trade nahi mila" });
    if (t.entryPrice == null) return res.json({ ok: false, error: "trade abhi entry nahi hua" });
    const long = t.direction !== "SHORT";
    let exitPrice = Number(b.exitPrice);
    let exitDate = new Date().toISOString().slice(0, 10);
    if (playback && b.asOfDate) {
      const cache = new Map<string, Candle[] | null>();
      let candles = await dailyCandles(t.symbol, b.start || "2022-01-01", cache);
      if (candles) {
        candles = candles.filter((c) => dayOf(c.date) <= b.asOfDate);
        if (candles.length) { exitPrice = candles[candles.length - 1].close; exitDate = candles[candles.length - 1].date; }
      }
    }
    if (!isFinite(exitPrice) || exitPrice <= 0) return res.json({ ok: false, error: "exit price invalid" });
    t.status = "CLOSED_MANUAL"; t.exitPrice = exitPrice; t.exitDate = exitDate;
    t.returnPct = +(((long ? exitPrice - t.entryPrice : t.entryPrice - exitPrice) / t.entryPrice) * 100).toFixed(2);
    t.currentPrice = exitPrice; t.unrealizedPct = t.returnPct;
    saveStore(file, trades);
    res.json({ ok: true, trade: t });
  });

  app.post(`${prefix}/delete`, (req, res) => {
    const b = req.body || {};
    const trades = loadStore(file).filter((x) => x.id !== b.id);
    saveStore(file, trades);
    res.json({ ok: true, trades });
  });

  app.post(`${prefix}/reset`, (_req, res) => {
    saveStore(file, []);
    res.json({ ok: true, trades: [] });
  });
}

// ------------------------------------------------------------------ playback axis + snapshot
function symbolsOf(req: any): string[] {
  return String(req.query.symbols || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function gateOf(req: any) {
  return {
    minWin: Number(req.query.minWin ?? 60),
    minPF: Number(req.query.minPF ?? 2),
    minTrades: Number(req.query.minTrades ?? 20),
  };
}
const HOLD = 20, ALLOW_SHORT = true;

export function registerJournalRoutes(app: Express) {
  registerJournal(app, { prefix: "/api/trades", file: "mytrades.json", playback: false });
  registerJournal(app, { prefix: "/api/playback/trades", file: "playback_trades.json", playback: true });

  // Trading-day axis (daily) across selected symbols.
  app.get("/api/playback/axis", async (req, res) => {
    const start = String(req.query.start || "2022-01-01");
    const days = new Set<string>();
    let any = false;
    for (const sym of symbolsOf(req)) {
      try {
        const c = await fetchHistory(sym, startSec(start), "1d");
        c.forEach((x) => days.add(dayOf(x.date)));
        any = true;
      } catch { /* skip */ }
    }
    if (!any) return res.json({ ok: false, error: "kisi bhi asset ka data nahi mila" });
    res.json({ ok: true, dates: [...days].sort() });
  });

  // Point-in-time snapshot disabled due to legacy refactor.
  app.get("/api/playback/snapshot", async (req, res) => {
    res.json({ ok: false, error: "Snapshot endpoint disabled (legacy strategy refactor)." });
  });
}

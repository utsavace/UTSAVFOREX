import type { Express } from "express";
import { fetchHistory, type Candle } from "./market";
import { walkForward, candidateSignals, divergence } from "./strategies";

// Conviction score (server copy). COT is not reconstructed historically, so `cot` stays null here.
function convictionScore(o: any, d: any): { score: number; live: string | null } {
  if (!o && !d) return { score: 0, live: null };
  const isLive = (x: any) => x && (x.live === "LONG" || x.live === "SHORT");
  const optLive = isLive(o) ? o.live : null;
  const divLive = isLive(d) ? d.live : null;
  const live: string | null = optLive || divLive;

  const credPF = (x: any) => (x && x.oosTrades >= 12 && x.oosPF > 0 && x.oosPF < 50 ? x.oosPF : null);
  const optPF = credPF(o), divPF = credPF(d);
  const q = (pf: number) => Math.max(0, Math.min(25, (pf - 1) * 25));

  let score = 0;
  if (optPF) score += q(optPF);
  if (divPF) score += q(divPF);
  if (optPF && divPF) score += (optPF >= 1.3 && divPF >= 1.3) ? 15 : 6;
  if (live) score += 20;
  if ((o && o.qualified) || (d && d.qualified)) score += 20;

  if (!live) score = Math.min(score, 35);
  const liveTr = optLive ? o?.oosTrades : divLive ? d?.oosTrades : 0;
  if (live && liveTr != null && liveTr < 10) score = Math.min(score, 40);

  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, live };
}

// Resolve a signal forward from candles[idx] (entry = next bar open). Gap-aware, capped at `horizon` bars.
function resolveForward(candles: Candle[], idx: number, dir: string, stop: number, tgt: number, horizon: number) {
  const entryIdx = idx + 1;
  if (entryIdx >= candles.length) return null;
  const ep = candles[entryIdx].open;
  if (!isFinite(ep) || ep <= 0) return null;
  const long = dir === "LONG";
  const end = Math.min(entryIdx + horizon, candles.length);
  for (let j = entryIdx; j < end; j++) {
    const c = candles[j];
    if (long) {
      const slGap = c.open <= stop, slHit = c.low <= stop, tpGap = c.open >= tgt, tpHit = c.high >= tgt;
      if (slHit && tpHit) return { outcome: "STOP", ret: ((slGap ? c.open : stop) - ep) / ep * 100 };
      if (slHit) return { outcome: "STOP", ret: ((slGap ? c.open : stop) - ep) / ep * 100 };
      if (tpHit) return { outcome: "TARGET", ret: ((tpGap ? c.open : tgt) - ep) / ep * 100 };
    } else {
      const slGap = c.open >= stop, slHit = c.high >= stop, tpGap = c.open <= tgt, tpHit = c.low <= tgt;
      if (slHit && tpHit) return { outcome: "STOP", ret: (ep - (slGap ? c.open : stop)) / ep * 100 };
      if (slHit) return { outcome: "STOP", ret: (ep - (slGap ? c.open : stop)) / ep * 100 };
      if (tpHit) return { outcome: "TARGET", ret: (ep - (tpGap ? c.open : tgt)) / ep * 100 };
    }
  }
  const last = candles[end - 1].close;
  return { outcome: "TIMEOUT", ret: (long ? last - ep : ep - last) / ep * 100 };
}

export function registerScoreBacktest(app: Express) {
  app.get("/api/score-backtest", async (req, res) => {
    const symbols = String(req.query.symbols || "").split(",").map((s) => s.trim()).filter(Boolean);
    const piv = Number(req.query.piv ?? 2);
    const rsiP = Number(req.query.rsiP ?? 14);
    const gate = {
      minWin: Number(req.query.minWin ?? 60),
      minPF: Number(req.query.minPF ?? 2),
      minTrades: Number(req.query.minTrades ?? 20),
    };
    const horizon = Number(req.query.horizon ?? 40);
    const stepDays = Number(req.query.stepDays ?? 10);
    const lookback = Number(req.query.lookback ?? 252);

    const HOLD = 20, ALLOW_SHORT = true;
    const mk = () => ({ count: 0, target: 0, stop: 0, timeout: 0, retSum: 0 });
    const B = { b70: mk(), b60: mk(), b50: mk(), b40: mk() };
    const bucketFor = (s: number) => (s >= 70 ? B.b70 : s >= 60 ? B.b60 : s >= 50 ? B.b50 : s >= 40 ? B.b40 : null);

    let testedDates = 0, failed: string[] = [], signalsFound = 0;

    for (const sym of symbols) {
      let candles: Candle[];
      try {
        candles = await fetchHistory(sym, Math.floor(new Date("2021-01-01T00:00:00Z").getTime() / 1000), "1d");
      } catch { failed.push(sym); continue; }
      const n = candles.length;
      if (n < 160) { failed.push(sym); continue; }
      const testStart = Math.max(90, n - lookback);
      for (let i = testStart; i < n - 1; i += stepDays) {
        const slice = candles.slice(0, i + 1);
        if (slice.length < 90) continue;
        testedDates++;
        const opt = walkForward(slice, candidateSignals(slice), HOLD, ALLOW_SHORT, gate);
        const { bull, bear } = divergence(slice, rsiP, piv, piv);
        const div = walkForward(slice, [{ name: "RSI Divergence", long: bull, short: bear }], HOLD, ALLOW_SHORT, gate);
        const { score, live } = convictionScore(opt, div);
        if (!live) continue;
        const optLiveOk = opt && (opt.live === "LONG" || opt.live === "SHORT") && opt.entry != null;
        const lv: any = optLiveOk ? opt : (div && div.entry != null ? div : null);
        if (!lv || lv.stop == null || lv.target == null) continue;
        const bucket = bucketFor(score);
        if (!bucket) continue;
        const r = resolveForward(candles, i, lv.live, lv.stop, lv.target, horizon);
        if (!r) continue;
        signalsFound++;
        bucket.count++;
        bucket.retSum += r.ret;
        if (r.outcome === "TARGET") bucket.target++;
        else if (r.outcome === "STOP") bucket.stop++;
        else bucket.timeout++;
      }
    }

    const fmt = (label: string, b: ReturnType<typeof mk>) => {
      const resolved = b.target + b.stop;
      return {
        label, count: b.count, target: b.target, stop: b.stop, timeout: b.timeout,
        winRate: resolved > 0 ? +((100 * b.target) / resolved).toFixed(1) : null,
        avgReturn: b.count > 0 ? +(b.retSum / b.count).toFixed(2) : null,
      };
    };

    res.json({
      ok: true,
      window: { lookbackDays: lookback, stepDays, horizon },
      testedDates, signalsFound, failedSymbols: failed,
      buckets: [fmt("70+", B.b70), fmt("60–69", B.b60), fmt("50–59", B.b50), fmt("40–49", B.b40)],
      note: "Historical score COT ke bina hai. Overlapping signals de-dupe nahi hue. Win rate = target ÷ (target+stop).",
    });
  });
}

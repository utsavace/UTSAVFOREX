import type { Express } from "express";
import { fetchHistory } from "./market";
import { ema } from "./indicators";

const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

export interface CBRate { currency: string; rate: number; bank: string; updated: string; }

export const CB_RATES: CBRate[] = [
  { currency: "USD", rate: 5.25, bank: "Federal Reserve", updated: "2024-09" },
  { currency: "AUD", rate: 4.35, bank: "RBA", updated: "2024-11" },
  { currency: "NZD", rate: 5.25, bank: "RBNZ", updated: "2024-10" },
  { currency: "GBP", rate: 5.00, bank: "Bank of England", updated: "2024-11" },
  { currency: "CAD", rate: 3.75, bank: "Bank of Canada", updated: "2024-12" },
  { currency: "EUR", rate: 3.40, bank: "ECB", updated: "2024-12" },
  { currency: "CHF", rate: 1.00, bank: "SNB", updated: "2024-12" },
  { currency: "JPY", rate: 0.25, bank: "Bank of Japan", updated: "2024-12" },
  { currency: "NOK", rate: 4.50, bank: "Norges Bank", updated: "2024-12" },
  { currency: "SEK", rate: 2.75, bank: "Riksbank", updated: "2024-12" },
];

const rateOf = (ccy: string) => CB_RATES.find((r) => r.currency === ccy)?.rate ?? null;

const FX_MAP: Record<string, [string, string]> = {
  "AUDUSD=X": ["AUD", "USD"], "NZDUSD=X": ["NZD", "USD"],
  "GBPUSD=X": ["GBP", "USD"], "EURUSD=X": ["EUR", "USD"],
  "USDJPY=X": ["USD", "JPY"], "USDCHF=X": ["USD", "CHF"],
  "USDCAD=X": ["USD", "CAD"], "AUDJPY=X": ["AUD", "JPY"],
  "NZDJPY=X": ["NZD", "JPY"], "GBPJPY=X": ["GBP", "JPY"],
  "EURJPY=X": ["EUR", "JPY"], "AUDNZD=X": ["AUD", "NZD"],
  "EURGBP=X": ["EUR", "GBP"], "GBPCHF=X": ["GBP", "CHF"],
  "AUDCHF=X": ["AUD", "CHF"], "NZDCHF=X": ["NZD", "CHF"],
};

export interface CarryInfo {
  symbol: string;
  baseCcy: string; quoteCcy: string;
  baseRate: number; quoteRate: number;
  differential: number;
  dailySwap: number;
  carryDirection: "LONG" | "SHORT" | "NEUTRAL";
  trendAlign: boolean;
  trendEma50: number; price: number;
  carryScore: number;
  note: string;
}

export function computeCarry(symbol: string, candles: { close: number }[]): CarryInfo | null {
  const pair = FX_MAP[symbol];
  if (!pair) return null;
  const [base, quote] = pair;
  const baseRate = rateOf(base);
  const quoteRate = rateOf(quote);
  if (baseRate == null || quoteRate == null) return null;

  const differential = baseRate - quoteRate;
  const dailySwap = differential / 365;

  const carryDirection: CarryInfo["carryDirection"] =
    differential > 0.5 ? "LONG" : differential < -0.5 ? "SHORT" : "NEUTRAL";

  let trendAlign = false;
  let trendEma50 = 0;
  const price = candles[candles.length - 1]?.close ?? 0;
  if (candles.length >= 20) {
    const closes = candles.map((c) => c.close);
    const e50 = ema(closes, Math.min(50, closes.length - 1));
    trendEma50 = e50[e50.length - 1];
    if (carryDirection === "LONG") trendAlign = price > trendEma50;
    else if (carryDirection === "SHORT") trendAlign = price < trendEma50;
  }

  let score = 0;
  const absDiff = Math.abs(differential);
  if (absDiff >= 4.0) score += 3;
  else if (absDiff >= 2.0) score += 2;
  else if (absDiff >= 0.75) score += 1;
  if (carryDirection !== "NEUTRAL" && trendAlign) score += 2;
  score = Math.min(5, score);

  let note = "";
  if (carryDirection === "NEUTRAL") note = "Differential too small (<0.5%) — no carry edge";
  else if (!trendAlign) note = `${carryDirection} carry but price trend opposes — wait`;
  else if (score >= 4) note = "Strong carry + trend aligned — watchlist";
  else note = "Carry present, trend ok";

  return {
    symbol, baseCcy: base, quoteCcy: quote,
    baseRate: baseRate!, quoteRate: quoteRate!,
    differential: +differential.toFixed(2),
    dailySwap: +dailySwap.toFixed(4),
    carryDirection, trendAlign,
    trendEma50: +trendEma50.toFixed(5),
    price: +price.toFixed(5),
    carryScore: score, note,
  };
}

export function registerCarryRoutes(app: Express) {
  app.get("/api/carry/rates", (_req, res) => {
    res.json({ ok: true, rates: CB_RATES, note: "Central bank policy rates — manually maintained." });
  });

  app.get("/api/carry", async (req, res) => {
    const syms = String(req.query.symbols || Object.keys(FX_MAP).join(","))
      .split(",").map((s) => s.trim()).filter(Boolean);
    const startSec = Math.floor(new Date("2022-01-01T00:00:00Z").getTime() / 1000);
    const out: any[] = [];

    for (const sym of syms) {
      if (!FX_MAP[sym]) { out.push({ symbol: sym, error: "not a supported FX pair for carry" }); continue; }
      try {
        const candles = await fetchHistory(sym, startSec, "1d");
        const info = computeCarry(sym, candles);
        if (!info) { out.push({ symbol: sym, error: "rates not available for this pair" }); continue; }
        out.push(info);
      } catch (e: any) {
        out.push({ symbol: sym, error: e?.message || "fetch failed" });
      }
    }

    out.sort((a, b) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      if ((b.carryScore ?? 0) !== (a.carryScore ?? 0)) return (b.carryScore ?? 0) - (a.carryScore ?? 0);
      return Math.abs(b.differential ?? 0) - Math.abs(a.differential ?? 0);
    });
    res.json({ ok: true, results: out, rates: CB_RATES });
  });
}

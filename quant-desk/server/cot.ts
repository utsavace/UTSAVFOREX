// COT (Commitments of Traders) — weekly CFTC positioning, used as a slow CONTEXT filter.
// Data: CFTC Socrata public feed (publicreporting.cftc.gov). Weekly (Fri release, Tue data).
// NOTE: dataset id + field names below are best-effort; verify against the live feed on deploy.
// The whole module is defensive: any failure -> null, and the app keeps working without COT.

const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const DATASET = "6dca-aqww"; // CFTC legacy futures-only combined report

export interface CotRecord { date: string; ncLong: number; ncShort: number; oi: number; }
export interface CotInfo {
  net: number; index: number; bias: "LONG-crowded" | "SHORT-crowded" | "neutral" | "-";
  contrarian: "LONG" | "SHORT" | "-"; weeks: number;
}

// app symbol -> { like: CFTC market name fragment, invert: pair quoted USD/XXX }
export const COT_MAP: Record<string, { like: string; invert?: boolean }> = {
  "GC=F": { like: "GOLD" },
  "SI=F": { like: "SILVER" },
  "CL=F": { like: "CRUDE OIL, LIGHT SWEET" },
  "NG=F": { like: "NATURAL GAS" },
  "EURUSD=X": { like: "EURO FX" },
  "GBPUSD=X": { like: "BRITISH POUND" },
  "AUDUSD=X": { like: "AUSTRALIAN DOLLAR" },
  "NZDUSD=X": { like: "NEW ZEALAND DOLLAR" },
  "USDJPY=X": { like: "JAPANESE YEN", invert: true },
  "USDCHF=X": { like: "SWISS FRANC", invert: true },
  "USDCAD=X": { like: "CANADIAN DOLLAR", invert: true },
  "BTC-USD": { like: "BITCOIN" },
  "ETH-USD": { like: "ETHER" },
  "^GSPC": { like: "S&P 500" },
  "^NDX": { like: "NASDAQ-100" },
  "^RUT": { like: "RUSSELL 2000" },
};

export function cotSupported(symbol: string): boolean {
  return symbol in COT_MAP;
}

// Pure: compute net-position index (percentile of latest net over lookback window).
export function computeCot(records: CotRecord[], invert = false, weeks = 52): CotInfo | null {
  if (!records || records.length < 10) return null;
  const recent = records.slice(0, weeks); // records assumed newest-first
  const nets = recent.map((r) => (r.ncLong - r.ncShort) * (invert ? -1 : 1));
  const latest = nets[0];
  const min = Math.min(...nets), max = Math.max(...nets);
  const index = max > min ? ((latest - min) / (max - min)) * 100 : 50;
  let bias: CotInfo["bias"] = "neutral";
  let contrarian: CotInfo["contrarian"] = "-";
  if (index >= 80) { bias = "LONG-crowded"; contrarian = "SHORT"; }
  else if (index <= 20) { bias = "SHORT-crowded"; contrarian = "LONG"; }
  return { net: Math.round(latest), index: Math.round(index), bias, contrarian, weeks: recent.length };
}

// In-memory cache — COT weekly release hota hai, 6 ghante cache kaafi hai
const cotCache = new Map<string, { at: number; info: CotInfo | null }>();
const COT_TTL = 6 * 60 * 60 * 1000;

export async function fetchCot(symbol: string, weeks = 52): Promise<CotInfo | null> {
  const m = COT_MAP[symbol];
  if (!m) return null;

  const hit = cotCache.get(symbol);
  if (hit && Date.now() - hit.at < COT_TTL) return hit.info;

  const like = m.like.replace(/'/g, "");
  // market name bhi select karo — multiple markets match hote hain (GOLD + MICRO GOLD etc.)
  const url =
    `https://publicreporting.cftc.gov/resource/${DATASET}.json` +
    `?$select=report_date_as_yyyy_mm_dd,market_and_exchange_names,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all` +
    `&$where=upper(market_and_exchange_names) like upper('%25${encodeURIComponent(like)}%25')` +
    `&$order=report_date_as_yyyy_mm_dd DESC&$limit=${(weeks + 4) * 4}`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }
    const rows: any[] = await r.json();
    if (!Array.isArray(rows) || !rows.length) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }

    // Group by market name — "GOLD" query MICRO GOLD bhi laata hai, mix mat karo
    const byMarket = new Map<string, CotRecord[]>();
    for (const x of rows) {
      const name = String(x.market_and_exchange_names || "?");
      (byMarket.get(name) ?? byMarket.set(name, []).get(name)!).push({
        date: x.report_date_as_yyyy_mm_dd,
        ncLong: Number(x.noncomm_positions_long_all) || 0,
        ncShort: Number(x.noncomm_positions_short_all) || 0,
        oi: Number(x.open_interest_all) || 0,
      });
    }

    // Sabse bada market chuno (highest avg open interest) = main contract
    let best: CotRecord[] | null = null;
    let bestOI = -1;
    for (const recs of byMarket.values()) {
      const avgOI = recs.reduce((a, r) => a + r.oi, 0) / recs.length;
      if (avgOI > bestOI) { bestOI = avgOI; best = recs; }
    }
    if (!best) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }

    const info = computeCot(best, m.invert, weeks);
    cotCache.set(symbol, { at: Date.now(), info });
    return info;
  } catch {
    return null;
  }
}

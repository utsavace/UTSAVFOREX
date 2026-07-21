// COT (Commitments of Traders) — CFTC weekly positioning data
// 3 Groups: Large Speculators, Commercials, Small Speculators

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; QuantDesk/1.0)", "Accept": "application/json" };
const DATASET = "6dca-aqww";

export interface CotRecord {
  date: string;
  ncLong: number; ncShort: number;
  commLong: number; commShort: number;
  smLong: number; smShort: number;
  oi: number;
}
export interface CotGroupInfo {
  net: number; index: number; pctLong: number;
  bias: "LONG-crowded" | "SHORT-crowded" | "neutral" | "-";
}
export interface CotInfo {
  largSpec: CotGroupInfo;
  commercials: CotGroupInfo;
  smallSpec: CotGroupInfo;
  net: number; index: number;
  bias: "LONG-crowded" | "SHORT-crowded" | "neutral" | "-";
  contrarian: "LONG" | "SHORT" | "-";
  weeks: number;
}

export const COT_MAP: Record<string, { like: string; invert?: boolean }> = {
  "GC=F":     { like: "GOLD" },
  "SI=F":     { like: "SILVER" },
  "CL=F":     { like: "CRUDE OIL, LIGHT SWEET" },
  "NG=F":     { like: "NATURAL GAS" },
  "HG=F":     { like: "COPPER" },
  "PL=F":     { like: "PLATINUM" },
  "EURUSD=X": { like: "EURO FX" },
  "GBPUSD=X": { like: "BRITISH POUND" },
  "AUDUSD=X": { like: "AUSTRALIAN DOLLAR" },
  "NZDUSD=X": { like: "NEW ZEALAND DOLLAR" },
  "USDJPY=X": { like: "JAPANESE YEN",    invert: true },
  "USDCHF=X": { like: "SWISS FRANC",     invert: true },
  "USDCAD=X": { like: "CANADIAN DOLLAR", invert: true },
  "BTC-USD":  { like: "BITCOIN" },
  "ETH-USD":  { like: "ETHER" },
  "^GSPC":    { like: "S&P 500" },
  "^NDX":     { like: "NASDAQ-100" },
  "^RUT":     { like: "RUSSELL 2000" },
};

export function cotSupported(s: string): boolean { return s in COT_MAP; }

function makeGroup(nets: number[], latest: number, longPos: number, oi: number): CotGroupInfo {
  const mn = Math.min(...nets), mx = Math.max(...nets);
  const index = mx > mn ? Math.round(((latest - mn) / (mx - mn)) * 100) : 50;
  const pctLong = oi > 0 ? Math.round((longPos / oi) * 100) : 50;
  const bias: CotGroupInfo["bias"] = index >= 80 ? "LONG-crowded" : index <= 20 ? "SHORT-crowded" : "neutral";
  return { net: Math.round(latest), index, pctLong, bias };
}

export function computeCot(records: CotRecord[], invert = false, weeks = 52): CotInfo | null {
  if (!records?.length || records.length < 10) return null;
  const r = records.slice(0, weeks);
  const s = invert ? -1 : 1;
  const lsN  = r.map(x => (x.ncLong   - x.ncShort)   * s);
  const comN = r.map(x => (x.commLong  - x.commShort) * s);
  const smN  = r.map(x => (x.smLong    - x.smShort)   * s);
  const oi0  = r[0].oi;
  const ls   = makeGroup(lsN,  lsN[0],  invert ? r[0].ncShort   : r[0].ncLong,   oi0);
  const com  = makeGroup(comN, comN[0], invert ? r[0].commShort  : r[0].commLong,  oi0);
  const sm   = makeGroup(smN,  smN[0],  invert ? r[0].smShort    : r[0].smLong,    oi0);
  const contrarian: "LONG"|"SHORT"|"-" = ls.index >= 80 ? "SHORT" : ls.index <= 20 ? "LONG" : "-";
  return { largSpec: ls, commercials: com, smallSpec: sm, net: ls.net, index: ls.index, bias: ls.bias as CotInfo["bias"], contrarian, weeks: r.length };
}

const cotCache = new Map<string, { at: number; info: CotInfo | null }>();
const COT_TTL = 6 * 60 * 60 * 1000;

export async function fetchCot(symbol: string, weeks = 52): Promise<CotInfo | null> {
  const m = COT_MAP[symbol];
  if (!m) return null;
  const hit = cotCache.get(symbol);
  if (hit && Date.now() - hit.at < COT_TTL) return hit.info;

  const like = m.like.replace(/'/g, "");
  // Use % directly — Socrata API handles this correctly
  const params = new URLSearchParams({
    "$select": "report_date_as_yyyy_mm_dd,market_and_exchange_names,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,nonrept_positions_long_all,nonrept_positions_short_all,open_interest_all",
    "$where": `upper(market_and_exchange_names) like upper('%${like}%')`,
    "$order": "report_date_as_yyyy_mm_dd DESC",
    "$limit": String((weeks + 4) * 4),
  });
  const url = `https://publicreporting.cftc.gov/resource/${DATASET}.json?${params}`;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[COT] ${symbol}: HTTP ${res.status}`);
      cotCache.set(symbol, { at: Date.now(), info: null }); return null;
    }
    const rows: any[] = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      console.error(`[COT] ${symbol}: empty rows for like="${like}"`);
      cotCache.set(symbol, { at: Date.now(), info: null }); return null;
    }

    // Group by market name — pick highest avg OI (main contract, not micro)
    const byMarket = new Map<string, CotRecord[]>();
    for (const x of rows) {
      const name = String(x.market_and_exchange_names || "?");
      if (!byMarket.has(name)) byMarket.set(name, []);
      byMarket.get(name)!.push({
        date:      x.report_date_as_yyyy_mm_dd,
        ncLong:    Number(x.noncomm_positions_long_all)  || 0,
        ncShort:   Number(x.noncomm_positions_short_all) || 0,
        commLong:  Number(x.comm_positions_long_all)     || 0,
        commShort: Number(x.comm_positions_short_all)    || 0,
        smLong:    Number(x.nonrept_positions_long_all)  || 0,
        smShort:   Number(x.nonrept_positions_short_all) || 0,
        oi:        Number(x.open_interest_all)           || 0,
      });
    }
    let best: CotRecord[] | null = null, bestOI = -1;
    for (const recs of byMarket.values()) {
      const avg = recs.reduce((a, r) => a + r.oi, 0) / recs.length;
      if (avg > bestOI) { bestOI = avg; best = recs; }
    }
    if (!best) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }
    const info = computeCot(best, m.invert, weeks);
    cotCache.set(symbol, { at: Date.now(), info });
    return info;
  } catch (e: any) {
    console.error(`[COT] ${symbol}: ${e?.message}`);
    cotCache.set(symbol, { at: Date.now(), info: null });
    return null;
  }
}

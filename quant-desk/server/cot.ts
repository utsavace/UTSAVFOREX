// COT (Commitments of Traders) — weekly CFTC positioning data
// Source: CFTC Socrata API (publicreporting.cftc.gov/resource/6dca-aqww.json)
// 3 Groups: Large Speculators (NonComm), Commercials (Comm), Small Speculators (NonRept)
//
// EXACT field names from CFTC CSV header (case-insensitive in Socrata):
// NonComm_Positions_Long_All, NonComm_Positions_Short_All  → Large Speculators
// Comm_Positions_Long_All, Comm_Positions_Short_All        → Commercials
// NonRept_Positions_Long_All, NonRept_Positions_Short_All  → Small Speculators
// Open_Interest_All

const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const DATASET = "6dca-aqww";

export interface CotRecord {
  date: string;
  ncLong: number; ncShort: number;      // Large Speculators
  commLong: number; commShort: number;  // Commercials
  smLong: number; smShort: number;      // Small Speculators
  oi: number;
}

export interface CotGroupInfo {
  net: number;
  index: number;
  pctLong: number;
  bias: "LONG-crowded" | "SHORT-crowded" | "neutral" | "-";
}

export interface CotInfo {
  largSpec: CotGroupInfo;
  commercials: CotGroupInfo;
  smallSpec: CotGroupInfo;
  // Legacy fields (backward compat — uses largSpec)
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

export function cotSupported(symbol: string): boolean {
  return symbol in COT_MAP;
}

function makeGroup(nets: number[], latest: number, longPos: number, oi: number): CotGroupInfo {
  const min = Math.min(...nets), max = Math.max(...nets);
  const index = max > min ? Math.round(((latest - min) / (max - min)) * 100) : 50;
  const pctLong = oi > 0 ? Math.round((longPos / oi) * 100) : 50;
  let bias: CotGroupInfo["bias"] = "neutral";
  if (index >= 80) bias = "LONG-crowded";
  else if (index <= 20) bias = "SHORT-crowded";
  return { net: Math.round(latest), index, pctLong, bias };
}

export function computeCot(records: CotRecord[], invert = false, weeks = 52): CotInfo | null {
  if (!records || records.length < 10) return null;
  const r = records.slice(0, weeks);
  const s = invert ? -1 : 1;

  const lsNets  = r.map(x => (x.ncLong   - x.ncShort)   * s);
  const comNets = r.map(x => (x.commLong  - x.commShort) * s);
  const smNets  = r.map(x => (x.smLong    - x.smShort)   * s);

  const oi0 = r[0].oi;
  const ls  = makeGroup(lsNets,  lsNets[0],  invert ? r[0].ncShort   : r[0].ncLong,   oi0);
  const com = makeGroup(comNets, comNets[0], invert ? r[0].commShort  : r[0].commLong,  oi0);
  const sm  = makeGroup(smNets,  smNets[0],  invert ? r[0].smShort    : r[0].smLong,    oi0);

  let contrarian: "LONG" | "SHORT" | "-" = "-";
  if (ls.index >= 80) contrarian = "SHORT";
  else if (ls.index <= 20) contrarian = "LONG";

  return {
    largSpec: ls,
    commercials: com,
    smallSpec: sm,
    net: ls.net,
    index: ls.index,
    bias: ls.bias as CotInfo["bias"],
    contrarian,
    weeks: r.length,
  };
}

const cotCache = new Map<string, { at: number; info: CotInfo | null }>();
const COT_TTL = 6 * 60 * 60 * 1000;

export async function fetchCot(symbol: string, weeks = 52): Promise<CotInfo | null> {
  const m = COT_MAP[symbol];
  if (!m) return null;

  const hit = cotCache.get(symbol);
  if (hit && Date.now() - hit.at < COT_TTL) return hit.info;

  const like = m.like.replace(/'/g, "");

  // Exact Socrata field names from CFTC CSV (lowercase in JSON API)
  const url =
    `https://publicreporting.cftc.gov/resource/${DATASET}.json` +
    `?$select=` +
      `report_date_as_yyyy_mm_dd,` +
      `market_and_exchange_names,` +
      `noncomm_positions_long_all,` +
      `noncomm_positions_short_all,` +
      `comm_positions_long_all,` +
      `comm_positions_short_all,` +
      `nonrept_positions_long_all,` +
      `nonrept_positions_short_all,` +
      `open_interest_all` +
    `&$where=upper(market_and_exchange_names) like upper('%25${encodeURIComponent(like)}%25')` +
    `&$order=report_date_as_yyyy_mm_dd DESC` +
    `&$limit=${(weeks + 4) * 4}`;

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`[COT] HTTP ${res.status} for ${symbol}: ${await res.text().catch(()=>"")}`);
      cotCache.set(symbol, { at: Date.now(), info: null }); return null;
    }
    const rows: any[] = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      console.error(`[COT] Empty response for ${symbol}, like="${like}"`);
      cotCache.set(symbol, { at: Date.now(), info: null }); return null;
    }

    // Group by market name → pick highest avg OI (main contract, not micro)
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
      const avgOI = recs.reduce((a, r) => a + r.oi, 0) / recs.length;
      if (avgOI > bestOI) { bestOI = avgOI; best = recs; }
    }
    if (!best) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }

    const info = computeCot(best, m.invert, weeks);
    cotCache.set(symbol, { at: Date.now(), info });
    return info;
  } catch (e: any) {
    console.error(`[COT] Exception for ${symbol}:`, e?.message);
    cotCache.set(symbol, { at: Date.now(), info: null });
    return null;
  }
}
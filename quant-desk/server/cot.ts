// COT (Commitments of Traders) — weekly CFTC positioning data
// Source: CFTC Socrata public feed (publicreporting.cftc.gov)
// Shows 3 groups: Commercials, Large Speculators, Small Speculators

const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const DATASET = "6dca-aqww";

export interface CotRecord {
  date: string;
  // Large Speculators (Non-Commercial) — hedge funds, institutions
  ncLong: number; ncShort: number;
  // Commercials — hedgers (farmers, oil cos, banks)
  commLong: number; commShort: number;
  // Small Speculators (Non-Reportable) — retail traders
  smallLong: number; smallShort: number;
  oi: number;
}

export interface CotGroupInfo {
  net: number;          // net contracts (long - short)
  index: number;        // 0-100 percentile vs last 52 weeks
  pctLong: number;      // % of OI that is long
  bias: "LONG-crowded" | "SHORT-crowded" | "neutral" | "-";
}

export interface CotInfo {
  // Large Speculators (hedge funds) — trend followers
  largSpec: CotGroupInfo;
  // Commercials (smart money hedgers) — contrarian
  commercials: CotGroupInfo;
  // Small Speculators (retail) — usually wrong at extremes
  smallSpec: CotGroupInfo;
  // Legacy fields for backward compat
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

function computeGroup(nets: number[], latestNet: number, latestLong: number, latestOI: number): CotGroupInfo {
  const min = Math.min(...nets), max = Math.max(...nets);
  const index = max > min ? Math.round(((latestNet - min) / (max - min)) * 100) : 50;
  const pctLong = latestOI > 0 ? Math.round((latestLong / latestOI) * 100) : 50;
  let bias: CotGroupInfo["bias"] = "neutral";
  if (index >= 80) bias = "LONG-crowded";
  else if (index <= 20) bias = "SHORT-crowded";
  return { net: Math.round(latestNet), index, pctLong, bias };
}

export function computeCot(records: CotRecord[], invert = false, weeks = 52): CotInfo | null {
  if (!records || records.length < 10) return null;
  const recent = records.slice(0, weeks);
  const inv = invert ? -1 : 1;

  // Large Speculators
  const lsNets  = recent.map(r => (r.ncLong   - r.ncShort)   * inv);
  // Commercials
  const comNets = recent.map(r => (r.commLong  - r.commShort) * inv);
  // Small Speculators
  const smNets  = recent.map(r => (r.smallLong - r.smallShort)* inv);

  const ls  = computeGroup(lsNets,  lsNets[0],  invert?recent[0].ncShort:recent[0].ncLong,   recent[0].oi);
  const com = computeGroup(comNets, comNets[0], invert?recent[0].commShort:recent[0].commLong, recent[0].oi);
  const sm  = computeGroup(smNets,  smNets[0],  invert?recent[0].smallShort:recent[0].smallLong, recent[0].oi);

  // Legacy: use Large Speculators for backward compat
  let bias: CotInfo["bias"] = ls.bias as CotInfo["bias"];
  let contrarian: "LONG" | "SHORT" | "-" = "-";
  if (ls.index >= 80) contrarian = "SHORT";
  else if (ls.index <= 20) contrarian = "LONG";

  return {
    largSpec: ls,
    commercials: com,
    smallSpec: sm,
    net: ls.net,
    index: ls.index,
    bias,
    contrarian,
    weeks: recent.length,
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
  const url =
    `https://publicreporting.cftc.gov/resource/${DATASET}.json` +
    `?$select=report_date_as_yyyy_mm_dd,market_and_exchange_names,` +
    // Large Speculators
    `noncomm_positions_long_all,noncomm_positions_short_all,` +
    // Commercials
    `comm_positions_long_all,comm_positions_short_all,` +
    // Small Speculators (non-reportable)
    `nonrept_positions_long_all,nonrept_positions_short_all,` +
    `open_interest_all` +
    `&$where=upper(market_and_exchange_names) like upper('%25${encodeURIComponent(like)}%25')` +
    `&$order=report_date_as_yyyy_mm_dd DESC&$limit=${(weeks + 4) * 4}`;

  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }
    const rows: any[] = await r.json();
    if (!Array.isArray(rows) || !rows.length) { cotCache.set(symbol, { at: Date.now(), info: null }); return null; }

    // Group by market name — pick highest OI (main contract)
    const byMarket = new Map<string, CotRecord[]>();
    for (const x of rows) {
      const name = String(x.market_and_exchange_names || "?");
      (byMarket.get(name) ?? byMarket.set(name, []).get(name)!).push({
        date:       x.report_date_as_yyyy_mm_dd,
        ncLong:     Number(x.noncomm_positions_long_all)  || 0,
        ncShort:    Number(x.noncomm_positions_short_all) || 0,
        commLong:   Number(x.comm_positions_long_all)     || 0,
        commShort:  Number(x.comm_positions_short_all)    || 0,
        smallLong:  Number(x.nonrept_positions_long_all)  || 0,
        smallShort: Number(x.nonrept_positions_short_all) || 0,
        oi:         Number(x.open_interest_all)           || 0,
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
  } catch {
    return null;
  }
}
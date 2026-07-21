import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from "recharts";
import { MyTrades } from "./components/MyTrades";

type Asset = { sym: string; name: string; cat: "Forex" | "Crypto" | "Comm" | "Stock" | "Index" };

// ── WEAK ASSETS — backtested consistently losing (10yr OOS) ──
// Forex: USDJPY (PF 0.72), AUDUSD (PF 0.34) — RSI25/75 nahi chalta
// Stock: TSLA (PF 0.24), INTC (PF 0.00) — 5-EMA nahi chalta
// Crypto: BTC-USD (PF 0.58 on CryptoEMA) — marginal only
const WEAK_ASSETS = new Set(["USDJPY=X", "AUDUSD=X", "TSLA", "INTC"]);

const ASSETS: Asset[] = [
// ── Forex Pairs (28) — RSI 25/75 ──
  { sym: "EURUSD=X", name: "EUR/USD", cat: "Forex" },
  { sym: "GBPUSD=X", name: "GBP/USD", cat: "Forex" },
  { sym: "USDJPY=X", name: "USD/JPY ⚠️", cat: "Forex" },
  { sym: "USDCHF=X", name: "USD/CHF", cat: "Forex" },
  { sym: "AUDUSD=X", name: "AUD/USD ⚠️", cat: "Forex" },
  { sym: "USDCAD=X", name: "USD/CAD", cat: "Forex" },
  { sym: "NZDUSD=X", name: "NZD/USD", cat: "Forex" },
  { sym: "EURJPY=X", name: "EUR/JPY", cat: "Forex" },
  { sym: "GBPJPY=X", name: "GBP/JPY", cat: "Forex" },
  { sym: "EURGBP=X", name: "EUR/GBP", cat: "Forex" },
  { sym: "AUDJPY=X", name: "AUD/JPY", cat: "Forex" },
  { sym: "GBPCHF=X", name: "GBP/CHF", cat: "Forex" },
  { sym: "EURCHF=X", name: "EUR/CHF", cat: "Forex" },
  { sym: "GBPCAD=X", name: "GBP/CAD", cat: "Forex" },
  { sym: "GBPAUD=X", name: "GBP/AUD", cat: "Forex" },
  { sym: "GBPNZD=X", name: "GBP/NZD", cat: "Forex" },
  { sym: "EURCAD=X", name: "EUR/CAD", cat: "Forex" },
  { sym: "EURAUD=X", name: "EUR/AUD", cat: "Forex" },
  { sym: "EURNZD=X", name: "EUR/NZD", cat: "Forex" },
  { sym: "CADJPY=X", name: "CAD/JPY", cat: "Forex" },
  { sym: "AUDCAD=X", name: "AUD/CAD", cat: "Forex" },
  { sym: "AUDNZD=X", name: "AUD/NZD", cat: "Forex" },
  { sym: "AUDCHF=X", name: "AUD/CHF", cat: "Forex" },
  { sym: "NZDJPY=X", name: "NZD/JPY", cat: "Forex" },
  { sym: "NZDCAD=X", name: "NZD/CAD", cat: "Forex" },
  { sym: "CHFJPY=X", name: "CHF/JPY", cat: "Forex" },
  { sym: "CADCHF=X", name: "CAD/CHF", cat: "Forex" },
  { sym: "NZDCHF=X", name: "NZD/CHF", cat: "Forex" },
  // ── Crypto (10) — Trend Analysis + Channel 55/20 ──
  { sym: "BTC-USD", name: "Bitcoin", cat: "Crypto" },
  { sym: "ETH-USD", name: "Ethereum", cat: "Crypto" },
  { sym: "SOL-USD", name: "Solana", cat: "Crypto" },
  { sym: "XRP-USD", name: "XRP", cat: "Crypto" },
  { sym: "BNB-USD", name: "BNB", cat: "Crypto" },
  { sym: "DOGE-USD", name: "Dogecoin", cat: "Crypto" },
  { sym: "ADA-USD", name: "Cardano", cat: "Crypto" },
  { sym: "LINK-USD", name: "Chainlink", cat: "Crypto" },
  { sym: "AVAX-USD", name: "Avalanche", cat: "Crypto" },
  { sym: "DOT-USD", name: "Polkadot", cat: "Crypto" },
  // ── Commodities (4) — 5-EMA (Silver+Copper best) ──
  { sym: "GC=F", name: "Gold", cat: "Comm" },
  { sym: "SI=F", name: "Silver ⭐", cat: "Comm" },
  { sym: "HG=F", name: "Copper ⭐", cat: "Comm" },
  { sym: "PL=F", name: "Platinum", cat: "Comm" },
  // ── Nasdaq 100 (92 stocks) — Channel 55/20 + 5-EMA ──
  { sym: "NVDA", name: "Nvidia", cat: "Stock" },
  { sym: "AAPL", name: "Apple", cat: "Stock" },
  { sym: "MSFT", name: "Microsoft", cat: "Stock" },
  { sym: "AMZN", name: "Amazon", cat: "Stock" },
  { sym: "GOOGL", name: "Alphabet A", cat: "Stock" },
  { sym: "GOOG", name: "Alphabet C", cat: "Stock" },
  { sym: "AVGO", name: "Broadcom", cat: "Stock" },
  { sym: "META", name: "Meta", cat: "Stock" },
  { sym: "TSLA", name: "Tesla", cat: "Stock" },
  { sym: "MU", name: "Micron", cat: "Stock" },
  { sym: "WMT", name: "Walmart", cat: "Stock" },
  { sym: "AMD", name: "AMD", cat: "Stock" },
  { sym: "ASML", name: "ASML", cat: "Stock" },
  { sym: "INTC", name: "Intel", cat: "Stock" },
  { sym: "CSCO", name: "Cisco", cat: "Stock" },
  { sym: "AMAT", name: "Applied Materials", cat: "Stock" },
  { sym: "COST", name: "Costco", cat: "Stock" },
  { sym: "LRCX", name: "Lam Research", cat: "Stock" },
  { sym: "PLTR", name: "Palantir", cat: "Stock" },
  { sym: "ARM", name: "ARM Holdings", cat: "Stock" },
  { sym: "NFLX", name: "Netflix", cat: "Stock" },
  { sym: "PANW", name: "Palo Alto", cat: "Stock" },
  { sym: "KLAC", name: "KLA Corp", cat: "Stock" },
  { sym: "TXN", name: "Texas Instruments", cat: "Stock" },
  { sym: "LIN", name: "Linde", cat: "Stock" },
  { sym: "TMUS", name: "T-Mobile", cat: "Stock" },
  { sym: "CRWD", name: "CrowdStrike", cat: "Stock" },
  { sym: "AMGN", name: "Amgen", cat: "Stock" },
  { sym: "PEP", name: "PepsiCo", cat: "Stock" },
  { sym: "STX", name: "Seagate", cat: "Stock" },
  { sym: "ADI", name: "Analog Devices", cat: "Stock" },
  { sym: "QCOM", name: "Qualcomm", cat: "Stock" },
  { sym: "MRVL", name: "Marvell Tech", cat: "Stock" },
  { sym: "WDC", name: "Western Digital", cat: "Stock" },
  { sym: "GILD", name: "Gilead", cat: "Stock" },
  { sym: "SHOP", name: "Shopify", cat: "Stock" },
  { sym: "APP", name: "AppLovin", cat: "Stock" },
  { sym: "BKNG", name: "Booking Holdings", cat: "Stock" },
  { sym: "ISRG", name: "Intuitive Surgical", cat: "Stock" },
  { sym: "PDD", name: "PDD Holdings", cat: "Stock" },
  { sym: "VRTX", name: "Vertex Pharma", cat: "Stock" },
  { sym: "SBUX", name: "Starbucks", cat: "Stock" },
  { sym: "FTNT", name: "Fortinet", cat: "Stock" },
  { sym: "ADP", name: "ADP", cat: "Stock" },
  { sym: "MAR", name: "Marriott", cat: "Stock" },
  { sym: "DDOG", name: "Datadog", cat: "Stock" },
  { sym: "MNST", name: "Monster Beverage", cat: "Stock" },
  { sym: "ADBE", name: "Adobe", cat: "Stock" },
  { sym: "CSX", name: "CSX Corp", cat: "Stock" },
  { sym: "MELI", name: "MercadoLibre", cat: "Stock" },
  { sym: "CDNS", name: "Cadence Design", cat: "Stock" },
  { sym: "CEG", name: "Constellation Energy", cat: "Stock" },
  { sym: "ABNB", name: "Airbnb", cat: "Stock" },
  { sym: "CMCSA", name: "Comcast", cat: "Stock" },
  { sym: "DASH", name: "DoorDash", cat: "Stock" },
  { sym: "CTAS", name: "Cintas", cat: "Stock" },
  { sym: "INTU", name: "Intuit", cat: "Stock" },
  { sym: "MDLZ", name: "Mondelez", cat: "Stock" },
  { sym: "ROST", name: "Ross Stores", cat: "Stock" },
  { sym: "SNPS", name: "Synopsys", cat: "Stock" },
  { sym: "HON", name: "Honeywell", cat: "Stock" },
  { sym: "AEP", name: "American Electric", cat: "Stock" },
  { sym: "REGN", name: "Regeneron", cat: "Stock" },
  { sym: "ORLY", name: "OReilly Auto", cat: "Stock" },
  { sym: "NXPI", name: "NXP Semi", cat: "Stock" },
  { sym: "PCAR", name: "Paccar", cat: "Stock" },
  { sym: "MPWR", name: "Monolithic Power", cat: "Stock" },
  { sym: "WBD", name: "Warner Bros Discovery", cat: "Stock" },
  { sym: "FANG", name: "Diamondback Energy", cat: "Stock" },
  { sym: "BKR", name: "Baker Hughes", cat: "Stock" },
  { sym: "EA", name: "Electronic Arts", cat: "Stock" },
  { sym: "TER", name: "Teradyne", cat: "Stock" },
  { sym: "FAST", name: "Fastenal", cat: "Stock" },
  { sym: "PYPL", name: "PayPal", cat: "Stock" },
  { sym: "XEL", name: "Xcel Energy", cat: "Stock" },
  { sym: "ODFL", name: "Old Dominion", cat: "Stock" },
  { sym: "EXC", name: "Exelon", cat: "Stock" },
  { sym: "CCEP", name: "Coca-Cola EP", cat: "Stock" },
  { sym: "ADSK", name: "Autodesk", cat: "Stock" },
  { sym: "IDXX", name: "IDEXX Labs", cat: "Stock" },
  { sym: "TTWO", name: "Take-Two", cat: "Stock" },
  { sym: "MCHP", name: "Microchip Tech", cat: "Stock" },
  { sym: "AXON", name: "Axon Enterprise", cat: "Stock" },
  { sym: "KDP", name: "Keurig Dr Pepper", cat: "Stock" },
  { sym: "PAYX", name: "Paychex", cat: "Stock" },
  { sym: "ROP", name: "Roper Tech", cat: "Stock" },
  { sym: "ALNY", name: "Alnylam Pharma", cat: "Stock" },
  { sym: "WDAY", name: "Workday", cat: "Stock" },
  { sym: "KHC", name: "Kraft Heinz", cat: "Stock" },
  { sym: "DXCM", name: "DexCom", cat: "Stock" },
  { sym: "GEHC", name: "GE Healthcare", cat: "Stock" },
  { sym: "CPRT", name: "Copart", cat: "Stock" },
  // ── Indices (3) — Channel 55/20 ──
  { sym: "^GSPC", name: "S&P 500", cat: "Index" },
  { sym: "^NDX", name: "Nasdaq 100", cat: "Index" },
  { sym: "^RUT", name: "Russell 2000", cat: "Index" },
];

const NAME: Record<string, string> = Object.fromEntries(ASSETS.map(a => [a.sym, a.name]));
const CAT:  Record<string, string> = Object.fromEntries(ASSETS.map(a => [a.sym, a.cat]));

const CAT_COLOR: Record<string, string> = {
  Forex: "#60a5fa", Crypto: "#a78bfa", Comm: "#fbbf24", Stock: "#34d399", Index: "#f87171",
};
const STRAT_COLOR: Record<string, string> = {
  "5-EMA Filtered":    "#fbbf24",
  "Crypto EMA 20/50":  "#a78bfa",
  "Forex RSI 25/75":   "#34d399",
};

const price = (v: any) => {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  const a = Math.abs(v);
  return v.toFixed(a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : 5);
};
const todayMinus = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

function Pill({ v }: { v: string }) {
  const k = v === "-" || !v ? "none" : v;
  return <span className={`pill ${k}`}>{v === "-" ? "flat" : v}</span>;
}

const getCotExplanation = (cot: any, sigDir?: string) => {
  if (!cot) return "";
  const idx = cot.index;
  const bias = cot.bias; // "LONG-crowded" | "SHORT-crowded" | "neutral"
  
  if (bias === "LONG-crowded") {
    if (sigDir === "LONG") {
      return `⚠️ Be Careful: Bade players 1 saal ke high ke mukable extremely long (${idx}%) hain (over-crowded). Upper side par reverse hone ka risk hai, isliye BUY trade force mat karo!`;
    }
    if (sigDir === "SHORT") {
      return `✅ Confluence: Bade players heavily long (${idx}%) aur crowded hain. Peak se reversal aane ke chances high hain, isliye SHORT trade bilkul sahi timed hai!`;
    }
    return `Bade players heavily LONG (${idx}%) hain, isliye upar trend thoda stretched (crowded) lag raha hai. Caution on fresh buying.`;
  }
  
  if (bias === "SHORT-crowded") {
    if (sigDir === "SHORT") {
      return `⚠️ Be Careful: Bade players 1 saal ke low ke mukable extremely short (${idx}%) hain (over-crowded). Bottom par short positions riskier hain, bounce ya squeeze ho sakta hai!`;
    }
    if (sigDir === "LONG") {
      return `✅ Confluence: Bade players heavily short (${idx}%) aur crowded hain. Bottom range se bounce/short-squeeze ho sakta hai, isliye LONG trade bilkul sahi aligned hai!`;
    }
    return `Bade players heavily SHORT (${idx}%) hain. Downside heavily crowded hai, bottom out ya sharp bounce expected hai.`;
  }
  
  // Neutral Range (21% to 79%)
  return `ℹ️ Neutral range (${idx}%): Bade players normal bounds me hain. Koi extreme crowd ya squeeze risk nahi hai. Market standard direction me safely move hoga, force mat karo.`;
};

// ══════════════════════════════════════════════
//  PLAYBACK — Market replay day-by-day
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  PLAYBACK — Market replay + paper trades
// ══════════════════════════════════════════════
type PaperTrade = {
  id: string; symbol: string; strategy: string; dir: "LONG" | "SHORT";
  signalDate: string; plannedEntry: number; entryDate: string | null; entryPrice: number | null;
  stop: number; target: number;
  status: "PENDING" | "OPEN" | "SL_HIT" | "TARGET_HIT" | "SKIPPED";
  exitDate?: string; exitPrice?: number; returnPct?: number;
};

function Playback() {
  const ASSETS_LIST = Object.keys(CAT);
  const [fromDate, setFromDate] = useState("2024-01-01");
  const [frames, setFrames] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [err, setErr] = useState("");
  const [paper, setPaper] = useState<PaperTrade[]>([]);
  const timerRef = useRef<any>(null);

  async function loadPlayback() {
    setBusy(true); setFrames([]); setRan(false); setErr(""); setCur(0);
    setPlaying(false); setPaper([]);
    try {
      const r = await fetch(`/api/playback?symbols=${ASSETS_LIST.join(",")}&from=${fromDate}&days=90`);
      const d = await r.json();
      if (d.error) setErr(d.error);
      else { setFrames(Array.isArray(d.frames) ? d.frames : []); setRan(true); }
    } catch { setErr("Load failed"); }
    setBusy(false);
  }

  // Autoplay
  useEffect(() => {
    if (playing && frames.length > 0) {
      timerRef.current = setTimeout(() => {
        setCur(c => { if (c >= frames.length - 1) { setPlaying(false); return c; } return c + 1; });
      }, speed);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, cur, frames, speed]);

  // Resolve paper trades up to current frame
  useEffect(() => {
    if (!frames.length || !paper.length) return;
    setPaper(prev => prev.map(t => {
      if (t.status === "SL_HIT" || t.status === "TARGET_HIT" || t.status === "SKIPPED") return t;
      const dir = t.dir === "SHORT" ? -1 : 1;
      const sigIdx = frames.findIndex((f: any) => f.date === t.signalDate);
      if (sigIdx === -1) return t;
      let nt = { ...t };

      // Entry: day after signal. Entry price = signal's planned entry (trigger price).
      if (nt.status === "PENDING") {
        const entryFrame = frames[sigIdx + 1];
        if (!entryFrame || sigIdx + 1 > cur) return nt; // entry day not reached yet
        const bar = entryFrame.ohlc?.[t.symbol];
        if (!bar) return nt;
        // GAP CHECK: agar entry din ka open already SL breach kar chuka → SKIP
        // SHORT: open >= SL invalid | LONG: open <= SL invalid
        if (dir === -1 && bar.o >= t.stop) { nt.status = "SKIPPED"; nt.entryDate = entryFrame.date; return nt; }
        if (dir === 1  && bar.o <= t.stop) { nt.status = "SKIPPED"; nt.entryDate = entryFrame.date; return nt; }
        nt.entryDate = entryFrame.date;
        nt.entryPrice = t.plannedEntry; // signal ka trigger price — RR preserve
        nt.status = "OPEN";
      }

      // Walk entry→current, check SL/TP using high/low
      if (nt.status === "OPEN" && nt.entryDate && nt.entryPrice != null) {
        const startI = frames.findIndex((f: any) => f.date === nt.entryDate);
        for (let j = startI; j <= cur && j < frames.length; j++) {
          const bar = frames[j].ohlc?.[t.symbol];
          if (!bar) continue;
          if (dir === 1) { // LONG: stop below, target above
            if (bar.l <= t.stop)   { nt.status = "SL_HIT";     nt.exitPrice = t.stop;   nt.exitDate = frames[j].date; break; }
            if (bar.h >= t.target) { nt.status = "TARGET_HIT"; nt.exitPrice = t.target; nt.exitDate = frames[j].date; break; }
          } else {         // SHORT: stop above, target below
            if (bar.h >= t.stop)   { nt.status = "SL_HIT";     nt.exitPrice = t.stop;   nt.exitDate = frames[j].date; break; }
            if (bar.l <= t.target) { nt.status = "TARGET_HIT"; nt.exitPrice = t.target; nt.exitDate = frames[j].date; break; }
          }
        }
        if ((nt.status === "SL_HIT" || nt.status === "TARGET_HIT") && nt.exitPrice != null && nt.entryPrice != null) {
          nt.returnPct = +((dir === 1 ? (nt.exitPrice - nt.entryPrice) / nt.entryPrice : (nt.entryPrice - nt.exitPrice) / nt.entryPrice) * 100).toFixed(2);
        }
      }
      return nt;
    }));
  }, [cur, frames]);

  function takePaper(sig: any, date: string) {
    setPaper(prev => {
      if (prev.some(t => t.symbol === sig.symbol && t.signalDate === date && t.strategy === sig.strategy)) return prev;
      return [...prev, {
        id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        symbol: sig.symbol, strategy: sig.strategy, dir: sig.dir,
        signalDate: date, plannedEntry: sig.entry, entryDate: null, entryPrice: null,
        stop: sig.stop, target: sig.target, status: "PENDING",
      }];
    });
  }

  const frame = frames[cur] || null;
  const sigs = frame?.signals || [];

  // Paper stats
  const closed = paper.filter(t => t.status === "SL_HIT" || t.status === "TARGET_HIT");
  const wins = closed.filter(t => t.status === "TARGET_HIT").length;
  const totalRet = closed.reduce((a, t) => a + (t.returnPct || 0), 0);
  const winRate = closed.length ? (wins / closed.length * 100).toFixed(0) : "—";

  return (
    <section className="panel main-panel">
      {/* Controls */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label className="ctl">Start from date
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} max={todayMinus(2)} min="2021-02-01" />
          </label>
          <button className={`run-btn ${busy ? "loading" : ""}`} onClick={loadPlayback} disabled={busy} style={{ minWidth: 160 }}>
            {busy ? "⏳ Loading…" : "🎬 Load Replay"}
          </button>
          {ran && <span style={{ fontSize: 11, color: "#64748b" }}>{frames.length} trading days · take trades & watch results</span>}
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>⚠️ {err}</div>}
      </div>

      {!ran && !busy && (
        <div className="empty">
          <b>🎬 Load Replay</b> dabao — past date se strategy day-by-day chalao.<br />
          <span className="muted" style={{ fontSize: 12 }}>Take this trade dabao → aage badho → dekho SL laga ya TP</span>
        </div>
      )}

      {ran && frame && (
        <>
          {/* Playback bar */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", color: "#fbbf24" }}>📅 {frame.date}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>Day {cur + 1} / {frames.length} · {sigs.length} signal{sigs.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 12, cursor: "pointer", position: "relative" }}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                setCur(Math.min(frames.length - 1, Math.max(0, Math.floor(pct * frames.length))));
                setPlaying(false);
              }}>
              <div style={{ width: `${((cur + 1) / frames.length) * 100}%`, height: "100%", background: "#fbbf24", borderRadius: 3, transition: "width .2s" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button className="pb-btn" onClick={() => { setCur(0); setPlaying(false); }}>⏮</button>
              <button className="pb-btn" onClick={() => { setCur(c => Math.max(0, c - 1)); setPlaying(false); }}>◀</button>
              <button className="pb-btn pb-play" onClick={() => setPlaying(p => !p)}>{playing ? "⏸ Pause" : "▶ Play"}</button>
              <button className="pb-btn" onClick={() => { setCur(c => Math.min(frames.length - 1, c + 1)); setPlaying(false); }}>▶</button>
              <button className="pb-btn" onClick={() => { setCur(frames.length - 1); setPlaying(false); }}>⏭</button>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Speed:</span>
                {[{ label: "0.5x", ms: 2000 }, { label: "1x", ms: 1000 }, { label: "2x", ms: 500 }, { label: "4x", ms: 250 }].map(s => (
                  <button key={s.label} className={`pb-speed ${speed === s.ms ? "active" : ""}`} onClick={() => setSpeed(s.ms)}>{s.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Paper trade stats */}
          {paper.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginBottom: 12, flexWrap: "wrap", fontSize: 12, padding: "10px 14px", background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8 }}>
              <span style={{ color: "#fbbf24", fontWeight: 700 }}>📝 Paper Trades: {paper.length}</span>
              <span style={{ color: "#64748b" }}>Open: {paper.filter(t => t.status === "OPEN" || t.status === "PENDING").length}</span>
              <span style={{ color: "#10b981" }}>TP hit: {wins}</span>
              <span style={{ color: "#ef4444" }}>SL hit: {closed.length - wins}</span>
              {paper.some(t => t.status === "SKIPPED") && <span style={{ color: "#64748b" }}>Skipped: {paper.filter(t => t.status === "SKIPPED").length}</span>}
              <span style={{ color: "#64748b" }}>Win rate: {winRate}%</span>
              <span style={{ color: totalRet >= 0 ? "#10b981" : "#ef4444", fontWeight: 700, marginLeft: "auto" }}>
                Total: {totalRet >= 0 ? "+" : ""}{totalRet.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Paper trades list */}
          {paper.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {paper.slice().reverse().map(t => {
                const stColor = t.status === "TARGET_HIT" ? "#10b981" : t.status === "SL_HIT" ? "#ef4444" : t.status === "SKIPPED" ? "#64748b" : "#fbbf24";
                const stLabel = t.status === "TARGET_HIT" ? "✅ TP HIT" : t.status === "SL_HIT" ? "❌ SL HIT" : t.status === "SKIPPED" ? "⊘ SKIPPED (gap)" : t.status === "OPEN" ? "⏳ OPEN" : "⏸ PENDING";
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, minWidth: 90 }}>{NAME[t.symbol] || t.symbol}</span>
                    <span className={`pill ${t.dir}`} style={{ fontSize: 10 }}>{t.dir}</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{t.strategy}</span>
                    <span style={{ color: "#475569", fontSize: 11 }}>@ {t.signalDate}</span>
                    {t.entryPrice != null && <span style={{ color: "#64748b", fontSize: 11 }}>entry {price(t.entryPrice)}</span>}
                    <span style={{ color: stColor, fontWeight: 700, marginLeft: "auto" }}>{stLabel}</span>
                    {t.returnPct != null && <span style={{ color: stColor, fontWeight: 700, minWidth: 55, textAlign: "right" }}>{t.returnPct >= 0 ? "+" : ""}{t.returnPct}%</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Signals this day */}
          {sigs.length === 0 ? (
            <div className="banner">
              Is din ({frame.date}) koi signal nahi.<br />
              <span className="muted" style={{ fontSize: 12 }}>▶ Play dabao — jis din signal aaya wahan dikhega.</span>
            </div>
          ) : (
            <div className="signal-grid">
              {sigs.map((sig: any, i: number) => {
                const alreadyTaken = paper.some(t => t.symbol === sig.symbol && t.signalDate === frame.date && t.strategy === sig.strategy);
                return (
                  <div key={i} className="signal-card has-signal">
                    <div className="sc-header">
                      <span className="sc-name">{NAME[sig.symbol] || sig.symbol}</span>
                      <span className="sc-cat" style={{ color: CAT_COLOR[CAT[sig.symbol]] }}>{CAT[sig.symbol]}</span>
                    </div>
                    <div className="sc-signal" style={{ borderLeft: `2px solid ${STRAT_COLOR[sig.strategy] || "#60a5fa"}` }}>
                      <div className="sc-sig-top">
                        <span className="sc-strat" style={{ color: STRAT_COLOR[sig.strategy] }}>{sig.strategy}</span>
                        <span className={`pill ${sig.dir}`}>{sig.dir}</span>
                      </div>
                      <div className="sc-levels">
                        <span className="sc-entry">Entry <b>{price(sig.entry)}</b></span>
                        <span className="sc-stop">SL <b style={{ color: "#ef4444" }}>{price(sig.stop)}</b></span>
                        <span className="sc-target">TP <b style={{ color: "#10b981" }}>{price(sig.target)}</b></span>
                        <span className="sc-rr muted">RR {sig.rr}</span>
                      </div>
                      {sig.rsiVal && <div className="sc-note muted">RSI {sig.rsiVal}</div>}
                      <button className="take-btn" disabled={alreadyTaken} onClick={() => takePaper(sig, frame.date)}
                        style={alreadyTaken ? { opacity: 0.5, cursor: "default" } : {}}>
                        {alreadyTaken ? "✓ Taken" : "✋ Take this trade (paper)"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CotDashboard() {
  const [cotData, setCotData] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const COT_SYMS = ["EURUSD=X","GBPUSD=X","USDJPY=X","AUDUSD=X","USDCAD=X","USDCHF=X","NZDUSD=X","GC=F","SI=F","CL=F","HG=F","PL=F","BTC-USD","ETH-USD","^GSPC","^NDX","^RUT"];

  async function load() {
    setBusy(true); setCotData([]); setRan(false);
    try {
      const r = await fetch(`/api/cot-all?symbols=${COT_SYMS.join(",")}`);
      const d = await r.json();
      setCotData(Array.isArray(d) ? d : []);
    } catch { setCotData([]); }
    setBusy(false); setRan(true);
  }

  const hasData = (d: any) => d && !d.error && d.largSpec && typeof d.largSpec.index === "number";
  const biasColor = (idx: number) => idx >= 80 ? "#ef4444" : idx <= 20 ? "#10b981" : "#94a3b8";
  const biasEmoji = (idx: number) => idx >= 80 ? "🔴" : idx <= 20 ? "🟢" : "🟡";

  const validData = cotData.filter(hasData).sort((a, b) => {
    const ai = a.largSpec?.index ?? 50, bi = b.largSpec?.index ?? 50;
    const aScore = ai <= 20 ? ai : ai >= 80 ? 200 - ai : 100;
    const bScore = bi <= 20 ? bi : bi >= 80 ? 200 - bi : 100;
    return aScore - bScore;
  });
  const failed = cotData.filter(d => !hasData(d) && d.symbol);

  const groups = [
    { key: "commercials", emoji: "🏭", label: "Commercials",       color: "#fbbf24" },
    { key: "largSpec",    emoji: "🏦", label: "Large Speculators", color: "#a78bfa" },
    { key: "smallSpec",   emoji: "👤", label: "Small Spec",        color: "#60a5fa" },
  ];

  return (
    <section className="panel main-panel">
      <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <button className={`run-btn ${busy?"loading":""}`} onClick={load} disabled={busy} style={{minWidth:180}}>
          {busy ? "⏳ Fetching…" : "📡 Load COT Data"}
        </button>
        {ran && <span style={{fontSize:11,color:"#64748b"}}>CFTC · 52-week · Weekly Fri update</span>}
      </div>

      {ran && (
        <div style={{display:"flex",gap:16,marginBottom:14,fontSize:11,flexWrap:"wrap"}}>
          <span>🟢 SHORT-crowded (0–20%) → contrarian LONG signal</span>
          <span>🟡 Neutral (21–79%)</span>
          <span>🔴 LONG-crowded (80–100%) → contrarian SHORT signal</span>
        </div>
      )}

      {!ran && !busy && (
        <div className="empty">
          <b>📡 Load COT Data</b> dabao<br/>
          <span style={{fontSize:12,color:"#475569"}}>Teeno groups ek saath ek card mein dikhenge</span>
        </div>
      )}

      {validData.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:12}}>
          {validData.map((d, i) => {
            const com = d.commercials;
            const ls  = d.largSpec;
            const sm  = d.smallSpec;
            const strongSignal = com && ls &&
              ((com.index <= 20 && ls.index >= 80) || (com.index >= 80 && ls.index <= 20));
            const borderColor = strongSignal
              ? (com.index <= 20 ? "#10b981" : "#ef4444")
              : "rgba(148,163,184,0.15)";
            return (
              <div key={i} style={{
                background:"#0a0f18",
                border:`1px solid ${borderColor}`,
                borderRadius:10,
                padding:"12px 14px",
              }}>
                {/* Asset header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{NAME[d.symbol]||d.symbol}</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {strongSignal && (
                      <span style={{fontSize:9,fontWeight:700,color:borderColor,border:`1px solid ${borderColor}`,borderRadius:4,padding:"1px 5px"}}>
                        ⚡ SIGNAL
                      </span>
                    )}
                    <span style={{fontSize:10,color:CAT_COLOR[CAT[d.symbol]||""]||"#64748b",fontWeight:600}}>{CAT[d.symbol]||""}</span>
                  </div>
                </div>

                {/* 3 rows — one per group */}
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {groups.map(g => {
                    const grp = d[g.key];
                    if (!grp) return null;
                    const idx = grp.index ?? 50;
                    const net = grp.net ?? 0;
                    const col = biasColor(idx);
                    return (
                      <div key={g.key} style={{
                        display:"grid",
                        gridTemplateColumns:"140px 1fr 70px",
                        alignItems:"center",
                        gap:8,
                        padding:"5px 8px",
                        background:"rgba(255,255,255,0.025)",
                        borderRadius:6,
                        border:`1px solid ${idx>=80||idx<=20 ? col+"33" : "rgba(148,163,184,0.07)"}`,
                      }}>
                        <span style={{fontSize:11.5,color:g.color}}>{g.emoji} {g.label}</span>
                        <span style={{fontFamily:"monospace",fontSize:11,color:"#64748b"}}>
                          NET <b style={{color:net>0?"#22c55e":"#ef4444"}}>{net>0?"+":""}{net.toLocaleString()}</b>
                        </span>
                        <span style={{textAlign:"right",fontSize:11.5,fontWeight:700,color:col}}>
                          {biasEmoji(idx)} {idx}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Signal explanation */}
                {strongSignal && com && ls && (
                  <div style={{
                    marginTop:8,fontSize:10.5,padding:"4px 8px",borderRadius:5,
                    background: com.index<=20?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.08)",
                    color: com.index<=20?"#10b981":"#ef4444",
                    border:`1px solid ${com.index<=20?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.2)"}`,
                  }}>
                    {com.index<=20
                      ? "🟢 Commercials SHORT + Large Spec LONG → Reversal UP possible"
                      : "🔴 Commercials LONG + Large Spec SHORT → Reversal DOWN possible"}
                  </div>
                )}

                {d.weeks && <div style={{fontSize:9,color:"#334155",marginTop:6,textAlign:"right"}}>{d.weeks}w data</div>}
              </div>
            );
          })}
        </div>
      )}

      {failed.length > 0 && ran && (
        <div style={{marginTop:12,fontSize:10.5,color:"#374151"}}>
          {failed.length} assets ka data nahi mila (CFTC futures only)
        </div>
      )}
    </section>
  );
}


export default function App() {
  const [tab, setTab]       = useState<"screener" | "playback" | "cot" | "journal">("screener");
  const [selected, setSelected] = useState<string[]>(ASSETS.map(a => a.sym));
  const [showAssets, setShowAssets] = useState(false);
  const [d1, setD1]         = useState(todayMinus(1825));
  const [busy, setBusy]     = useState(false);
  const [res, setRes]       = useState<any[]>([]);
  const [ran, setRan]       = useState(false);
  const [search, setSearch] = useState("");
  const [journalCount, setJournalCount] = useState<number | null>(null);
  const [takeMsg, setTakeMsg] = useState("");

  // Chart
  const [chartSym,    setChartSym]    = useState("");
  const [chartData,   setChartData]   = useState<any[]>([]);
  const [chartLevels, setChartLevels] = useState<any>(null);

  useEffect(() => {
    fetch("/api/trades").then(r => r.json())
      .then(d => setJournalCount(Array.isArray(d.trades) ? d.trades.length : 0))
      .catch(() => {});
  }, []);

  async function run() {
    if (!selected.length) return;
    setBusy(true); setRes([]); setRan(false);
    try {
      const symsParam = selected.join(",");
      const catParam  = selected.map(s => CAT[s] || "").join(",");
      const r = await fetch(`/api/screener?symbols=${symsParam}&cat=${catParam}&start=${d1}`);
      const data = await r.json();
      setRes(Array.isArray(data) ? data : []);
      setRan(true);
    } catch { setRes([{ symbol: "—", error: "request failed" }]); }
    finally { setBusy(false); }
  }

  async function loadChart(sym: string, sig?: any) {
    setChartSym(sym);
    setChartLevels(sig ? { entry: sig.entry, stop: sig.stop, target: sig.target } : null);
    try {
      const r = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&start=${d1}`);
      const j = await r.json();
      setChartData(j.candles ? j.candles.map((c: any) => ({ date: c.date, close: c.close })) : []);
    } catch { setChartData([]); }
  }

  async function takeTrade(sym: string, sig: any) {
    try {
      const resp = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym, name: NAME[sym] || sym,
          direction: sig.dir,
          stop: sig.stop, target: sig.target,
          strategyLabel: sig.strategy, module: "screener",
        }),
      });
      const d = await resp.json();
      if (d.ok) {
        setTakeMsg(`✋ ${NAME[sym] || sym} (${sig.dir}) journal me add — agle bar ke open pe entry.`);
        setJournalCount(c => (c ?? 0) + 1);
        setTimeout(() => setTakeMsg(""), 4000);
      }
    } catch { setTakeMsg("❌ Journal error"); }
  }

  const toggle = (s: string) => setSelected(x => x.includes(s) ? x.filter(y => y !== s) : [...x, s]);

  // Stats
  const withSignals = res.filter(r => r.signals?.length > 0);
  const noSignal    = res.filter(r => !r.error && r.signals?.length === 0);
  const errors      = res.filter(r => r.error);

  const displayed = search
    ? res.filter(r => (NAME[r.symbol] || r.symbol || "").toLowerCase().includes(search.toLowerCase()))
    : res;

  const chartColor = chartData.length < 2 ? "#fbbf24"
    : chartData[chartData.length - 1].close >= chartData[0].close ? "#10b981" : "#ef4444";

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="masthead">
        <div className="brand">
          <span className="mark">quant<span className="dot">.</span>desk</span>
          <span className="sub">Daily Timeframe · 5yr Backtested · Yahoo Finance</span>
        </div>
        <div className="mast-actions">
          <div className="gatestamp">
            <span className="gate-label">4 STRATEGIES</span>
            <span className="gate-rules">5-EMA · Forex RSI · Trend Analysis · Channel 55/20 · Daily</span>
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === "screener" ? "active" : ""}`} onClick={() => setTab("screener")}>
          📊 Strategy Screener
        </button>
        <button className={`tab-btn ${tab === "playback" ? "active" : ""}`} onClick={() => setTab("playback")}>
          🎬 Playback
        </button>
        <button className={`tab-btn ${tab === "cot" ? "active" : ""}`} onClick={() => setTab("cot")}>
          📡 COT Positioning
        </button>
        <button className={`tab-btn ${tab === "journal" ? "active" : ""}`} onClick={() => setTab("journal")}>
          📓 My Trades {journalCount !== null && journalCount > 0 && <span className="badge">{journalCount}</span>}
        </button>
      </div>

      {tab === "journal" ? (
        <section className="panel main-panel">
          <MyTrades />
        </section>
      ) : tab === "cot" ? (
        <CotDashboard />
      ) : tab === "playback" ? (
        <Playback />
      ) : (
        <>
          {/* ── Controls ── */}
          <section className="controls-panel">
            <div className="controls-row">
              <button className="toggle-filter-btn" onClick={() => setShowAssets(!showAssets)}>
                🌐 Assets ({selected.length}/{ASSETS.length}) {showAssets ? "▲" : "▼"}
              </button>
              <label className="ctl">Start date
                <input type="date" value={d1} onChange={e => setD1(e.target.value)} />
              </label>
              <button className={`run-btn ${busy ? "loading" : ""}`} onClick={run} disabled={busy}>
                {busy ? "⏳ Running…" : "▶ Run Screener"}
              </button>
              {ran && (
                <input
                  className="search-box"
                  placeholder="Search asset…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              )}
            </div>

            {showAssets && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {(["Forex", "Crypto", "Comm", "Stock"] as const).map(cat => (
                    <button key={cat} className="toggle-filter-btn"
                      onClick={() => {
                        const catSyms = ASSETS.filter(a => a.cat === cat).map(a => a.sym);
                        const allOn = catSyms.every(s => selected.includes(s));
                        setSelected(prev => allOn ? prev.filter(s => !catSyms.includes(s)) : [...new Set([...prev, ...catSyms])]);
                      }}
                      style={{ fontSize: 11, padding: "3px 10px", borderLeft: `3px solid ${CAT_COLOR[cat]}` }}
                    >
                      {cat}
                    </button>
                  ))}
                  <button className="toggle-filter-btn" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setSelected(ASSETS.map(a => a.sym))}>✓ All</button>
                  <button className="toggle-filter-btn" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setSelected([])}>✕ Clear</button>
                </div>
                <div className="chips">
                  {ASSETS.map(a => (
                    <button key={a.sym}
                      className={`chip ${selected.includes(a.sym) ? "on" : ""}`}
                      style={selected.includes(a.sym) ? { borderLeft: `3px solid ${CAT_COLOR[a.cat]}` } : {}}
                      onClick={() => toggle(a.sym)}
                    >
                      {a.name}<span className="cat">{a.cat}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Chart ── */}
          {chartData.length > 0 && (
            <section className="panel chart-panel">
              <div className="chart-head">
                <h4>{NAME[chartSym] || chartSym} — Daily</h4>
                <button className="toggle-filter-btn" style={{ fontSize: 11 }} onClick={() => { setChartData([]); setChartSym(""); }}>✕ Close</button>
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.07)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#576575", fontSize: 9 }} minTickGap={50} stroke="rgba(148,163,184,0.1)" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#576575", fontSize: 9 }} width={54} stroke="rgba(148,163,184,0.1)" />
                    <Tooltip contentStyle={{ background: "#0f141c", border: "1px solid #212836", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#8e9ba9" }} />
                    <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={1.6} fill="url(#cg)" />
                    {chartLevels?.entry  && <ReferenceLine y={chartLevels.entry}  stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1} />}
                    {chartLevels?.stop   && <ReferenceLine y={chartLevels.stop}   stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />}
                    {chartLevels?.target && <ReferenceLine y={chartLevels.target} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── Main panel ── */}
          <section className="panel main-panel">
            {/* Strategy legend */}
            <div className="strat-legend">
              {[
                { name: "5-EMA Filtered",    oosPF: "1.92", win: "33%", assets: "Comm + Stock only",  rr: "1:5" },
                { name: "Forex RSI 25/75",   oosPF: "1.34", win: "8%",  assets: "Forex (GBP/CHF/EUR)", rr: "1:3" },
                { name: "Trend Analysis",    oosPF: "3.19", win: "30%", assets: "Crypto only",          rr: "1:3" },
                { name: "Channel 55/20",     oosPF: "1.91", win: "27%", assets: "Crypto + Stock",       rr: "Dynamic" },
              ].map(s => (
                <div key={s.name} className="strat-card" style={{ borderLeft: `3px solid ${STRAT_COLOR[s.name] || "#64748b"}` }}>
                  <span className="strat-name">{s.name}</span>
                  <span className="strat-stat">OOS PF <b>{s.oosPF}</b></span>
                  <span className="strat-stat">Win <b>{s.win}</b></span>
                  <span className="strat-stat">RR <b>{s.rr}</b></span>
                  <span className="strat-stat muted">{s.assets}</span>
                </div>
              ))}
            </div>

            {/* Take msg */}
            {takeMsg && <div className="take-toast">{takeMsg}</div>}

            {/* Not run yet */}
            {!ran && !busy && (
              <div className="empty">
                Assets select karo aur <b>▶ Run Screener</b> dabao.<br />
                <span className="muted" style={{ fontSize: 12 }}>Daily timeframe · 5-year backtested strategies · Entry/SL/TP automatic</span>
              </div>
            )}

            {/* Stats bar */}
            {ran && (
              <div className="stats-bar">
                <span className="sb-item green">🔴 {withSignals.length} signals</span>
                <span className="sb-item muted">⚪ {noSignal.length} no signal</span>
                {errors.length > 0 && <span className="sb-item red">❌ {errors.length} errors</span>}
                <span className="sb-item muted" style={{ marginLeft: "auto", fontSize: 11 }}>
                  Daily timeframe · 5yr backtested · {new Date().toLocaleDateString("en-IN")}
                </span>
              </div>
            )}

            {/* Disclaimer */}
            {ran && (
              <div className="disclaimer-box">
                ⚠️ <b>5-EMA Filtered:</b> Comm pe OOS PF 3.76 · Crypto 2.37 · Stock 1.35 — daily 5yr test.
                &nbsp;&nbsp;<b>Crypto EMA:</b> OOS PF 1.86, 54% win, 4/5 years profitable.
                &nbsp;&nbsp;<b>Forex RSI:</b> OOS PF 1.85, 60% win — 2025 me recent weakness. Sirf validated pairs pe bharosa.
                &nbsp;&nbsp;Koi guarantee nahi. Har trade pe 1-2% risk. Stop-loss always.
              </div>
            )}

            {/* Results */}
            {ran && withSignals.length === 0 && !busy && (
              <div className="banner">
                Aaj koi fresh signal nahi. Normal hai — strategy sirf strong setups me fire kart hai.<br />
                <span className="muted" style={{ fontSize: 12 }}>Kal dobara run karo. Koi trade force mat karo.</span>
              </div>
            )}

            {/* Signal cards */}
            <div className="signal-grid">
              {(search ? displayed : [...withSignals, ...noSignal]).map((row, ri) => {
                if (row.error) return null;
                const hasSig = row.signals?.length > 0;
                const cat = CAT[row.symbol] || "";
                return (
                  <div key={ri} className={`signal-card ${hasSig ? "has-signal" : "no-signal"}`}>
                    <div className="sc-header">
                      <span className="sc-name" onClick={() => loadChart(row.symbol, hasSig ? row.signals[0] : null)}>
                        {NAME[row.symbol] || row.symbol}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {row.cot && (
                          <span className={`cot-badge ${row.cot.bias === "neutral" ? "cot-neutral" : "cot-extreme"}`} style={{ margin: 0, padding: "2px 5px", fontSize: "9px" }} title="CFTC Commitments of Traders positioning context">
                            COT: {row.cot.bias} ({row.cot.index}%)
                          </span>
                        )}
                        <span className="sc-cat" style={{ color: CAT_COLOR[cat] }}>{cat}</span>
                      </div>
                    </div>
                    {hasSig ? row.signals.map((sig: any, si: number) => (
                      <div key={si} className="sc-signal" style={{ borderLeft: `2px solid ${STRAT_COLOR[sig.strategy] || "#60a5fa"}` }}>
                        <div className="sc-sig-top">
                          <span className="sc-strat" style={{ color: STRAT_COLOR[sig.strategy] }}>{sig.strategy}</span>
                          <Pill v={sig.dir} />
                        </div>
                        <div className="sc-levels">
                          <span className="sc-entry">Entry <b>{price(sig.entry)}</b></span>
                          <span className="sc-stop">SL <b style={{ color: "#ef4444" }}>{price(sig.stop)}</b></span>
                          <span className="sc-target">TP <b style={{ color: "#10b981" }}>{price(sig.target)}</b></span>
                          <span className="sc-rr muted">RR {sig.rr}</span>
                        </div>
                        {sig.rsiVal && <div className="sc-note muted">RSI {sig.rsiVal} · {sig.note}</div>}
                        {!sig.rsiVal && <div className="sc-note muted">{sig.note}</div>}
                        <div className="sc-stats muted">
                          OOS PF <b style={{ color: "#fbbf24" }}>{sig.oosPF}</b> · Win <b>{sig.winRate}%</b>
                          {row.cot && (
                            <span className={`cot-badge ${row.cot.contrarian === sig.dir ? "cot-agree" : row.cot.bias === "neutral" ? "cot-neutral" : "cot-conflict"}`}>
                              COT {row.cot.bias === "neutral" ? "neutral" : row.cot.bias} · {row.cot.index}
                              {row.cot.contrarian === sig.dir ? " ✅ agrees" : row.cot.bias !== "neutral" ? " ⚠️ conflicts" : ""}
                            </span>
                          )}
                        </div>
                        {row.cot && (
                          <div style={{
                            marginTop: "8px",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            lineHeight: "1.4",
                            background: row.cot.contrarian === sig.dir 
                              ? "rgba(34,197,94,0.08)" 
                              : row.cot.bias === "neutral" 
                                ? "rgba(148,163,184,0.04)" 
                                : "rgba(239,68,68,0.08)",
                            border: `1px solid ${
                              row.cot.contrarian === sig.dir 
                                ? "rgba(34,197,94,0.2)" 
                                : row.cot.bias === "neutral" 
                                  ? "rgba(148,163,184,0.15)" 
                                  : "rgba(239,68,68,0.2)"
                            }`,
                            color: row.cot.contrarian === sig.dir 
                              ? "#4ade80" 
                              : row.cot.bias === "neutral" 
                                ? "#94a3b8" 
                                : "#f87171"
                          }}>
                            {getCotExplanation(row.cot, sig.dir)}
                          </div>
                        )}
                        <button className="take-btn" onClick={() => takeTrade(row.symbol, sig)}>
                          ✋ Take this trade
                        </button>
                      </div>
                    )) : (
                      <div className="sc-nosig-container" style={{ padding: "4px 0" }}>
                        <div className="sc-nosig muted">No signal today</div>
                        {row.cot && (
                          <div style={{ marginTop: "6px" }}>
                            <div className="sc-cot-nosig" style={{ fontSize: "10px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px" }}>
                              <span>Positioning:</span>
                              <span className={`cot-badge ${row.cot.bias === "neutral" ? "cot-neutral" : "cot-extreme"}`} style={{ margin: 0, padding: "1px 5px", fontSize: "9px" }}>
                                {row.cot.bias} ({row.cot.index}%)
                              </span>
                            </div>
                            <div style={{
                              marginTop: "4px",
                              padding: "6px 8px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              lineHeight: "1.35",
                              background: "rgba(148,163,184,0.04)",
                              border: "1px solid rgba(148,163,184,0.1)",
                              color: "#94a3b8"
                            }}>
                              {getCotExplanation(row.cot)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {errors.map((r, i) => (
                  <div key={i} className="err-row">{NAME[r.symbol] || r.symbol}: {r.error}</div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="disclaimer">
        Quant Desk — educational tool. Not financial advice. Past backtests do not guarantee future returns.
        Always use stop-loss. Risk only what you can afford to lose.
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from "recharts";
import { MyTrades } from "./components/MyTrades";

type Asset = { sym: string; name: string; cat: "Forex" | "Crypto" | "Comm" | "Stock" | "Index" };

const ASSETS: Asset[] = [
  // Forex (11) — RSI 25/75 mean-reversion
  { sym: "EURUSD=X", name: "EUR/USD",   cat: "Forex" },
  { sym: "GBPUSD=X", name: "GBP/USD",   cat: "Forex" },
  { sym: "USDJPY=X", name: "USD/JPY",   cat: "Forex" },
  { sym: "USDCHF=X", name: "USD/CHF",   cat: "Forex" },
  { sym: "AUDUSD=X", name: "AUD/USD",   cat: "Forex" },
  { sym: "USDCAD=X", name: "USD/CAD",   cat: "Forex" },
  { sym: "NZDUSD=X", name: "NZD/USD",   cat: "Forex" },
  { sym: "EURJPY=X", name: "EUR/JPY",   cat: "Forex" },
  { sym: "GBPJPY=X", name: "GBP/JPY",   cat: "Forex" },
  { sym: "EURGBP=X", name: "EUR/GBP",   cat: "Forex" },
  { sym: "AUDJPY=X", name: "AUD/JPY",   cat: "Forex" },
  // Crypto (6) — EMA 20/50 trend + 5-EMA
  { sym: "BTC-USD",  name: "Bitcoin",   cat: "Crypto" },
  { sym: "ETH-USD",  name: "Ethereum",  cat: "Crypto" },
  { sym: "SOL-USD",  name: "Solana",    cat: "Crypto" },
  { sym: "XRP-USD",  name: "XRP",       cat: "Crypto" },
  { sym: "BNB-USD",  name: "BNB",       cat: "Crypto" },
  { sym: "DOGE-USD", name: "Dogecoin",  cat: "Crypto" },
  // Commodities (7) — 5-EMA (OOS PF 3.76!)
  { sym: "GC=F",  name: "Gold",         cat: "Comm" },
  { sym: "SI=F",  name: "Silver",       cat: "Comm" },
  { sym: "CL=F",  name: "WTI Oil",      cat: "Comm" },
  { sym: "BZ=F",  name: "Brent Oil",    cat: "Comm" },
  { sym: "HG=F",  name: "Copper",       cat: "Comm" },
  { sym: "NG=F",  name: "Nat Gas",      cat: "Comm" },
  { sym: "PL=F",  name: "Platinum",     cat: "Comm" },
  // US Stocks (21) — 5-EMA
  { sym: "AAPL",  name: "Apple",        cat: "Stock" },
  { sym: "MSFT",  name: "Microsoft",    cat: "Stock" },
  { sym: "NVDA",  name: "NVIDIA",       cat: "Stock" },
  { sym: "TSLA",  name: "Tesla",        cat: "Stock" },
  { sym: "AMZN",  name: "Amazon",       cat: "Stock" },
  { sym: "GOOGL", name: "Alphabet",     cat: "Stock" },
  { sym: "META",  name: "Meta",         cat: "Stock" },
  { sym: "NFLX",  name: "Netflix",      cat: "Stock" },
  { sym: "AMD",   name: "AMD",          cat: "Stock" },
  { sym: "AVGO",  name: "Broadcom",     cat: "Stock" },
  { sym: "JPM",   name: "JPMorgan",     cat: "Stock" },
  { sym: "BAC",   name: "BofA",         cat: "Stock" },
  { sym: "V",     name: "Visa",         cat: "Stock" },
  { sym: "MA",    name: "Mastercard",   cat: "Stock" },
  { sym: "XOM",   name: "Exxon",        cat: "Stock" },
  { sym: "WMT",   name: "Walmart",      cat: "Stock" },
  { sym: "DIS",   name: "Disney",       cat: "Stock" },
  { sym: "BA",    name: "Boeing",       cat: "Stock" },
  { sym: "KO",    name: "Coca-Cola",    cat: "Stock" },
  { sym: "PFE",   name: "Pfizer",       cat: "Stock" },
  { sym: "INTC",  name: "Intel",        cat: "Stock" },
  // Indices (3)
  { sym: "^GSPC", name: "S&P 500",      cat: "Index" },
  { sym: "^NDX",  name: "Nasdaq 100",   cat: "Index" },
  { sym: "^RUT",  name: "Russell 2000", cat: "Index" },
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
  const COT_SYMS = ["EURUSD=X","GBPUSD=X","USDJPY=X","AUDUSD=X","USDCAD=X","USDCHF=X","NZDUSD=X","GC=F","SI=F","CL=F","NG=F","BTC-USD","ETH-USD","^GSPC","^NDX","^RUT"];
  async function load() {
    setBusy(true); setCotData([]); setRan(false);
    try {
      const r = await fetch(`/api/cot-all?symbols=${COT_SYMS.join(",")}`);
      const d = await r.json();
      setCotData(Array.isArray(d) ? d : []);
    } catch { setCotData([]); }
    setBusy(false); setRan(true);
  }
  const mc = (i: number) => i >= 80 ? "#ef4444" : i <= 20 ? "#10b981" : "#94a3b8";
  const ok = (d: any) => d && !d.error && typeof d.index === "number";
  const extreme = [...cotData].filter(d => ok(d) && (d.index >= 80 || d.index <= 20)).sort((a,b) => (a.index<=20?a.index:200-a.index)-(b.index<=20?b.index:200-b.index));
  const neutral = [...cotData].filter(d => ok(d) && d.index > 20 && d.index < 80).sort((a,b) => a.index-b.index);
  const failed  = cotData.filter(d => !ok(d));
  return (
    <section className="panel main-panel">
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <button className={`run-btn ${busy?"loading":""}`} onClick={load} disabled={busy} style={{minWidth:180}}>
            {busy ? "⏳ Fetching…" : "📡 Load COT Data"}
          </button>
          {ran && <span style={{fontSize:11,color:"#64748b"}}>CFTC · 52-week · Weekly Fri update</span>}
        </div>
        <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap",fontSize:11}}>
          <span style={{color:"#10b981"}}>■ 0–20% SHORT-crowded → contrarian LONG</span>
          <span style={{color:"#94a3b8"}}>■ 21–79% Neutral</span>
          <span style={{color:"#ef4444"}}>■ 80–100% LONG-crowded → contrarian SHORT</span>
        </div>
      </div>
      {!ran && !busy && <div className="empty"><b>📡 Load COT Data</b> dabao</div>}
      {extreme.length > 0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:"#fbbf24",marginBottom:10}}>⚡ EXTREME ({extreme.length}) — Contrarian setups</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>
            {extreme.map((d,i) => {
              const idx = d.index as number;
              const col = mc(idx);
              const bg  = idx>=80?"rgba(239,68,68,0.07)":"rgba(16,185,129,0.07)";
              const bdr = idx>=80?"rgba(239,68,68,0.22)":"rgba(16,185,129,0.22)";
              return (
                <div key={i} style={{background:bg,border:`1px solid ${bdr}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontWeight:700,fontSize:14}}>{NAME[d.symbol]||d.symbol}</span>
                    <span style={{fontSize:10,color:CAT_COLOR[CAT[d.symbol]||""]||"#64748b",fontWeight:600}}>{CAT[d.symbol]||""}</span>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#475569",marginBottom:3}}>
                      <span style={{color:"#10b981"}}>◀ SHORT</span>
                      <span style={{color:col,fontWeight:700}}>{d.bias} {idx}%</span>
                      <span style={{color:"#ef4444"}}>LONG ▶</span>
                    </div>
                    <div style={{height:8,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden",position:"relative"}}>
                      <div style={{position:"absolute",left:"20%",top:0,bottom:0,width:1,background:"rgba(16,185,129,0.35)"}} />
                      <div style={{position:"absolute",left:"80%",top:0,bottom:0,width:1,background:"rgba(239,68,68,0.35)"}} />
                      <div style={{width:`${Math.min(100,Math.max(0,idx))}%`,height:"100%",background:col}} />
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#334155",marginTop:2}}>
                      <span>0</span><span>100</span>
                    </div>
                  </div>
                  {typeof d.net==="number" && <div style={{fontSize:10.5,color:"#64748b",marginBottom:5}}>Net: <b style={{color:"#cbd5e1"}}>{d.net>0?"+":""}{d.net.toLocaleString()}</b> contracts{d.weeks?` · ${d.weeks}w`:""}</div>}
                  <div style={{fontSize:11,color:col,fontWeight:600}}>{idx<=20?"🟢 Contrarian LONG — extreme short crowding. Wait for price signal.":"🔴 Contrarian SHORT — extreme long crowding. Wait for price signal."}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {neutral.length > 0 && (
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8}}>○ NEUTRAL ({neutral.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
            {neutral.map((d,i) => {
              const idx = d.index as number;
              return (
                <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(148,163,184,0.1)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontWeight:600,fontSize:13}}>{NAME[d.symbol]||d.symbol}</span>
                    <span style={{fontSize:10,color:"#475569"}}>{idx}%</span>
                  </div>
                  <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden",position:"relative"}}>
                    <div style={{position:"absolute",left:"20%",top:0,bottom:0,width:1,background:"rgba(16,185,129,0.2)"}} />
                    <div style={{position:"absolute",left:"80%",top:0,bottom:0,width:1,background:"rgba(239,68,68,0.2)"}} />
                    <div style={{width:`${Math.min(100,Math.max(0,idx))}%`,height:"100%",background:"#475569"}} />
                  </div>
                  <div style={{fontSize:10,color:"#475569",marginTop:4}}>{idx<=35?"Leaning SHORT":idx>=65?"Leaning LONG":"Balanced"}{typeof d.net==="number"?` · ${d.net>0?"+":""}${d.net.toLocaleString()}`:""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {failed.length>0&&ran&&<div style={{marginTop:12,fontSize:11,color:"#475569"}}>{failed.map((e,i)=><div key={i}>❌ {NAME[e.symbol]||e.symbol}: {e.error||"no data"}</div>)}</div>}
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
            <span className="gate-label">3 STRATEGIES</span>
            <span className="gate-rules">5-EMA · Crypto EMA · Forex RSI · Daily only</span>
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
                { name: "5-EMA Filtered",   oosPF: "1.98", win: "36%",  assets: "Comm + Crypto + Stock", rr: "1:5" },
                { name: "Crypto EMA 20/50", oosPF: "1.86", win: "54%",  assets: "Crypto only",           rr: "1:3" },
                { name: "Forex RSI 25/75",  oosPF: "1.85", win: "60%",  assets: "Forex only",            rr: "1:3" },
              ].map(s => (
                <div key={s.name} className="strat-card" style={{ borderLeft: `3px solid ${STRAT_COLOR[s.name]}` }}>
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

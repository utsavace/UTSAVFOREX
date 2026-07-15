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

// ── COT Visual Components ──
function CotMeter({ cot }: { cot: any }) {
  if (!cot) return null;
  const idx = cot.index ?? 50;
  const meterColor = idx >= 80 ? "#ef4444" : idx <= 20 ? "#10b981" : "#94a3b8";
  const label = cot.bias === "LONG-crowded" ? "Crowded LONG" : cot.bias === "SHORT-crowded" ? "Crowded SHORT" : "Neutral";
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#475569", marginBottom: 3 }}>
        <span style={{ color: "#10b981" }}>◀ SHORT</span>
        <span style={{ color: meterColor, fontWeight: 700 }}>{label} {idx}%</span>
        <span style={{ color: "#ef4444" }}>LONG ▶</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
        <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: 1, background: "rgba(16,185,129,0.3)" }} />
        <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: "rgba(239,68,68,0.3)" }} />
        <div style={{ width: `${idx}%`, height: "100%", background: meterColor, borderRadius: 2, transition: "width .3s" }} />
        <div style={{ position: "absolute", left: `calc(${idx}% - 3px)`, top: -2, width: 6, height: 8, background: meterColor, borderRadius: 1 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#334155", marginTop: 2 }}>
        <span>0</span><span>Extreme zone</span><span>100</span>
      </div>
    </div>
  );
}

function CotContext({ cot, sigDir }: { cot: any; sigDir?: string }) {
  if (!cot) return null;
  const idx = cot.index ?? 50;
  const agrees  = sigDir && cot.contrarian === sigDir;
  const conflicts = sigDir && cot.bias !== "neutral" && cot.contrarian !== sigDir;
  let icon = "ℹ️", msg = "", bg = "rgba(148,163,184,0.05)", border = "rgba(148,163,184,0.1)", color = "#64748b";
  if (agrees) {
    icon = "✅"; bg = "rgba(34,197,94,0.07)"; border = "rgba(34,197,94,0.18)"; color = "#4ade80";
    if (cot.bias === "SHORT-crowded")
      msg = `Speculators ${idx}% extreme SHORT hain — contrarian bounce/squeeze expected. LONG ke liye strong COT backing.`;
    else
      msg = `Speculators ${idx}% extreme LONG hain — crowded peak se reversal likely. SHORT ke liye strong COT backing.`;
  } else if (conflicts) {
    icon = "⚠️"; bg = "rgba(239,68,68,0.06)"; border = "rgba(239,68,68,0.15)"; color = "#f87171";
    msg = `COT ${sigDir} signal ke against hai — speculators already ${cot.bias === "LONG-crowded" ? "LONG" : "SHORT"} (${idx}%). Extra caution, position size chhoti rakhna.`;
  } else {
    icon = "ℹ️";
    if (idx >= 65) msg = `Neutral zone leaning LONG (${idx}%) — koi extreme crowding nahi, lekin long side thoda heavy.`;
    else if (idx <= 35) msg = `Neutral zone leaning SHORT (${idx}%) — koi extreme crowding nahi, lekin short side thoda heavy.`;
    else msg = `Balanced (${idx}%) — dono sides equal. COT se koi directional signal nahi.`;
  }
  return (
    <div style={{ marginTop: 5, padding: "6px 9px", borderRadius: 5, fontSize: 10.5, lineHeight: 1.4, background: bg, border: `1px solid ${border}`, color }}>
      {icon} {msg}
    </div>
  );
}

// ══════════════════════════════════════════════
//  COT DASHBOARD — Full positioning view
// ══════════════════════════════════════════════
function CotDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan]   = useState(false);

  const COT_ASSETS = Object.keys(CAT).filter(s => [
    "EURUSD=X","GBPUSD=X","USDJPY=X","AUDUSD=X","USDCAD=X","USDCHF=X","NZDUSD=X",
    "GC=F","SI=F","CL=F","NG=F",
    "BTC-USD","ETH-USD",
    "^GSPC","^NDX","^RUT"
  ].includes(s));

  async function loadCot() {
    setBusy(true); setData([]); setRan(false);
    try {
      const r = await fetch(`/api/cot-all?symbols=${COT_ASSETS.join(",")}`);
      const d = await r.json();
      setData(Array.isArray(d) ? d : []);
      setRan(true);
    } catch { setData([]); }
    finally { setBusy(false); }
  }

  // Color based on index
  const mColor = (idx: number) => idx >= 80 ? "#ef4444" : idx <= 20 ? "#10b981" : "#94a3b8";
  const bgColor = (idx: number) => idx >= 80 ? "rgba(239,68,68,0.07)" : idx <= 20 ? "rgba(16,185,129,0.07)" : "rgba(148,163,184,0.04)";
  const borderColor = (idx: number) => idx >= 80 ? "rgba(239,68,68,0.2)" : idx <= 20 ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.12)";

  const extreme = data.filter(d => !d.error && (d.index >= 80 || d.index <= 20));
  const neutral = data.filter(d => !d.error && d.index > 20 && d.index < 80);
  const errors  = data.filter(d => d.error);

  return (
    <section className="panel main-panel">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button className={`run-btn ${busy ? "loading" : ""}`} onClick={loadCot} disabled={busy} style={{ minWidth: 180 }}>
            {busy ? "⏳ Fetching COT…" : "📡 Load COT Data"}
          </button>
          {ran && (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              CFTC data · 52-week positioning · Weekly update (Fri)
            </span>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 8, background: "#10b981", borderRadius: 2 }} />
            <span style={{ color: "#64748b" }}>SHORT-crowded (0-20%) — contrarian LONG setup</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 8, background: "#94a3b8", borderRadius: 2 }} />
            <span style={{ color: "#64748b" }}>Neutral (21-79%) — no extreme</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 8, background: "#ef4444", borderRadius: 2 }} />
            <span style={{ color: "#64748b" }}>LONG-crowded (80-100%) — contrarian SHORT setup</span>
          </div>
        </div>
      </div>

      {!ran && !busy && (
        <div className="empty">
          <b>📡 Load COT Data</b> dabao — CFTC se 16 assets ka 52-week positioning aayega.<br />
          <span className="muted" style={{ fontSize: 12 }}>
            Forex · Commodities · Crypto · Indices · Weekly CFTC data
          </span>
        </div>
      )}

      {/* Extreme section */}
      {ran && extreme.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 10, marginTop: 4 }}>
            ⚡ EXTREME POSITIONING ({extreme.length} assets) — Potential contrarian setups
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
            {extreme.sort((a,b) => {
              // SHORT-crowded (low index) first, then LONG-crowded (high index)
              const aExt = a.index <= 20 ? a.index : 200 - a.index;
              const bExt = b.index <= 20 ? b.index : 200 - b.index;
              return aExt - bExt;
            }).map((d, i) => (
              <div key={i} style={{ background: bgColor(d.index), border: `1px solid ${borderColor(d.index)}`, borderRadius: 10, padding: "12px 14px" }}>
                {/* Asset header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{NAME[d.symbol] || d.symbol}</span>
                  <span style={{ fontSize: 10, color: CAT_COLOR[CAT[d.symbol]] || "#64748b", fontWeight: 600 }}>
                    {CAT[d.symbol] || ""}
                  </span>
                </div>
                {/* Meter */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginBottom: 3 }}>
                    <span style={{ color: "#10b981" }}>◀ SHORT</span>
                    <span style={{ color: mColor(d.index), fontWeight: 700, fontSize: 11 }}>
                      {d.bias} · {d.index}%
                    </span>
                    <span style={{ color: "#ef4444" }}>LONG ▶</span>
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, position: "relative" }}>
                    <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: 1, background: "rgba(16,185,129,0.4)" }} />
                    <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: "rgba(239,68,68,0.4)" }} />
                    <div style={{ width: `${d.index}%`, height: "100%", background: mColor(d.index), borderRadius: 4 }} />
                  </div>
                </div>
                {/* Net position */}
                <div style={{ fontSize: 10.5, color: "#64748b", marginBottom: 6 }}>
                  Net speculator position: <b style={{ color: "#cbd5e1" }}>{d.net > 0 ? "+" : ""}{d.net?.toLocaleString()}</b> contracts · <b>{d.weeks}w</b> data
                </div>
                {/* Actionable insight */}
                <div style={{ fontSize: 11, color: mColor(d.index), fontWeight: 600 }}>
                  {d.index <= 20
                    ? `🟢 Contrarian LONG context — speculators extreme SHORT. Wait for price signal.`
                    : `🔴 Contrarian SHORT context — speculators extreme LONG. Wait for price signal.`
                  }
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Neutral section */}
      {ran && neutral.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
            ○ NEUTRAL POSITIONING ({neutral.length} assets)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {neutral.sort((a,b) => a.index - b.index).map((d, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(148,163,184,0.1)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{NAME[d.symbol] || d.symbol}</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>{d.index}%</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, position: "relative" }}>
                  <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: 1, background: "rgba(16,185,129,0.2)" }} />
                  <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: "rgba(239,68,68,0.2)" }} />
                  <div style={{ width: `${d.index}%`, height: "100%", background: "#475569", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                  {d.index <= 40 ? "Leaning SHORT" : d.index >= 60 ? "Leaning LONG" : "Balanced"} · Net {d.net > 0 ? "+" : ""}{d.net?.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {errors.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: "#475569" }}>
          {errors.map((e, i) => <div key={i}>❌ {NAME[e.symbol] || e.symbol}: {e.error}</div>)}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState<"screener" | "cot" | "journal">("screener");
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
      const r = await fetch(`/api/screener?symbols=${symsParam}&start=${d1}`);
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
                          <>
                            <CotMeter cot={row.cot} />
                            <CotContext cot={row.cot} sigDir={sig.dir} />
                          </>
                        )}
                        <button className="take-btn" onClick={() => takeTrade(row.symbol, sig)}>
                          ✋ Take this trade
                        </button>
                      </div>
                    )) : (
                      <div className="sc-nosig-container" style={{ padding: "4px 0" }}>
                        <div className="sc-nosig muted">No signal today</div>
                        {row.cot && (
                          <div style={{ marginTop: 6 }}>
                            <CotMeter cot={row.cot} />
                            <CotContext cot={row.cot} />
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

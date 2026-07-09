import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ReferenceDot,
} from "recharts";
import { MyTrades } from "./components/MyTrades";

type Asset = { sym: string; name: string; cat: string };

// Liquidity-first universe: FX majors + crosses, deep commodity futures,
// top-cap crypto, mega-cap US stocks & index ETFs.
const ASSETS: Asset[] = [
  // Forex
  { sym: "EURUSD=X", name: "EUR/USD", cat: "Forex" },
  { sym: "GBPUSD=X", name: "GBP/USD", cat: "Forex" },
  { sym: "USDJPY=X", name: "USD/JPY", cat: "Forex" },
  { sym: "USDCHF=X", name: "USD/CHF", cat: "Forex" },
  { sym: "AUDUSD=X", name: "AUD/USD", cat: "Forex" },
  { sym: "USDCAD=X", name: "USD/CAD", cat: "Forex" },
  { sym: "NZDUSD=X", name: "NZD/USD", cat: "Forex" },
  { sym: "EURJPY=X", name: "EUR/JPY", cat: "Forex" },
  { sym: "GBPJPY=X", name: "GBP/JPY", cat: "Forex" },
  { sym: "EURGBP=X", name: "EUR/GBP", cat: "Forex" },
  { sym: "AUDJPY=X", name: "AUD/JPY", cat: "Forex" },
  // Commodities
  { sym: "GC=F", name: "Gold", cat: "Comm" },
  { sym: "SI=F", name: "Silver", cat: "Comm" },
  { sym: "CL=F", name: "WTI Oil", cat: "Comm" },
  { sym: "BZ=F", name: "Brent", cat: "Comm" },
  { sym: "NG=F", name: "Nat Gas", cat: "Comm" },
  { sym: "HG=F", name: "Copper", cat: "Comm" },
  { sym: "PL=F", name: "Platinum", cat: "Comm" },
  // Crypto
  { sym: "BTC-USD", name: "Bitcoin", cat: "Crypto" },
  { sym: "ETH-USD", name: "Ethereum", cat: "Crypto" },
  { sym: "SOL-USD", name: "Solana", cat: "Crypto" },
  { sym: "XRP-USD", name: "XRP", cat: "Crypto" },
  { sym: "BNB-USD", name: "BNB", cat: "Crypto" },
  { sym: "DOGE-USD", name: "Dogecoin", cat: "Crypto" },
  // US Stocks (high liquidity)
  { sym: "AAPL", name: "Apple", cat: "Stock" },
  { sym: "MSFT", name: "Microsoft", cat: "Stock" },
  { sym: "NVDA", name: "NVIDIA", cat: "Stock" },
  { sym: "TSLA", name: "Tesla", cat: "Stock" },
  { sym: "AMZN", name: "Amazon", cat: "Stock" },
  { sym: "GOOGL", name: "Alphabet", cat: "Stock" },
  { sym: "META", name: "Meta", cat: "Stock" },
  { sym: "NFLX", name: "Netflix", cat: "Stock" },
  { sym: "AMD", name: "AMD", cat: "Stock" },
  { sym: "AVGO", name: "Broadcom", cat: "Stock" },
  { sym: "JPM", name: "JPMorgan", cat: "Stock" },
  { sym: "BAC", name: "BofA", cat: "Stock" },
  { sym: "V", name: "Visa", cat: "Stock" },
  { sym: "MA", name: "Mastercard", cat: "Stock" },
  { sym: "XOM", name: "Exxon", cat: "Stock" },
  { sym: "WMT", name: "Walmart", cat: "Stock" },
  { sym: "DIS", name: "Disney", cat: "Stock" },
  { sym: "BA", name: "Boeing", cat: "Stock" },
  { sym: "KO", name: "Coca-Cola", cat: "Stock" },
  { sym: "PFE", name: "Pfizer", cat: "Stock" },
  { sym: "INTC", name: "Intel", cat: "Stock" },
  // Indices
  { sym: "^GSPC", name: "S&P 500", cat: "Index" },
  { sym: "^NDX", name: "Nasdaq 100", cat: "Index" },
  { sym: "^RUT", name: "Russell 2000", cat: "Index" },
];
const NAME: Record<string, string> = Object.fromEntries(ASSETS.map((a) => [a.sym, a.name]));

const TABS = [
  { n: 1, key: "overview", label: "Overview" },
  { n: 2, key: "opt", label: "AI Strategy Optimizer" },
  { n: 3, key: "div", label: "Divergence Scanner" },
  { n: 6, key: "fib", label: "📐 Fibonacci" },
  { n: 4, key: "cot", label: "COT Positioning" },
  { n: 5, key: "journal", label: "My Trades" },
] as const;

const DESC: Record<number, string> = {
  1: "Watchlist: har asset par Optimizer best + Divergence + COT ek saath. Decision-support hai — koi auto-signal nahi.",
  2: "Har asset pe RSI / MACD / EMA / Bollinger combinations tune hote hain walk-forward 70/30 se: pehle 70% (in-sample) par entry×SL×TP optimize, phir last 30% (out-of-sample) par validate — overfitting se bachne ke liye Pass tabhi jab DONO clear karein.",
  3: "RSI divergence (price LL + RSI HL / price HH + RSI LH) sirf 4h aur Daily timeframes par. Neeche historical backtest summary dikhata hai ki is universe pe divergence ne out-of-sample kitna success diya.",
  4: "CFTC COT weekly positioning (futures-mapped assets only). Index ≥80 = crowded long (contrarian short context), ≤20 = crowded short.",
  5: "Personal trade journal — setup pe '✋ Take this trade' dabao, agle bar ke open pe entry hoti hai aur real daily candles se SL/target auto-resolve hota hai. Playback mode me practice journal alag chalta hai.",
  6: "📐 Fibonacci Retracement — swing high/low detect karke 38.2% / 50% / 61.8% retracement pe bounce signal. 5 variants test hote hain, walk-forward 70/30 best chunta hai.",
};

const todayMinus = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const num = (v: any, d = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—");
const price = (v: any) => {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : 5;
  return v.toFixed(d);
};
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function Pill({ v }: { v: string }) {
  const k = v === "-" || !v ? "none" : v;
  return <span className={`pill ${k}`}>{v === "-" ? "flat" : v}</span>;
}

const actionable = (r: any) => r && !r.error && r.qualified && (r.live === "LONG" || r.live === "SHORT");

export default function App() {
  const [tab, setTab] = useState(1);
  const [selected, setSelected] = useState<string[]>([
    "EURUSD=X", "GBPUSD=X", "GC=F", "CL=F", "BTC-USD", "ETH-USD", "AAPL", "NVDA", "^GSPC",
  ]);
  const [showAssets, setShowAssets] = useState(false);
  const [interval, setIntervalTf] = useState("1d"); // 4h | 1d only (divergence requirement)
  const [d1, setD1] = useState(todayMinus(1095));
  const [piv, setPiv] = useState(2);
  const [rsiP, setRsiP] = useState(14);

  const [minWin, setMinWin] = useState(60);
  const [minPF, setMinPF] = useState(2);
  const [minTrades, setMinTrades] = useState(20);

  const [res, setRes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [ranTab, setRanTab] = useState(0); // which tab the current res belongs to

  const [searchQuery, setSearchQuery] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const [cotMap, setCotMap] = useState<Record<string, any>>({});
  const [journalCount, setJournalCount] = useState<number | null>(null);
  const [takeMsg, setTakeMsg] = useState("");

  // chart panel
  const [chartSym, setChartSym] = useState<string>("");
  const [chartRaw, setChartRaw] = useState<any[]>([]);
  const [chartLevels, setChartLevels] = useState<any>(null);
  const [divPivots, setDivPivots] = useState<Record<string, any[]>>({});

  // ==================== PLAYBACK (TIME MACHINE) ====================
  const [pbOn, setPbOn] = useState(false);
  const [pbDate, setPbDate] = useState<string | null>(null);
  const [pbAxis, setPbAxis] = useState<string[]>([]);
  const [pbSnap, setPbSnap] = useState<any | null>(null);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbErr, setPbErr] = useState("");
  const [pbPlaying, setPbPlaying] = useState(false);
  const [pbSpeedMs, setPbSpeedMs] = useState(1200);
  const [pbJournalCount, setPbJournalCount] = useState<number | null>(null);
  const [pbOpenCount, setPbOpenCount] = useState(0);
  const [pbPauseMsg, setPbPauseMsg] = useState("");
  const pbFetchSeq = useRef(0);
  const pbCheckBusy = useRef(false);

  const qs = (extra: Record<string, any> = {}) => {
    const p = new URLSearchParams({
      symbols: selected.join(","),
      interval,
      start: d1,
      minWin: String(minWin), minPF: String(minPF), minTrades: String(minTrades),
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    });
    return p.toString();
  };

  useEffect(() => {
    fetch(`/api/trades?t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => setJournalCount(Array.isArray(d.trades) ? d.trades.length : 0))
      .catch(() => setJournalCount(0));
  }, []);

  const enterPlayback = async () => {
    setPbErr("");
    if (!selected.length) { setPbErr("Pehle kuch assets select karo"); return; }
    try {
      const r = await fetch(`/api/playback/axis?${qs()}&t=${Date.now()}`);
      const d = await r.json();
      if (!r.ok || !d.ok || !Array.isArray(d.dates) || !d.dates.length) {
        setPbErr(d.error || "Playback axis nahi mili");
        return;
      }
      setPbAxis(d.dates);
      setPbOn(true);
      setPbPauseMsg("");
      const idx = Math.max(0, d.dates.length - 252); // default ~1 trading year back
      setPbDate(d.dates[idx]);
      fetch(`/api/playback/trades?t=${Date.now()}`)
        .then((x) => x.json())
        .then((x) => {
          const list = Array.isArray(x.trades) ? x.trades : [];
          setPbJournalCount(list.length);
          setPbOpenCount(list.filter((t: any) => t.status === "OPEN" || t.status === "PENDING").length);
        })
        .catch(() => setPbJournalCount(0));
    } catch {
      setPbErr("Playback axis load nahi hui — server chal raha hai?");
    }
  };

  const exitPlayback = () => {
    setPbOn(false); setPbPlaying(false); setPbDate(null); setPbSnap(null);
    setPbErr(""); setPbPauseMsg("");
  };

  const snapToAxis = (d: string): string => {
    if (!pbAxis.length) return d;
    if (d <= pbAxis[0]) return pbAxis[0];
    let best = pbAxis[0];
    for (const x of pbAxis) { if (x <= d) best = x; else break; }
    return best;
  };

  const pbStep = (dir: 1 | -1) => {
    if (!pbDate || !pbAxis.length) return;
    const i = pbAxis.indexOf(pbDate);
    const j = (i === -1 ? pbAxis.findIndex((x) => x > pbDate) - 1 : i) + dir;
    if (j < 0 || j >= pbAxis.length) { setPbPlaying(false); return; }
    setPbDate(pbAxis[j]);
  };

  // snapshot fetch on virtual date change (stale responses dropped)
  useEffect(() => {
    if (!pbOn || !pbDate) return;
    const seq = ++pbFetchSeq.current;
    setPbLoading(true);
    fetch(`/api/playback/snapshot?${qs({ date: pbDate, piv, rsiP })}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== pbFetchSeq.current) return;
        if (d.ok) { setPbSnap(d); setPbErr(""); } else setPbErr(d.error || "snapshot fail");
      })
      .catch(() => { if (seq === pbFetchSeq.current) setPbErr("Snapshot load fail"); })
      .finally(() => { if (seq === pbFetchSeq.current) setPbLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbOn, pbDate]);

  // auto-play
  useEffect(() => {
    if (!pbPlaying || !pbOn) return;
    const t = setInterval(() => pbStep(1), pbSpeedMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbPlaying, pbOn, pbSpeedMs, pbDate]);

  // practice-trade watchdog: on every virtual-date move, resolve SL/TP
  useEffect(() => {
    if (!pbOn || !pbDate || pbOpenCount === 0 || pbCheckBusy.current) return;
    pbCheckBusy.current = true;
    fetch("/api/playback/trades/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asOfDate: pbDate, start: d1 }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        const list: any[] = Array.isArray(d.trades) ? d.trades : [];
        setPbJournalCount(list.length);
        setPbOpenCount(list.filter((t) => t.status === "OPEN" || t.status === "PENDING").length);
        if (d.updated > 0) {
          setPbPlaying(false);
          const resolved = list
            .filter((t) => t.exitDate && t.status !== "OPEN" && t.status !== "PENDING")
            .sort((a, b) => (b.exitDate || "").localeCompare(a.exitDate || ""))
            .slice(0, d.updated)
            .map((t) => `${NAME[t.symbol] || t.symbol} ${t.status === "TARGET_HIT" ? "🎯 TARGET" : t.status === "SL_HIT" ? "🛑 SL" : "exit"} (${t.returnPct >= 0 ? "+" : ""}${t.returnPct}%)`)
            .join(", ");
          setPbPauseMsg(`⏸ Auto-paused — ${resolved}. Details "My Trades" tab mein.`);
        }
      })
      .catch(() => {})
      .finally(() => { pbCheckBusy.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbOn, pbDate, pbOpenCount]);

  // ==================== LIVE RUN ====================
  const endpointFor = (t: number) => (t === 1 ? "overview" : t === 2 ? "optimize" : t === 3 ? "divergence" : t === 6 ? "fibonacci" : "cot");

  async function run() {
    if (!selected.length || tab === 5 || pbOn) return;
    setBusy(true); setRes([]); setRanTab(tab);
    try {
      const ep = endpointFor(tab);
      const extra = tab === 3 ? { piv, rsiP } : {};
      const r = await fetch(`/api/${ep}?${qs(extra)}`);
      const data = await r.json();
      const rows = Array.isArray(data) ? data : [];
      setRes(rows);
      if (ep === "divergence") {
        const dp: Record<string, any[]> = {};
        rows.forEach((row: any) => { if (row.pivots) dp[row.symbol] = row.pivots; });
        setDivPivots(dp);
      }
      if (ep === "optimize" || ep === "divergence") {
        fetch(`/api/cot?${qs()}`).then((x) => x.json()).then((cotArr) => {
          const m: Record<string, any> = {};
          if (Array.isArray(cotArr)) cotArr.forEach((c: any) => { if (!c.error) m[c.symbol] = c; });
          setCotMap(m);
        }).catch(() => {});
      }
    } catch {
      setRes([{ symbol: "—", error: "request failed" }]);
    } finally {
      setBusy(false);
    }
  }

  async function loadChart(sym: string) {
    setChartSym(sym);
    const source = displayRows;
    const row: any = source.find((r: any) => r.symbol === sym && !r.error);
    const lv = row ? (row.opt || row) : null;
    setChartLevels(lv && lv.entry ? { symbol: sym, entry: lv.entry, stop: lv.stop, target: lv.target } : null);
    try {
      const r = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&start=${d1}&interval=${pbOn ? "1d" : interval}`);
      const j = await r.json();
      setChartRaw(j.candles ? j.candles.map((c: any) => ({ date: c.date, close: c.close })) : []);
    } catch { setChartRaw([]); }
  }

  // playback: chart bhi sirf as-of date tak dikhta hai
  const chart = useMemo(
    () => (pbOn && pbDate ? chartRaw.filter((c) => String(c.date).slice(0, 10) <= pbDate) : chartRaw),
    [chartRaw, pbOn, pbDate]
  );
  const chartColor = useMemo(() => {
    if (chart.length < 2) return "#fbbf24";
    return chart[chart.length - 1].close >= chart[0].close ? "#10b981" : "#ef4444";
  }, [chart]);

  const toggle = (s: string) =>
    setSelected((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  // reset filters on tab change
  useEffect(() => {
    setSearchQuery(""); setLiveOnly(false); setSortKey(null); setSortAsc(false);
    setTakeMsg("");
    if (!pbOn) setRes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ==================== DATA SOURCE (live res vs playback snapshot) ====================
  const snapKey = tab === 1 ? "overview" : tab === 2 ? "optimize" : tab === 3 ? "divergence" : tab === 6 ? "fibonacci" : null;
  const sourceRows: any[] = pbOn
    ? (snapKey && pbSnap ? (pbSnap[snapKey] as any[]) ?? [] : [])
    : (ranTab === tab ? res : []);

  const displayRows = useMemo(() => {
    let out = [...sourceRows];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      out = out.filter((r: any) =>
        String(r.symbol || "").toLowerCase().includes(q) ||
        String(NAME[r.symbol] || "").toLowerCase().includes(q) ||
        String(r.strategy || r.opt?.strategy || "").toLowerCase().includes(q)
      );
    }
    if (liveOnly) {
      out = out.filter((r: any) => {
        const l = r.live || r.opt?.live || r.div?.live || r.fib?.live;
        return l === "LONG" || l === "SHORT";
      });
    }
    if (sortKey) {
      out.sort((a: any, b: any) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null) return sortAsc ? -1 : 1;
        if (vb == null) return sortAsc ? 1 : -1;
        if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
        const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
        return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }
    return out;
  }, [sourceRows, searchQuery, liveOnly, sortKey, sortAsc]);

  const handleSort = (k: string) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(false); }
  };

  // ==================== TAKE TRADE (journal) ====================
  const takeTrade = async (r: any, moduleLabel: string) => {
    const lv = r.opt && r.opt.entry != null ? r.opt : r;
    if (lv.entry == null || lv.stop == null || lv.target == null) { setTakeMsg("❌ Is row me entry/stop/target nahi hai"); return; }
    const base = pbOn ? "/api/playback/trades" : "/api/trades";
    try {
      const resp = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: r.symbol,
          name: NAME[r.symbol] || r.symbol,
          direction: (lv.live === "SHORT" ? "SHORT" : "LONG"),
          stop: lv.stop,
          target: lv.target,
          strategyLabel: lv.strategy || "RSI Divergence",
          module: moduleLabel,
          ...(pbOn ? { asOfDate: pbDate } : {}),
        }),
      });
      const d = await resp.json();
      if (d.ok) {
        setTakeMsg(`✋ ${NAME[r.symbol] || r.symbol} journal me add — entry agle bar ke open pe (PENDING)`);
        if (pbOn) { setPbJournalCount((c) => (c ?? 0) + 1); setPbOpenCount((c) => c + 1); }
        else setJournalCount((c) => (c ?? 0) + 1);
      } else setTakeMsg(`❌ ${d.error}`);
    } catch { setTakeMsg("❌ Journal request fail"); }
  };

  // ==================== STATS DASHBOARD ====================
  const okRows = sourceRows.filter((r: any) => !r.error);
  const qualCount = okRows.filter((r: any) => r.qualified || r.opt?.qualified || r.div?.qualified).length;
  const actCount = okRows.filter((r: any) => actionable(r) || actionable(r.opt) || actionable(r.div)).length;
  const pbIdx = pbOn && pbDate ? pbAxis.indexOf(pbDate) : -1;
  const effJournalCount = pbOn ? pbJournalCount : journalCount;

  return (
    <div className="app">
      {/* ==================== MASTHEAD ==================== */}
      <header className="masthead">
        <div className="brand">
          <span className="mark">quant<span className="dot">.</span>desk</span>
          <span className="sub">Global Multi-Asset · Walk-Forward 70/30 OOS · Yahoo Finance</span>
        </div>
        <div className="mast-actions">
          {!pbOn ? (
            <button type="button" className="pb-enter-btn" onClick={enterPlayback}
              title="Time machine: dashboard ko kisi bhi past date pe le jao">
              🕰 Playback
            </button>
          ) : (
            <button type="button" className="pb-exit-btn" onClick={exitPlayback}>
              ⏹ Return to Today
            </button>
          )}
          {pbErr && !pbOn && <span className="err-inline">{pbErr}</span>}
          <div className="gatestamp">
            <span className="gate-label">OOS GATE</span>
            <span className="gate-rules">Win ≥ {minWin}% · PF ≥ {minPF} · 70/30 walk-forward</span>
          </div>
        </div>
      </header>

      {/* ==================== 🕰 TIME MACHINE STRIP ==================== */}
      {pbOn && (
        <div className="pb-strip">
          <span className="pb-title">🕰 PLAYBACK MODE</span>
          <input
            type="date"
            value={pbDate || ""}
            min={pbAxis[60] || pbAxis[0]}
            max={pbAxis[pbAxis.length - 1]}
            onChange={(e) => { setPbPlaying(false); setPbDate(snapToAxis(e.target.value)); }}
          />
          <button className="toggle-filter-btn" onClick={() => { setPbPlaying(false); pbStep(-1); }} title="Ek trading din peeche">⏮ Prev</button>
          <button className="toggle-filter-btn" onClick={() => { setPbPlaying(false); pbStep(1); }} title="Ek trading din aage">Next ⏭</button>
          <button
            className="toggle-filter-btn pb-play"
            onClick={() => { setPbPauseMsg(""); setPbPlaying(!pbPlaying); }}
            style={{ background: pbPlaying ? "rgba(168,85,247,0.25)" : undefined }}
          >
            {pbPlaying ? "⏸ Pause" : "▶ Auto-play"}
          </button>
          <select value={pbSpeedMs} onChange={(e) => setPbSpeedMs(Number(e.target.value))} title="Auto-play speed">
            <option value={2000}>🐢 Slow (2s/din)</option>
            <option value={1200}>▶ Normal (1.2s/din)</option>
            <option value={500}>⏩ Fast (0.5s/din)</option>
            <option value={150}>🚀 Turbo (0.15s/din)</option>
          </select>
          <span className="pb-count">
            Din {pbIdx >= 0 ? pbIdx + 1 : "—"} / {pbAxis.length}
            {pbLoading && <span className="pb-load">⏳</span>}
          </span>
          {pbErr && <span className="err-inline">{pbErr}</span>}
          {pbPauseMsg && <span className="pb-pause-msg">{pbPauseMsg}</span>}
          <span className="pb-note">
            Dashboard bilkul waisa hai jaisa {pbDate} ke close pe hota — engine ko us date ke baad ka koi data nahi dikhta (daily candles pe). Practice trades "My Trades" tab me alag journal me track hote hain.
          </span>
        </div>
      )}

      {/* ==================== STATS DASHBOARD ==================== */}
      <section className="stats-dashboard">
        <div className="stat-card">
          <span className="stat-label">Assets Selected</span>
          <span className="stat-value">{selected.length} <span className="stat-value-sub">/ {ASSETS.length}</span></span>
          <div className="stat-progress"><span className="stat-progress-fill" style={{ width: `${(selected.length / ASSETS.length) * 100}%` }} /></div>
          <span className="stat-sub">Forex · Comm · Crypto · US Stocks · Index</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Scanned</span>
          <span className="stat-value">{okRows.length} <span className="stat-value-sub">/ {sourceRows.length}</span></span>
          <div className="stat-progress"><span className="stat-progress-fill success" style={{ width: `${(okRows.length / (sourceRows.length || 1)) * 100}%` }} /></div>
          <span className="stat-sub">Rows with valid history</span>
        </div>
        <div className="stat-card highlights">
          <span className="stat-label">OOS Qualified</span>
          <span className="stat-value text-gold">{qualCount} <span className="stat-value-sub">passed</span></span>
          <div className="stat-progress"><span className="stat-progress-fill gold" style={{ width: `${(qualCount / (okRows.length || 1)) * 100}%` }} /></div>
          <span className="stat-sub">IS + out-of-sample dono gates clear</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Actionable Now</span>
          <span className="stat-value text-green">{actCount} <span className="stat-value-sub">Pass + Live</span></span>
          <div className="stat-progress"><span className="stat-progress-fill success" style={{ width: `${(actCount / (okRows.length || 1)) * 100}%` }} /></div>
          <span className="stat-sub">Qualified + live LONG/SHORT signal</span>
        </div>
      </section>

      {pbOn ? (
        <div className="last-updated-bar pb-bar">
          <span className="pulse-indicator purple" />
          Time machine active — dashboard as of {pbDate} (close). Aaj ke data pe wapas jaane ke liye "Return to Today" dabao.
        </div>
      ) : (
        <div className="last-updated-bar">
          <span className="pulse-indicator" />
          Live on-demand data · Yahoo Finance (delayed/EOD) · koi API key nahi
        </div>
      )}

      {/* ==================== CONTROLS ==================== */}
      <section className="controls-panel">
        <div className="controls-row">
          <button className="toggle-filter-btn" onClick={() => setShowAssets(!showAssets)}>
            🌐 Assets ({selected.length}) {showAssets ? "▲" : "▼"}
          </button>
          <label className="ctl">Timeframe
            <select value={interval} onChange={(e) => setIntervalTf(e.target.value)} disabled={pbOn} title={pbOn ? "Playback daily candles pe chalta hai" : ""}>
              <option value="4h">4 Hour (≈2y max)</option>
              <option value="1d">Daily</option>
            </select>
          </label>
          <label className="ctl">Backtest start
            <input type="date" value={d1} onChange={(e) => setD1(e.target.value)} disabled={pbOn} />
          </label>
          <label className="ctl">Min win %
            <input type="number" min={0} max={100} value={minWin} onChange={(e) => setMinWin(+e.target.value)} disabled={pbOn} />
          </label>
          <label className="ctl">Min PF
            <input type="number" min={0} step={0.1} value={minPF} onChange={(e) => setMinPF(+e.target.value)} disabled={pbOn} />
          </label>
          <label className="ctl">Min trades
            <input type="number" min={1} value={minTrades} onChange={(e) => setMinTrades(+e.target.value)} disabled={pbOn} />
          </label>
          {tab === 3 && (
            <>
              <label className="ctl">Pivot
                <input type="number" min={2} max={6} value={piv} onChange={(e) => setPiv(+e.target.value)} disabled={pbOn} />
              </label>
              <label className="ctl">RSI period
                <input type="number" min={7} max={21} value={rsiP} onChange={(e) => setRsiP(+e.target.value)} disabled={pbOn} />
              </label>
            </>
          )}
        </div>
        {showAssets && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <button
                className="toggle-filter-btn"
                style={{ fontSize: "11px", padding: "4px 10px" }}
                onClick={() => setSelected(ASSETS.map((a) => a.sym))}
              >
                ✓ Select All
              </button>
              <button
                className="toggle-filter-btn"
                style={{ fontSize: "11px", padding: "4px 10px" }}
                onClick={() => setSelected([])}
              >
                ✕ Clear All
              </button>
            </div>
            <div className="chips" style={{ marginTop: 0 }}>
              {ASSETS.map((a) => (
                <button key={a.sym} className={`chip ${selected.includes(a.sym) ? "on" : ""}`} onClick={() => toggle(a.sym)}>
                  {a.name}<span className="cat">{a.cat}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ==================== PRICE CHART ==================== */}
      <section className="panel chart-panel">
        <div className="chart-head">
          <h4>Price {pbOn && pbDate ? `(as of ${pbDate})` : ""}</h4>
          <select value={chartSym} onChange={(e) => loadChart(e.target.value)}>
            <option value="">— asset chuno —</option>
            {selected.map((s) => <option key={s} value={s}>{NAME[s] || s}</option>)}
          </select>
          {chartSym && <button className="toggle-filter-btn" onClick={() => loadChart(chartSym)}>↻ Reload</button>}
        </div>
        <div style={{ height: 220 }}>
          {chart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#576575", fontSize: 10, fontFamily: "JetBrains Mono" }} minTickGap={50} stroke="rgba(148,163,184,0.15)" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#576575", fontSize: 10, fontFamily: "JetBrains Mono" }} width={56} stroke="rgba(148,163,184,0.15)" />
                <Tooltip contentStyle={{ background: "#0f141c", border: "1px solid #212836", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }} labelStyle={{ color: "#8e9ba9" }} />
                <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={1.8} fill="url(#g)" />
                {chartLevels && chartLevels.symbol === chartSym && (
                  <>
                    {chartLevels.entry != null && <ReferenceLine y={chartLevels.entry} stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1} />}
                    {chartLevels.stop != null && <ReferenceLine y={chartLevels.stop} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />}
                    {chartLevels.target != null && <ReferenceLine y={chartLevels.target} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1} />}
                  </>
                )}
                {(divPivots[chartSym] || []).map((p: any, i: number) => (
                  <ReferenceDot key={i} x={p.date} y={p.price} r={3.5} fill={p.type === "bull" ? "#10b981" : "#ef4444"} stroke="none" />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Asset select karke chart load karo — entry/stop/target lines aur divergence pivots yahan dikhte hain.</div>
          )}
        </div>
      </section>

      {/* ==================== TABS ==================== */}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={"tab" + (tab === t.n ? " active" : "")} onClick={() => setTab(t.n)}>
            <span className="num">{String(t.n).padStart(2, "0")}</span>
            {t.label}
            {t.n === 5 && effJournalCount != null && effJournalCount > 0 && <span className="badge">{effJournalCount}</span>}
          </button>
        ))}
      </nav>
      <p className="tab-desc">{DESC[tab]}</p>

      <section className="panel main-panel">
        {/* toolbar: run + search + filters */}
        {tab !== 5 && (
          <div className="toolbar">
            {!pbOn && (
              <button className="run-btn" disabled={busy} onClick={run}>
                {busy ? "⏳ Running…" : tab === 1 ? "▶ Load overview" : tab === 2 ? "▶ Run optimizer" : tab === 3 ? "▶ Scan divergence" : tab === 6 ? "▶ Run Fibonacci" : "▶ Fetch COT"}
              </button>
            )}
            {tab !== 4 && (
              <>
                <div className="search-box">
                  <input placeholder="Search symbol, name, strategy…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  {searchQuery && <button className="clear-btn" onClick={() => setSearchQuery("")}>✕</button>}
                </div>
                <button className={`toggle-filter-btn ${liveOnly ? "active" : ""}`} onClick={() => setLiveOnly(!liveOnly)}>
                  <span className="toggle-dot" /> LIVE Signals Only
                </button>
              </>
            )}
            <span className="rows-count-badge">Showing {displayRows.length} of {sourceRows.length}</span>
            {takeMsg && <span className="take-msg">{takeMsg}</span>}
          </div>
        )}

        {/* COT tab is live-only (historical COT reconstruction not supported) */}
        {pbOn && tab === 4 ? (
          <div className="state">
            <div className="big">COT playback me available nahi</div>
            <p>CFTC ki weekly report ka historical point-in-time reconstruct is version me nahi hai — COT sirf live mode me dekho.</p>
          </div>
        ) : tab === 5 ? (
          <MyTrades
            key={pbOn ? "pb" : "live"}
            mode={pbOn ? "playback" : "live"}
            asOfDate={pbOn ? (pbDate || undefined) : undefined}
            startDate={d1}
            onCountChange={pbOn ? setPbJournalCount : setJournalCount}
            nameMap={NAME}
          />
        ) : pbOn && !pbSnap ? (
          <div className="state"><div className="spinner" />{pbErr || `Building the dashboard as of ${pbDate}…`}</div>
        ) : busy ? (
          <div className="state"><div className="spinner" />Real market data pe backtest chal raha hai…</div>
        ) : sourceRows.length === 0 ? (
          <div className="state empty-state">
            <div className="big">{pbOn ? "Snapshot me data nahi" : "Abhi koi result nahi"}</div>
            <p>{pbOn ? "Date badlo ya assets check karo." : "Assets select karo aur upar Run dabao — data live Yahoo Finance se aata hai."}</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="state empty-state">
            <div className="big">No matches in this view</div>
            <p>{sourceRows.length} rows hain, lekin current filters se koi match nahi{liveOnly ? " — koi LIVE signal nahi" : ""}.</p>
            <button className="toggle-filter-btn" onClick={() => { setSearchQuery(""); setLiveOnly(false); }}>Reset Filters</button>
          </div>
        ) : (
          <>
            {(tab === 2 || tab === 3) && <LiveSetups res={displayRows} onTake={(r) => takeTrade(r, tab === 2 ? "optimizer" : "divergence")} />}

            {tab === 1 && <OverviewTable res={displayRows} onTake={(r) => takeTrade(r, "overview")} onChart={loadChart} pbOn={pbOn} />}

            {tab === 1 && !pbOn && <ScoreBacktest qs={qs} />}

            {tab === 2 && (
              <ResultTable res={displayRows} cotMap={pbOn ? {} : cotMap} onSort={handleSort} sortKey={sortKey} sortAsc={sortAsc}
                onTake={(r) => takeTrade(r, "optimizer")} onChart={loadChart}
                cols={[
                  ["strategy", "Strategy", "text"], ["live", "Signal", "pill"],
                  ["isWin", "IS Win%", "num"], ["isPF", "IS PF", "num"],
                  ["oosWin", "OOS Win%", "num"], ["oosPF", "OOS PF", "num"],
                  ["oosTrades", "OOS Trades", "int"],
                  ["entry", "Entry", "price"], ["stop", "Stop", "price"], ["target", "Target", "price"],
                  ["cot", "COT", "cotbadge"],
                  ["qualified", "Pass", "check"],
                ]} />
            )}

            {tab === 3 && (
              <>
                <DivSummary res={displayRows} interval={pbOn ? "1d" : interval} />
                <ResultTable res={displayRows} cotMap={pbOn ? {} : cotMap} onSort={handleSort} sortKey={sortKey} sortAsc={sortAsc}
                  onTake={(r) => takeTrade(r, "divergence")} onChart={loadChart}
                  cols={[
                    ["live", "Signal", "pill"], ["signals", "Signals", "int"],
                    ["isWin", "IS Win%", "num"], ["isPF", "IS PF", "num"],
                    ["oosWin", "OOS Win%", "num"], ["oosPF", "OOS PF", "num"],
                    ["oosTrades", "OOS Trades", "int"],
                    ["entry", "Entry", "price"], ["stop", "Stop", "price"], ["target", "Target", "price"],
                    ["cot", "COT", "cotbadge"],
                    ["qualified", "Pass", "check"],
                  ]} />
              </>
            )}

            {tab === 4 && <CotTable res={displayRows} />}

            {tab === 6 && (
              <>
                <div className="conv-summary">
                  📐 <b>Fibonacci Retracement</b> — swing high/low detect karke 38.2% / 50% / 61.8% retracement pe bounce signal. Walk-forward 70/30 best variant chunta hai. OOS PF aur win% = asli 1-saal ka result.
                </div>
                <ResultTable res={displayRows} cotMap={{}} onSort={handleSort} sortKey={sortKey} sortAsc={sortAsc}
                  onTake={(r) => takeTrade(r, "fibonacci")} onChart={loadChart}
                  cols={[
                    ["strategy", "Fib Level", "text"], ["live", "Signal", "pill"],
                    ["isWin", "IS Win%", "num"], ["isPF", "IS PF", "num"],
                    ["oosWin", "OOS Win%", "num"], ["oosPF", "OOS PF", "num"],
                    ["oosTrades", "OOS Trades", "int"],
                    ["entry", "Entry", "price"], ["stop", "Stop", "price"], ["target", "Target", "price"],
                    ["qualified", "Pass", "check"],
                  ]} />
              </>
            )}
          </>
        )}
      </section>

      <p className="disclaimer">
        ⚠ Educational research tool — NOT financial advice. Data: Yahoo Finance (delayed/EOD), genuine market prices.
        Backtest assumes entry at next bar open, ATR-based SL/TP, no overlapping trades, walk-forward 70/30 out-of-sample validation
        (overfitting guard). Past performance future profit guarantee nahi karta.
      </p>
    </div>
  );
}

// ==================== COMPONENTS ====================

function CotBadge({ info }: { info: any }) {
  if (!info || info.error) return <span className="muted">—</span>;
  if (info.bias === "LONG-crowded") return <span className="pill SHORT" title="Speculators crowded long → contrarian short context">crowded L · {info.index}</span>;
  if (info.bias === "SHORT-crowded") return <span className="pill LONG" title="Speculators crowded short → contrarian long context">crowded S · {info.index}</span>;
  return <span className="pill none">neutral · {info.index}</span>;
}

// 📊 Divergence historical backtest — universe-level success summary
function DivSummary({ res, interval }: { res: any[]; interval: string }) {
  const ok = res.filter((r) => !r.error && typeof r.oosPF === "number");
  if (!ok.length) return null;
  const totOosTrades = ok.reduce((a, r) => a + (r.oosTrades || 0), 0);
  const totIsTrades = ok.reduce((a, r) => a + (r.isTrades || 0), 0);
  const wOosWin = totOosTrades ? ok.reduce((a, r) => a + (r.oosWin || 0) * (r.oosTrades || 0), 0) / totOosTrades : 0;
  const wIsWin = totIsTrades ? ok.reduce((a, r) => a + (r.isWin || 0) * (r.isTrades || 0), 0) / totIsTrades : 0;
  const medOosPF = median(ok.map((r) => r.oosPF).filter((x) => isFinite(x)));
  const medIsPF = median(ok.map((r) => r.isPF).filter((x) => isFinite(x)));
  const qual = ok.filter((r) => r.qualified);
  const best = [...ok].sort((a, b) => (b.oosPF || 0) - (a.oosPF || 0))[0];
  const decay = medIsPF > 0 ? ((medOosPF - medIsPF) / medIsPF) * 100 : 0;

  return (
    <div className="cards">
      <div className="card wide">
        <h4>📊 Divergence — historical backtest success ({interval} candles, {ok.length} assets)</h4>
        <div className="divsum-grid">
          <div className="divsum-cell">
            <span className="k">In-sample (train 70%)</span>
            <span className="v">{wIsWin.toFixed(1)}% win · median PF {medIsPF.toFixed(2)}</span>
            <span className="s">{totIsTrades} trades</span>
          </div>
          <div className="divsum-cell hl">
            <span className="k">Out-of-sample (test 30%)</span>
            <span className="v">{wOosWin.toFixed(1)}% win · median PF {medOosPF.toFixed(2)}</span>
            <span className="s">{totOosTrades} trades — YAHI asli success rate hai (unseen data)</span>
          </div>
          <div className="divsum-cell">
            <span className="k">OOS gate passed</span>
            <span className="v">{qual.length} / {ok.length} assets</span>
            <span className="s">{qual.length ? qual.map((r) => NAME[r.symbol] || r.symbol).slice(0, 5).join(", ") + (qual.length > 5 ? "…" : "") : "koi nahi is gate pe"}</span>
          </div>
          <div className="divsum-cell">
            <span className="k">Best asset (OOS PF)</span>
            <span className="v">{best ? `${NAME[best.symbol] || best.symbol} · PF ${num(best.oosPF)}` : "—"}</span>
            <span className="s">{best ? `${num(best.oosWin, 1)}% win, ${best.oosTrades} OOS trades` : ""}</span>
          </div>
        </div>
        <div className="divsum-note">
          IS→OOS PF change: <strong className={decay >= -20 ? "pos" : "neg"}>{decay >= 0 ? "+" : ""}{decay.toFixed(0)}%</strong>
          {" — "}agar OOS numbers IS se bahut girte hain to strategy overfit hai; isliye Pass ke liye out-of-sample validation zaroori rakha gaya hai.
        </div>
      </div>
    </div>
  );
}

function LiveSetups({ res, onTake }: { res: any[]; onTake: (r: any) => void }) {
  if (!res.length) return null;
  const hits = res.filter(actionable);
  if (!hits.length)
    return (
      <div className="live-empty">
        🎯 Abhi koi <b>Pass + Live</b> setup nahi. Jab kisi row me <b>✓ pass</b> aur <b>LONG/SHORT</b> dono honge,
        wo actionable setup yahan top par card ban ke aayega — entry, stop, target ke saath.
      </div>
    );
  return (
    <div className="live-wrap">
      <div className="live-head">🎯 {hits.length} actionable setup{hits.length > 1 ? "s" : ""} — Pass + Live</div>
      <div className="live-grid">
        {hits.map((r, i) => (
          <div key={i} className={`setup ${r.live}`}>
            <div className="setup-top">
              <span className="setup-sym">{NAME[r.symbol] || r.symbol}</span>
              <span className={`pill ${r.live}`}>{r.live}</span>
            </div>
            <div className="setup-strat">{r.strategy}</div>
            <div className="setup-levels">
              <div><span>Entry</span><b>{price(r.entry)}</b></div>
              <div><span>Stop</span><b className="neg">{price(r.stop)}</b></div>
              <div><span>Target</span><b className="pos">{price(r.target)}</b></div>
            </div>
            <div className="setup-meta">OOS {num(r.oosWin, 1)}% · PF {num(r.oosPF, 2)} · R:R {r.rr ?? "—"}</div>
            <button className="take-btn" onClick={() => onTake(r)}>✋ Take this trade</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Conviction Score (0-100) ----------------
// Combines: OOS strength of each module (trade-count sanity), module agreement,
// live signal presence, COT agreement, and rare full-gate PASS. Flat = capped low.
function convictionScore(r: any): { score: number; bucket: "green" | "yellow" | "red"; live: string | null; reasons: string[]; warn: string[] } {
  const o = r.opt, d = r.div, cot = r.cot;
  const reasons: string[] = [], warn: string[] = [];
  if (!o && !d) return { score: 0, bucket: "red", live: null, reasons, warn };

  const isLive = (x: any) => x && (x.live === "LONG" || x.live === "SHORT");
  const optLive = isLive(o) ? o.live : null;
  const divLive = isLive(d) ? d.live : null;
  const live: string | null = optLive || divLive;

  // credible PF: needs enough OOS trades and not a fake sentinel (999)
  const credPF = (x: any) => (x && x.oosTrades >= 12 && x.oosPF > 0 && x.oosPF < 50 ? x.oosPF : null);
  const optPF = credPF(o), divPF = credPF(d);
  const q = (pf: number) => Math.max(0, Math.min(25, (pf - 1) * 25)); // pf1→0, 1.5→12.5, 2→25

  let score = 0;
  if (optPF) score += q(optPF);
  if (divPF) score += q(divPF);

  // both modules credible & healthy → agreement bonus
  if (optPF && divPF) {
    if (optPF >= 1.3 && divPF >= 1.3) { score += 15; reasons.push("dono module OOS healthy"); }
    else score += 6;
  }
  // live signal is what makes it actionable
  if (live) { score += 20; reasons.push(`live ${live} signal`); }
  // COT agreement (context)
  if (cot && cot.contrarian && cot.contrarian !== "-" && live && cot.contrarian === live) {
    score += 15; reasons.push("COT context bhi isi taraf");
  } else if (cot && cot.bias === "neutral") { score += 4; }
  // rare full-gate PASS
  if ((o && o.qualified) || (d && d.qualified)) { score += 20; reasons.push("gate PASS (IS+OOS)"); }

  // caps / penalties
  if (!live) { score = Math.min(score, 35); warn.push("koi live signal nahi (abhi entry nahi)"); }
  const liveTr = optLive ? o?.oosTrades : divLive ? d?.oosTrades : 0;
  if (live && liveTr != null && liveTr < 10) { score = Math.min(score, 40); warn.push("bahut kam OOS trades — bharosa kam"); }
  const hasFake = (o && o.oosPF >= 50) || (d && d.oosPF >= 50);
  if (hasFake) warn.push("ek PF fake hai (bahut kam trades)");

  score = Math.round(Math.max(0, Math.min(100, score)));
  const bucket = score >= 70 ? "green" : score >= 45 ? "yellow" : "red";
  return { score, bucket, live, reasons, warn };
}

const BUCKET_STYLE: Record<string, any> = {
  green: { color: "#052e1a", background: "#2dd4a7" },
  yellow: { color: "#3a2c05", background: "#f2c14e" },
  red: { color: "#c9d3df", background: "rgba(148,163,184,0.18)" },
};

function ScoreBacktest({ qs }: { qs: (extra?: Record<string, any>) => string }) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr(""); setData(null);
    try {
      const r = await fetch(`/api/score-backtest?${qs({ piv: 2, rsiP: 14 })}&t=${Date.now()}`);
      const d = await r.json();
      if (d.ok) setData(d); else setErr(d.error || "backtest fail");
    } catch { setErr("Backtest request fail — free tier slow ho sakta hai, dobara try karo."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
      <button className="btn" style={{ width: "auto", padding: "10px 20px" }} disabled={busy} onClick={run}>
        {busy ? "⏳ Backtesting… (1-2 min lag sakta hai)" : "📊 Backtest score — pichhle 1 saal me kis score ka kya hua"}
      </button>
      {err && <div className="banner" style={{ marginTop: 12 }}>{err}</div>}
      {data && (
        <div style={{ marginTop: 12 }}>
          <div className="conv-summary">
            <b>{data.signalsFound}</b> live signals mile ({data.testedDates} points checked). Win rate = 🎯 ÷ (🎯 + 🛑).
            {" "}Ye <b>COT ke bina</b> score hai aur overlapping signals count hue — <b>indication</b> samjho, guarantee nahi.
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Score bucket</th><th>Signals</th><th>🎯 Target</th><th>🛑 Stop</th><th>⏳ Timeout</th><th>Win rate</th><th>Avg return</th>
              </tr></thead>
              <tbody>
                {data.buckets.map((b: any, i: number) => (
                  <tr key={i} className={b.label === "70+" ? "hot" : ""}>
                    <td className="sym">{b.label}</td>
                    <td>{b.count}</td>
                    <td className="pos">{b.target}</td>
                    <td className="neg">{b.stop}</td>
                    <td className="muted">{b.timeout}</td>
                    <td><b>{b.winRate == null ? "—" : b.winRate + "%"}</b></td>
                    <td className={b.avgReturn > 0 ? "pos" : b.avgReturn < 0 ? "neg" : ""}>{b.avgReturn == null ? "—" : (b.avgReturn > 0 ? "+" : "") + b.avgReturn + "%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.failedSymbols?.length ? <div className="note" style={{ marginTop: 6 }}>Data nahi mila: {data.failedSymbols.join(", ")}</div> : null}
          <div className="note" style={{ marginTop: 6 }}>{data.note}</div>
        </div>
      )}
    </div>
  );
}

function OverviewTable({ res, onTake, onChart, pbOn }: { res: any[]; onTake: (r: any) => void; onChart: (s: string) => void; pbOn: boolean }) {
  if (!res.length) return <div className="empty">Load overview to see every asset ranked by conviction.</div>;

  // score every row, sort best-first (errors last)
  const scored = res.map((r) => ({ r, s: r.error ? null : convictionScore(r) }));
  scored.sort((a, b) => (b.s?.score ?? -1) - (a.s?.score ?? -1));
  const greens = scored.filter((x) => x.s?.bucket === "green").length;
  const yellows = scored.filter((x) => x.s?.bucket === "yellow").length;

  return (
    <>
      <div className="conv-summary">
        {greens > 0
          ? <>🟢 <b>{greens}</b> worth a look · 🟡 {yellows} watch · baaki skip. Upar wale zyada conviction wale hain.</>
          : yellows > 0
            ? <>🟢 Aaj koi strong (70+) setup nahi. 🟡 <b>{yellows}</b> borderline "watch" hain — neeche dekho, par soch-samajh ke.</>
            : <>Aaj koi conviction-worthy setup nahi (sab low score). <b>Intezaar karna bhi ek trade hai.</b></>}
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Score</th><th>Asset</th>
              <th>Opt OOS PF</th><th>Div OOS PF</th><th>Live</th><th>COT</th>
              <th>Why</th><th></th>
            </tr>
          </thead>
          <tbody>
            {scored.map(({ r, s }, i) => {
              if (r.error) return (
                <tr key={i}><td>—</td><td className="sym">{NAME[r.symbol] || r.symbol}</td>
                  <td colSpan={6} className="err" style={{ textAlign: "left" }}>{r.error}</td></tr>
              );
              const o = r.opt, d = r.div;
              const optAct = actionable(o), divAct = actionable(d);
              const why = s!.reasons.length ? s!.reasons.join(" · ") : "context only";
              return (
                <tr key={i} className={s!.bucket === "green" ? "hot" : ""}>
                  <td><span className="conv-badge" style={BUCKET_STYLE[s!.bucket]}>{s!.score}</span></td>
                  <td className="sym clickable" onClick={() => onChart(r.symbol)} title="Chart dekho">{NAME[r.symbol] || r.symbol}</td>
                  <td className={o && o.oosPF >= 1.5 && o.oosPF < 50 ? "pos" : ""}>{o && o.oosPF >= 50 ? "fake" : num(o?.oosPF, 2)}</td>
                  <td className={d && d.oosPF >= 1.5 && d.oosPF < 50 ? "pos" : ""}>{d && d.oosPF >= 50 ? "fake" : num(d?.oosPF, 2)}</td>
                  <td><Pill v={s!.live ?? "-"} /></td>
                  <td>{pbOn ? <span className="muted">—</span> : <CotBadge info={r.cot} />}</td>
                  <td className="muted" style={{ textAlign: "left", fontSize: "11.5px" }}>
                    {why}{s!.warn.length ? <span style={{ color: "#f2c14e" }}> · ⚠️ {s!.warn.join("; ")}</span> : null}
                  </td>
                  <td>{(optAct || divAct) && <button className="take-btn sm" onClick={() => onTake(optAct ? { symbol: r.symbol, opt: o } : { symbol: r.symbol, ...d })}>✋</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CotTable({ res }: { res: any[] }) {
  if (!res.length) return <div className="empty">Fetch COT to see positioning context.</div>;
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr><th>Asset</th><th>Net spec</th><th>COT index</th><th>Positioning</th><th>Contrarian bias</th></tr>
        </thead>
        <tbody>
          {res.map((r, i) => (
            <tr key={i}>
              <td className="sym">{NAME[r.symbol] || r.symbol}</td>
              {r.error ? (
                <td colSpan={4} className="err" style={{ textAlign: "left" }}>{r.error}</td>
              ) : (
                <>
                  <td>{typeof r.net === "number" ? r.net.toLocaleString() : "—"}</td>
                  <td>{r.index ?? "—"}</td>
                  <td><span className={`pill ${r.bias === "LONG-crowded" ? "SHORT" : r.bias === "SHORT-crowded" ? "LONG" : "none"}`}>{r.bias ?? "—"}</span></td>
                  <td>{r.contrarian && r.contrarian !== "-" ? <span className={`pill ${r.contrarian}`}>{r.contrarian}</span> : <span className="muted">neutral</span>}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultTable({ res, cols, cotMap, onSort, sortKey, sortAsc, onTake, onChart }: {
  res: any[]; cols: [string, string, string][]; cotMap?: Record<string, any>;
  onSort: (k: string) => void; sortKey: string | null; sortAsc: boolean;
  onTake: (r: any) => void; onChart: (s: string) => void;
}) {
  if (!res.length) return <div className="empty">No results yet — Run dabao.</div>;

  const errs = res.filter((r) => r.error);
  const data = res.filter((r) => !r.error);
  const noneQualified = data.length > 0 && data.filter((r) => r.qualified).length === 0;
  const shown = [...data, ...errs];

  return (
    <>
      {noneQualified && (
        <div className="banner">
          Kisi setup ne OOS gate (win % / PF / trades — out-of-sample) paar nahi kiya — neeche <b>closest attempts</b> dikhaye hain.
          Timeframe / start date badlo ya gate adjust karo. (Sab paar karna real data me hamesha possible nahi — yahi overfitting-check ka point hai.)
        </div>
      )}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => onSort("symbol")}>Asset{sortKey === "symbol" ? (sortAsc ? " ▲" : " ▼") : ""}</th>
              {cols.map((c) => (
                <th key={c[0]} className={c[2] === "cotbadge" ? "" : "sortable"}
                  onClick={() => c[2] !== "cotbadge" && onSort(c[0])}>
                  {c[1]}{sortKey === c[0] ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className={actionable(row) ? "hot" : ""}>
                <td className="sym clickable" onClick={() => !row.error && onChart(row.symbol)} title="Chart dekho">{NAME[row.symbol] || row.symbol}</td>
                {row.error ? (
                  <td colSpan={cols.length + 1} className="err" style={{ textAlign: "left" }}>{row.error}</td>
                ) : (
                  <>
                    {cols.map(([key, , type]) => {
                      const v = row[key];
                      if (type === "check")
                        return <td key={key}><span className={`pill ${v ? "LONG" : "none"}`}>{v ? "✓ pass" : "✗"}</span></td>;
                      if (type === "pill") return <td key={key}><Pill v={v} /></td>;
                      if (type === "text") return <td key={key} className="muted" style={{ textAlign: "left" }}>{v ?? "—"}</td>;
                      if (type === "cotbadge") { const cb = cotMap?.[row.symbol]; return <td key={key}><CotBadge info={cb} /></td>; }
                      if (type === "price") {
                        const k = key === "target" ? "pos" : key === "stop" ? "neg" : "";
                        return <td key={key} className={k}>{price(v)}</td>;
                      }
                      if (type === "int") return <td key={key}>{v ?? "—"}</td>;
                      const pf2 = ["profitFactor", "isPF", "oosPF"].includes(key);
                      return <td key={key}>{num(v, pf2 ? 2 : 1)}</td>;
                    })}
                    <td>{actionable(row) && <button className="take-btn sm" onClick={() => onTake(row)} title="Take this trade">✋</button>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

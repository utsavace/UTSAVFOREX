import { useEffect, useRef, useState } from "react";
import { MyTrades } from "./components/MyTrades";

// ── Types ──────────────────────────────────────────────────────
type Cat = "Forex" | "Crypto" | "Comm" | "Stock" | "Index";
interface Asset { sym: string; name: string; cat: Cat; }
interface Signal {
  strategy: string; stratKey: string; dir: "LONG" | "SHORT";
  entry: number | null; stop: number | null; target: number | null;
  rr: string; oosPF: number; winRate: number; note: string;
  rsiVal?: number | null; zVal?: number | null; regime: string;
}
interface ScreenerRow {
  symbol: string; signals: Signal[]; cot?: any;
  regime?: string; error?: string;
}

// ── Assets list ────────────────────────────────────────────────
const ASSETS: Asset[] = [
  // Forex
  { sym:"EURUSD=X",name:"EUR/USD",cat:"Forex" },{ sym:"GBPUSD=X",name:"GBP/USD",cat:"Forex" },
  { sym:"USDJPY=X",name:"USD/JPY",cat:"Forex" },{ sym:"USDCHF=X",name:"USD/CHF",cat:"Forex" },
  { sym:"AUDUSD=X",name:"AUD/USD",cat:"Forex" },{ sym:"USDCAD=X",name:"USD/CAD",cat:"Forex" },
  { sym:"NZDUSD=X",name:"NZD/USD",cat:"Forex" },{ sym:"EURJPY=X",name:"EUR/JPY",cat:"Forex" },
  { sym:"GBPJPY=X",name:"GBP/JPY",cat:"Forex" },{ sym:"EURGBP=X",name:"EUR/GBP",cat:"Forex" },
  { sym:"AUDJPY=X",name:"AUD/JPY",cat:"Forex" },{ sym:"GBPCHF=X",name:"GBP/CHF",cat:"Forex" },
  { sym:"EURCHF=X",name:"EUR/CHF",cat:"Forex" },{ sym:"GBPCAD=X",name:"GBP/CAD",cat:"Forex" },
  { sym:"GBPAUD=X",name:"GBP/AUD",cat:"Forex" },{ sym:"GBPNZD=X",name:"GBP/NZD",cat:"Forex" },
  { sym:"EURCAD=X",name:"EUR/CAD",cat:"Forex" },{ sym:"EURAUD=X",name:"EUR/AUD",cat:"Forex" },
  { sym:"EURNZD=X",name:"EUR/NZD",cat:"Forex" },{ sym:"CADJPY=X",name:"CAD/JPY",cat:"Forex" },
  { sym:"AUDCAD=X",name:"AUD/CAD",cat:"Forex" },{ sym:"AUDNZD=X",name:"AUD/NZD",cat:"Forex" },
  { sym:"AUDCHF=X",name:"AUD/CHF",cat:"Forex" },{ sym:"NZDJPY=X",name:"NZD/JPY",cat:"Forex" },
  { sym:"NZDCAD=X",name:"NZD/CAD",cat:"Forex" },{ sym:"CHFJPY=X",name:"CHF/JPY",cat:"Forex" },
  { sym:"CADCHF=X",name:"CAD/CHF",cat:"Forex" },{ sym:"NZDCHF=X",name:"NZD/CHF",cat:"Forex" },
  // Crypto
  { sym:"BTC-USD",name:"Bitcoin",cat:"Crypto" },{ sym:"ETH-USD",name:"Ethereum",cat:"Crypto" },
  { sym:"SOL-USD",name:"Solana",cat:"Crypto"  },{ sym:"XRP-USD",name:"XRP",cat:"Crypto" },
  { sym:"BNB-USD",name:"BNB",cat:"Crypto"     },{ sym:"DOGE-USD",name:"Dogecoin",cat:"Crypto" },
  { sym:"ADA-USD",name:"Cardano",cat:"Crypto" },{ sym:"LINK-USD",name:"Chainlink",cat:"Crypto" },
  { sym:"AVAX-USD",name:"Avalanche",cat:"Crypto" },{ sym:"DOT-USD",name:"Polkadot",cat:"Crypto" },
  // Commodities
  { sym:"GC=F",name:"Gold",cat:"Comm" },{ sym:"SI=F",name:"Silver ⭐",cat:"Comm" },
  { sym:"HG=F",name:"Copper ⭐",cat:"Comm" },{ sym:"PL=F",name:"Platinum",cat:"Comm" },
  // Nasdaq 100 Stocks
  { sym:"NVDA",name:"Nvidia",cat:"Stock" },{ sym:"AAPL",name:"Apple",cat:"Stock" },
  { sym:"MSFT",name:"Microsoft",cat:"Stock" },{ sym:"AMZN",name:"Amazon",cat:"Stock" },
  { sym:"GOOGL",name:"Alphabet A",cat:"Stock" },{ sym:"GOOG",name:"Alphabet C",cat:"Stock" },
  { sym:"AVGO",name:"Broadcom",cat:"Stock" },{ sym:"META",name:"Meta",cat:"Stock" },
  { sym:"TSLA",name:"Tesla",cat:"Stock" },{ sym:"MU",name:"Micron",cat:"Stock" },
  { sym:"WMT",name:"Walmart",cat:"Stock" },{ sym:"AMD",name:"AMD",cat:"Stock" },
  { sym:"ASML",name:"ASML",cat:"Stock" },{ sym:"INTC",name:"Intel",cat:"Stock" },
  { sym:"CSCO",name:"Cisco",cat:"Stock" },{ sym:"AMAT",name:"Applied Materials",cat:"Stock" },
  { sym:"COST",name:"Costco",cat:"Stock" },{ sym:"LRCX",name:"Lam Research",cat:"Stock" },
  { sym:"PLTR",name:"Palantir",cat:"Stock" },{ sym:"ARM",name:"ARM Holdings",cat:"Stock" },
  { sym:"NFLX",name:"Netflix",cat:"Stock" },{ sym:"PANW",name:"Palo Alto",cat:"Stock" },
  { sym:"KLAC",name:"KLA Corp",cat:"Stock" },{ sym:"TXN",name:"Texas Instruments",cat:"Stock" },
  { sym:"LIN",name:"Linde",cat:"Stock" },{ sym:"TMUS",name:"T-Mobile",cat:"Stock" },
  { sym:"CRWD",name:"CrowdStrike",cat:"Stock" },{ sym:"AMGN",name:"Amgen",cat:"Stock" },
  { sym:"PEP",name:"PepsiCo",cat:"Stock" },{ sym:"STX",name:"Seagate",cat:"Stock" },
  { sym:"ADI",name:"Analog Devices",cat:"Stock" },{ sym:"QCOM",name:"Qualcomm",cat:"Stock" },
  { sym:"MRVL",name:"Marvell",cat:"Stock" },{ sym:"WDC",name:"Western Digital",cat:"Stock" },
  { sym:"GILD",name:"Gilead",cat:"Stock" },{ sym:"SHOP",name:"Shopify",cat:"Stock" },
  { sym:"APP",name:"AppLovin",cat:"Stock" },{ sym:"BKNG",name:"Booking",cat:"Stock" },
  { sym:"ISRG",name:"Intuitive Surgical",cat:"Stock" },{ sym:"PDD",name:"PDD Holdings",cat:"Stock" },
  { sym:"VRTX",name:"Vertex Pharma",cat:"Stock" },{ sym:"SBUX",name:"Starbucks",cat:"Stock" },
  { sym:"FTNT",name:"Fortinet",cat:"Stock" },{ sym:"ADP",name:"ADP",cat:"Stock" },
  { sym:"MAR",name:"Marriott",cat:"Stock" },{ sym:"DDOG",name:"Datadog",cat:"Stock" },
  { sym:"MNST",name:"Monster",cat:"Stock" },{ sym:"ADBE",name:"Adobe",cat:"Stock" },
  { sym:"CSX",name:"CSX Corp",cat:"Stock" },{ sym:"MELI",name:"MercadoLibre",cat:"Stock" },
  { sym:"CDNS",name:"Cadence",cat:"Stock" },{ sym:"CEG",name:"Constellation Energy",cat:"Stock" },
  { sym:"ABNB",name:"Airbnb",cat:"Stock" },{ sym:"CMCSA",name:"Comcast",cat:"Stock" },
  { sym:"DASH",name:"DoorDash",cat:"Stock" },{ sym:"CTAS",name:"Cintas",cat:"Stock" },
  { sym:"INTU",name:"Intuit",cat:"Stock" },{ sym:"MDLZ",name:"Mondelez",cat:"Stock" },
  { sym:"ROST",name:"Ross Stores",cat:"Stock" },{ sym:"SNPS",name:"Synopsys",cat:"Stock" },
  { sym:"HON",name:"Honeywell",cat:"Stock" },{ sym:"AEP",name:"American Electric",cat:"Stock" },
  { sym:"REGN",name:"Regeneron",cat:"Stock" },{ sym:"ORLY",name:"OReilly Auto",cat:"Stock" },
  { sym:"NXPI",name:"NXP Semi",cat:"Stock" },{ sym:"PCAR",name:"Paccar",cat:"Stock" },
  { sym:"MPWR",name:"Monolithic Power",cat:"Stock" },{ sym:"WBD",name:"Warner Bros",cat:"Stock" },
  { sym:"FANG",name:"Diamondback Energy",cat:"Stock" },{ sym:"BKR",name:"Baker Hughes",cat:"Stock" },
  { sym:"EA",name:"Electronic Arts",cat:"Stock" },{ sym:"TER",name:"Teradyne",cat:"Stock" },
  { sym:"FAST",name:"Fastenal",cat:"Stock" },{ sym:"PYPL",name:"PayPal",cat:"Stock" },
  { sym:"XEL",name:"Xcel Energy",cat:"Stock" },{ sym:"ODFL",name:"Old Dominion",cat:"Stock" },
  { sym:"EXC",name:"Exelon",cat:"Stock" },{ sym:"CCEP",name:"Coca-Cola EP",cat:"Stock" },
  { sym:"ADSK",name:"Autodesk",cat:"Stock" },{ sym:"IDXX",name:"IDEXX Labs",cat:"Stock" },
  { sym:"TTWO",name:"Take-Two",cat:"Stock" },{ sym:"MCHP",name:"Microchip Tech",cat:"Stock" },
  { sym:"AXON",name:"Axon Enterprise",cat:"Stock" },{ sym:"KDP",name:"Keurig Dr Pepper",cat:"Stock" },
  { sym:"PAYX",name:"Paychex",cat:"Stock" },{ sym:"ROP",name:"Roper Tech",cat:"Stock" },
  { sym:"ALNY",name:"Alnylam",cat:"Stock" },{ sym:"WDAY",name:"Workday",cat:"Stock" },
  { sym:"KHC",name:"Kraft Heinz",cat:"Stock" },{ sym:"DXCM",name:"DexCom",cat:"Stock" },
  { sym:"GEHC",name:"GE Healthcare",cat:"Stock" },{ sym:"CPRT",name:"Copart",cat:"Stock" },
  // Indices
  { sym:"^GSPC",name:"S&P 500",cat:"Index" },
  { sym:"^NDX",name:"Nasdaq 100",cat:"Index" },
  { sym:"^RUT",name:"Russell 2000",cat:"Index" },
];

const NAME: Record<string,string> = Object.fromEntries(ASSETS.map(a=>[a.sym,a.name]));
const CAT:  Record<string,string> = Object.fromEntries(ASSETS.map(a=>[a.sym,a.cat]));

// ── Strategy definitions (for dashboard modules) ───────────────
const STRATEGIES = [
  { key:"atr_stretch",  name:"ATR Stretch",     oosPF:2.48, winRate:55, color:"#f97316", rr:"1:2 (SL:2ATR, TP:SMA50)" },
  { key:"bb_reversion", name:"BB Reversion",     oosPF:3.53, winRate:64, color:"#a78bfa", rr:"1:2 (SL:2ATR, TP:BB mid)" },
  { key:"rsi2_mean_rev",name:"RSI(2) Mean Rev",  oosPF:9.36, winRate:82, color:"#22c55e", rr:"Exit RSI>70/<30" },
  { key:"zscore",       name:"Z-Score ±2",        oosPF:5.33, winRate:73, color:"#60a5fa", rr:"1:2 (SL:2ATR, TP:SMA20)" },
  { key:"ma_reversion", name:"MA Reversion",      oosPF:2.91, winRate:59, color:"#fbbf24", rr:"1:2 (SL:2ATR, TP:SMA20)" },
];
const STRAT_COLOR: Record<string,string> = Object.fromEntries(STRATEGIES.map(s=>[s.name, s.color]));
const CAT_COLOR: Record<string,string> = {
  Forex:"#60a5fa", Crypto:"#f97316", Comm:"#fbbf24", Stock:"#22c55e", Index:"#a78bfa",
};

// ── price formatter ────────────────────────────────────────────
const price = (v: any): string => {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  const a = Math.abs(v);
  return v.toFixed(a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : 5);
};

// ══════════════════════════════════════════════════════════════
//  COMPONENT: Strategy Dashboard Module
//  Shows one strategy's stats + today's signals across all assets
// ══════════════════════════════════════════════════════════════
function StratModule({ strat, rows, onTakeTrade }: {
  strat: typeof STRATEGIES[0];
  rows: ScreenerRow[];
  onTakeTrade: (sym: string, sig: Signal) => void;
}) {
  const signals = rows.flatMap(r =>
    r.signals.filter(s => s.stratKey === strat.key).map(s => ({ ...s, sym: r.symbol }))
  );
  const longs  = signals.filter(s => s.dir === "LONG");
  const shorts = signals.filter(s => s.dir === "SHORT");

  return (
    <div style={{
      background:"#0a0f18", border:`1px solid ${strat.color}33`,
      borderRadius:12, padding:"16px 18px", marginBottom:14,
    }}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:strat.color,display:"inline-block"}} />
            <span style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{strat.name}</span>
            <span style={{
              fontSize:10,padding:"1px 7px",borderRadius:10,
              background:`${strat.color}22`,color:strat.color,border:`1px solid ${strat.color}44`,fontWeight:600,
            }}>TIER 1</span>
          </div>
          <div style={{fontSize:11,color:"#64748b",fontFamily:"monospace"}}>
            Range regime only · ADX&lt;25 · SMA flat · {strat.rr}
          </div>
        </div>
        <div style={{display:"flex",gap:16,fontFamily:"monospace"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:700,color:strat.color}}>{strat.oosPF}</div>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase"}}>OOS PF</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:700,color:"#c9d3df"}}>{strat.winRate}%</div>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase"}}>Win Rate</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:700,color:signals.length>0?"#22c55e":"#475569"}}>{signals.length}</div>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase"}}>Signals</div>
          </div>
        </div>
      </div>

      {signals.length === 0 && (
        <div style={{fontSize:12,color:"#334155",fontStyle:"italic",padding:"6px 0"}}>
          No signals today — market not in range regime or no asset at extreme
        </div>
      )}

      {/* Signal cards */}
      {signals.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
          {signals.map((sig,i) => (
            <div key={i} style={{
              background: sig.dir==="LONG"?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)",
              border:`1px solid ${sig.dir==="LONG"?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,
              borderRadius:8, padding:"10px 12px",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13,color:"#e2e8f0"}}>{NAME[sig.sym]||sig.sym}</span>
                  <span style={{
                    fontSize:9,marginLeft:6,padding:"1px 5px",borderRadius:4,
                    background:CAT_COLOR[CAT[sig.sym]||""]+"22",color:CAT_COLOR[CAT[sig.sym]||""]||"#64748b",
                    fontWeight:600,
                  }}>{CAT[sig.sym]||""}</span>
                </div>
                <span style={{
                  fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,
                  background:sig.dir==="LONG"?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)",
                  color:sig.dir==="LONG"?"#22c55e":"#ef4444",
                }}>{sig.dir}</span>
              </div>

              {/* Price levels */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:6}}>
                {[
                  {label:"Entry", val:sig.entry, color:"#c9d3df"},
                  {label:"Stop",  val:sig.stop,  color:"#ef4444"},
                  {label:"Target",val:sig.target,color:"#22c55e"},
                ].map(p=>(
                  <div key={p.label} style={{textAlign:"center",background:"#111827",borderRadius:5,padding:"4px 2px"}}>
                    <div style={{fontSize:9,color:"#475569",textTransform:"uppercase"}}>{p.label}</div>
                    <div style={{fontSize:11,fontWeight:600,color:p.color,fontFamily:"monospace"}}>{price(p.val)}</div>
                  </div>
                ))}
              </div>

              <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>{sig.note}</div>

              <button
                onClick={() => onTakeTrade(sig.sym, sig)}
                style={{
                  width:"100%",padding:"5px",borderRadius:6,border:"none",cursor:"pointer",
                  background:`${sig.dir==="LONG"?"#22c55e":"#ef4444"}22`,
                  color:sig.dir==="LONG"?"#22c55e":"#ef4444",
                  fontSize:11,fontWeight:600,
                }}
              >
                🎯 Take this trade
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  COMPONENT: COT Dashboard
// ══════════════════════════════════════════════════════════════
const COT_SYMS = [
  "EURUSD=X","GBPUSD=X","USDJPY=X","AUDUSD=X","USDCAD=X","USDCHF=X","NZDUSD=X",
  "GC=F","SI=F","CL=F","HG=F","PL=F","BTC-USD","ETH-USD","^GSPC","^NDX","^RUT",
];

function CotDashboard() {
  const [cotData, setCotData] = useState<any[]>([]);
  const [busy, setBusy]  = useState(false);
  const [ran, setRan]    = useState(false);

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
    return (ai <= 20 ? ai : ai >= 80 ? 200 - ai : 100) - (bi <= 20 ? bi : bi >= 80 ? 200 - bi : 100);
  });
  const failed = cotData.filter(d => !hasData(d) && d.symbol);

  const groups = [
    { key:"commercials", emoji:"🏭", label:"Commercials",       color:"#fbbf24" },
    { key:"largSpec",    emoji:"🏦", label:"Large Speculators", color:"#a78bfa" },
    { key:"smallSpec",   emoji:"👤", label:"Small Spec",        color:"#60a5fa" },
  ];

  return (
    <section style={{padding:"16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14}}>
        <button
          onClick={load} disabled={busy}
          style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:busy?"not-allowed":"pointer",
            background:"#1d4ed8",color:"#fff",fontWeight:700,fontSize:13,opacity:busy?0.7:1}}
        >
          {busy?"⏳ Loading…":"📡 Load COT Data"}
        </button>
        {ran && <span style={{fontSize:11,color:"#64748b"}}>CFTC · 52-week · Weekly update</span>}
      </div>
      {ran && (
        <div style={{display:"flex",gap:16,marginBottom:14,fontSize:11,flexWrap:"wrap"}}>
          <span style={{color:"#10b981"}}>🟢 SHORT-crowded (0–20%) → contrarian LONG</span>
          <span style={{color:"#94a3b8"}}>🟡 Neutral (21–79%)</span>
          <span style={{color:"#ef4444"}}>🔴 LONG-crowded (80–100%) → contrarian SHORT</span>
        </div>
      )}
      {!ran && !busy && (
        <div style={{color:"#475569",fontSize:13,padding:"20px 0"}}>
          📡 Load COT Data dabao — Commercials, Large Spec, Small Spec teeno ek card mein dikhenge
        </div>
      )}
      {validData.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:12}}>
          {validData.map((d,i) => {
            const com=d.commercials, ls=d.largSpec, sm=d.smallSpec;
            const strong = com && ls && ((com.index<=20&&ls.index>=80)||(com.index>=80&&ls.index<=20));
            const bdrCol = strong ? (com.index>=80?"#10b981":"#ef4444") : "rgba(148,163,184,0.15)";
            return (
              <div key={i} style={{background:"#0a0f18",border:`1px solid ${bdrCol}`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{NAME[d.symbol]||d.symbol}</span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {strong && (
                      <span style={{fontSize:9,fontWeight:700,color:bdrCol,border:`1px solid ${bdrCol}`,borderRadius:4,padding:"1px 5px"}}>
                        ⚡ SIGNAL
                      </span>
                    )}
                    <span style={{fontSize:10,color:CAT_COLOR[CAT[d.symbol]||""]||"#64748b",fontWeight:600}}>{CAT[d.symbol]||""}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {groups.map(g => {
                    const grp = d[g.key]; if(!grp)return null;
                    const idx=grp.index??50, net=grp.net??0, col=biasColor(idx);
                    return (
                      <div key={g.key} style={{
                        display:"grid",gridTemplateColumns:"140px 1fr 70px",alignItems:"center",gap:8,
                        padding:"5px 8px",background:"rgba(255,255,255,0.025)",borderRadius:6,
                        border:`1px solid ${idx>=80||idx<=20?col+"33":"rgba(148,163,184,0.07)"}`,
                      }}>
                        <span style={{fontSize:11.5,color:g.color}}>{g.emoji} {g.label}</span>
                        <span style={{fontFamily:"monospace",fontSize:11,color:"#64748b"}}>
                          NET <b style={{color:net>0?"#22c55e":"#ef4444"}}>{net>0?"+":""}{net.toLocaleString()}</b>
                        </span>
                        <span style={{textAlign:"right",fontSize:11.5,fontWeight:700,color:col}}>{biasEmoji(idx)} {idx}%</span>
                      </div>
                    );
                  })}
                </div>
                {strong && com && ls && (
                  <div style={{
                    marginTop:8,fontSize:10.5,padding:"4px 8px",borderRadius:5,
                    background:com.index>=80?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.08)",
                    color:com.index>=80?"#10b981":"#ef4444",
                    border:`1px solid ${com.index>=80?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.2)"}`,
                  }}>
                    {com.index>=80
                      ?"🟢 Commercials LONG + Large Spec SHORT → Reversal UP possible"
                      :"🔴 Commercials SHORT + Large Spec LONG → Reversal DOWN possible"}
                  </div>
                )}
                {d.weeks && <div style={{fontSize:9,color:"#334155",marginTop:6,textAlign:"right"}}>{d.weeks}w data</div>}
              </div>
            );
          })}
        </div>
      )}
      {failed.length>0 && ran && (
        <div style={{marginTop:10,fontSize:10.5,color:"#374151"}}>
          {failed.length} assets ka data nahi mila (CFTC futures only)
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════
//  COMPONENT: Playback
// ══════════════════════════════════════════════════════════════
function Playback() {
  const [from, setFrom]   = useState("2024-01-01");
  const [frames, setFrames] = useState<any[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy]   = useState(false);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<any>(null);
  const allSyms = ASSETS.map(a => a.sym);

  async function load() {
    setBusy(true); setFrames([]); setCursor(0); setPlaying(false);
    clearInterval(timerRef.current);
    const r = await fetch(`/api/playback?symbols=${allSyms.join(",")}&from=${from}&days=60`);
    const d = await r.json();
    setFrames(d.frames || []);
    setBusy(false);
  }

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setCursor(c => {
          if (c >= frames.length - 1) { setPlaying(false); clearInterval(timerRef.current); return c; }
          return c + 1;
        });
      }, 1200);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [playing, frames.length]);

  const frame = frames[cursor];

  return (
    <section style={{padding:"16px 0"}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:16}}>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          style={{padding:"7px 10px",borderRadius:7,background:"#111827",border:"1px solid #1f2937",color:"#c9d3df",fontSize:13}}/>
        <button onClick={load} disabled={busy}
          style={{padding:"7px 16px",borderRadius:7,border:"none",background:"#1d4ed8",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {busy?"Loading…":"Load"}
        </button>
        {frames.length > 0 && (
          <>
            <button onClick={()=>setCursor(c=>Math.max(0,c-1))} style={pbBtn}>◀</button>
            <button onClick={()=>setPlaying(p=>!p)} style={{...pbBtn,background:playing?"#7c3aed":"#15803d"}}>
              {playing?"⏸ Pause":"▶ Play"}
            </button>
            <button onClick={()=>setCursor(c=>Math.min(frames.length-1,c+1))} style={pbBtn}>▶</button>
            <span style={{fontSize:12,color:"#64748b",fontFamily:"monospace"}}>
              {cursor+1} / {frames.length} — {frame?.date}
            </span>
          </>
        )}
      </div>
      {frames.length > 0 && (
        <input type="range" min={0} max={frames.length-1} value={cursor}
          onChange={e=>setCursor(+e.target.value)}
          style={{width:"100%",marginBottom:14,accentColor:"#1d4ed8"}}/>
      )}
      {frame && (
        <div>
          <div style={{fontSize:13,color:"#475569",marginBottom:10}}>
            {frame.date} — <b style={{color:"#e2e8f0"}}>{frame.signals?.length}</b> signals
          </div>
          {frame.signals?.length === 0 && (
            <div style={{color:"#334155",fontSize:12,fontStyle:"italic"}}>
              No signals — market in trend regime or no extremes today
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
            {frame.signals?.map((sig: any,i: number) => (
              <div key={i} style={{
                background:sig.dir==="LONG"?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)",
                border:`1px solid ${sig.dir==="LONG"?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)"}`,
                borderRadius:8,padding:"10px 12px",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#e2e8f0"}}>{NAME[sig.symbol]||sig.symbol}</span>
                  <span style={{
                    fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5,
                    background:sig.dir==="LONG"?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)",
                    color:sig.dir==="LONG"?"#22c55e":"#ef4444",
                  }}>{sig.dir}</span>
                </div>
                <div style={{fontSize:11,color:STRAT_COLOR[sig.strategy]||"#60a5fa",marginBottom:4,fontWeight:600}}>
                  {sig.strategy}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:3,fontFamily:"monospace",fontSize:10,color:"#64748b"}}>
                  <div>E: <b style={{color:"#c9d3df"}}>{price(sig.entry)}</b></div>
                  <div>SL: <b style={{color:"#ef4444"}}>{price(sig.stop)}</b></div>
                  <div>TP: <b style={{color:"#22c55e"}}>{price(sig.target)}</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
const pbBtn: any = {padding:"5px 12px",borderRadius:7,border:"none",background:"#1f2937",color:"#c9d3df",cursor:"pointer",fontSize:13};

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]       = useState<"screener"|"playback"|"cot"|"journal">("screener");
  const [rows, setRows]     = useState<ScreenerRow[]>([]);
  const [busy, setBusy]     = useState(false);
  const [ran, setRan]       = useState(false);
  const [startDate, setStartDate] = useState("2021-01-01");
  const [catFilter, setCatFilter] = useState<string>("All");
  const [stratFilter, setStratFilter] = useState<string>("All");
  const [searchQ, setSearchQ] = useState("");
  const [tradeModal, setTradeModal] = useState<{sym:string;sig:Signal}|null>(null);
  const allSyms = ASSETS.map(a => a.sym);

  async function runScreener() {
    setBusy(true); setRows([]); setRan(false);
    const r = await fetch(`/api/screener?symbols=${allSyms.join(",")}&start=${startDate}`);
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setBusy(false); setRan(true);
  }

  // How many assets are in range regime today
  const rangeCount = rows.filter(r => r.regime === "range").length;
  const signalCount = rows.filter(r => r.signals?.length > 0).length;

  // Filter rows for screener view
  const filteredRows = rows.filter(r => {
    const cat  = CAT[r.symbol] || "";
    const name = (NAME[r.symbol] || r.symbol).toLowerCase();
    const sym  = r.symbol.toLowerCase();
    if (catFilter !== "All" && cat !== catFilter) return false;
    if (searchQ && !name.includes(searchQ.toLowerCase()) && !sym.includes(searchQ.toLowerCase())) return false;
    return true;
  });

  // Take trade handler
  function handleTakeTrade(sym: string, sig: Signal) {
    setTradeModal({ sym, sig });
  }

  const tabs = [
    { id:"screener", label:"📊 Strategies" },
    { id:"playback", label:"⏪ Playback" },
    { id:"cot",      label:"📡 COT" },
    { id:"journal",  label:"📒 My Trades" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#060a12", color:"#c9d3df", fontFamily:"Inter,system-ui,sans-serif" }}>

      {/* Header */}
      <header style={{
        background:"#070b14", borderBottom:"1px solid #0d1422",
        padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52,
      }}>
        <div>
          <span style={{fontWeight:800,fontSize:16,color:"#e2e8f0",letterSpacing:"-0.3px"}}>quant</span>
          <span style={{fontWeight:800,fontSize:16,color:"#1d4ed8"}}>.</span>
          <span style={{fontWeight:800,fontSize:16,color:"#e2e8f0",letterSpacing:"-0.3px"}}>desk</span>
          <span style={{fontSize:10,color:"#334155",marginLeft:10,fontFamily:"monospace"}}>Daily · 10yr Backtested</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {STRATEGIES.map(s => (
            <span key={s.key} style={{
              fontSize:10,padding:"2px 8px",borderRadius:6,
              background:`${s.color}18`,color:s.color,border:`1px solid ${s.color}33`,fontWeight:600,
            }}>{s.name} <span style={{opacity:0.7}}>PF {s.oosPF}</span></span>
          ))}
        </div>
      </header>

      {/* Tabs */}
      <nav style={{background:"#070b14",borderBottom:"1px solid #0d1422",padding:"0 24px",display:"flex",gap:2}}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{
            padding:"12px 16px",border:"none",background:"none",cursor:"pointer",
            color: tab===t.id?"#e2e8f0":"#475569",
            fontSize:13,fontWeight:tab===t.id?700:400,
            borderBottom:tab===t.id?"2px solid #1d4ed8":"2px solid transparent",
          }}>{t.label}</button>
        ))}
      </nav>

      <main style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>

        {/* ── SCREENER TAB ── */}
        {tab === "screener" && (
          <div>
            {/* Controls */}
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#0a0f18",border:"1px solid #1f2937",borderRadius:8,padding:"6px 12px"}}>
                <span style={{fontSize:12,color:"#64748b"}}>Start</span>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
                  style={{background:"none",border:"none",color:"#c9d3df",fontSize:13,cursor:"pointer"}}/>
              </div>
              <button onClick={runScreener} disabled={busy} style={{
                padding:"8px 20px",borderRadius:8,border:"none",cursor:busy?"not-allowed":"pointer",
                background:busy?"#1a2438":"#1d4ed8",color:"#fff",fontWeight:700,fontSize:13,opacity:busy?0.7:1,
              }}>
                {busy?"⏳ Scanning…":"▶ Run Screener"}
              </button>
              {/* Search */}
              <input placeholder="Search asset…" value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                style={{padding:"7px 12px",borderRadius:8,background:"#0a0f18",border:"1px solid #1f2937",color:"#c9d3df",fontSize:13,width:160}}/>
              {/* Category filter */}
              {["All","Forex","Crypto","Comm","Stock","Index"].map(c => (
                <button key={c} onClick={()=>setCatFilter(c)} style={{
                  padding:"5px 12px",borderRadius:6,border:`1px solid ${catFilter===c?"#1d4ed8":"#1f2937"}`,
                  background:catFilter===c?"rgba(29,78,216,0.2)":"transparent",
                  color:catFilter===c?"#60a5fa":"#64748b",fontSize:12,cursor:"pointer",fontWeight:catFilter===c?700:400,
                }}>{c}</button>
              ))}
            </div>

            {/* Stats bar */}
            {ran && (
              <div style={{display:"flex",gap:16,marginBottom:18,padding:"10px 16px",background:"#0a0f18",borderRadius:8,border:"1px solid #0d1422",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#475569"}}>
                  📊 <b style={{color:"#c9d3df"}}>{rows.length}</b> assets scanned
                </span>
                <span style={{fontSize:12,color:"#475569"}}>
                  🟡 <b style={{color:"#fbbf24"}}>{rangeCount}</b> in range regime (ADX&lt;25)
                </span>
                <span style={{fontSize:12,color:"#475569"}}>
                  ⚡ <b style={{color:"#22c55e"}}>{signalCount}</b> with signals today
                </span>
              </div>
            )}

            {!ran && !busy && (
              <div style={{textAlign:"center",padding:"60px 20px",color:"#334155"}}>
                <div style={{fontSize:36,marginBottom:12}}>📊</div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>5 Tier 1 Mean Reversion Strategies</div>
                <div style={{fontSize:12,color:"#1e293b"}}>
                  ATR Stretch · BB Reversion · RSI(2) · Z-Score ±2 · MA Reversion<br/>
                  Range regime only · ADX&lt;25 · SMA slope flat
                </div>
              </div>
            )}

            {/* 5 Strategy modules */}
            {ran && STRATEGIES.map(strat => (
              <StratModule
                key={strat.key}
                strat={strat}
                rows={filteredRows}
                onTakeTrade={handleTakeTrade}
              />
            ))}

            {/* Regime info */}
            {ran && (
              <div style={{marginTop:8,padding:"10px 14px",background:"#070b14",borderRadius:8,border:"1px solid #0d1422"}}>
                <div style={{fontSize:11,color:"#334155"}}>
                  ℹ️ Regime filter: <span style={{color:"#475569"}}>ADX(14) &lt; 25 AND SMA20 slope flat (&lt;0.05%) → Range mode → Mean reversion works</span>
                </div>
                <div style={{fontSize:11,color:"#334155",marginTop:4}}>
                  ⚠️ No signals = either ADX &gt; 25 (trending) or no asset at price extreme today — wait for setup
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "playback" && <Playback />}
        {tab === "cot"      && <CotDashboard />}
        {tab === "journal"  && <MyTrades />}
      </main>

      {/* Take Trade Modal */}
      {tradeModal && (
        <TakeTradeModal
          sym={tradeModal.sym}
          sig={tradeModal.sig}
          onClose={() => setTradeModal(null)}
        />
      )}

      <footer style={{textAlign:"center",padding:"20px",fontSize:11,color:"#1e293b",borderTop:"1px solid #0d1422"}}>
        Quant Desk — educational tool. Not financial advice. Always use stop-loss. Risk only what you can afford to lose.
      </footer>
    </div>
  );
}

// ── Take Trade Modal ──────────────────────────────────────────
function TakeTradeModal({ sym, sig, onClose }: { sym: string; sig: Signal; onClose: () => void; }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);

  async function save() {
    if (sig.stop === null) return;
    setSaving(true);
    await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: sym, name: NAME[sym] || sym,
        direction: sig.dir,
        strategyLabel: sig.strategy,
        stop:   sig.stop,
        target: sig.target ?? (sig.dir === "LONG"
          ? (sig.entry ?? 0) + 2 * Math.abs((sig.entry ?? 0) - sig.stop)
          : (sig.entry ?? 0) - 2 * Math.abs((sig.entry ?? 0) - sig.stop)),
      }),
    });
    setSaving(false); setDone(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:999,padding:20,
    }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0a0f18",border:"1px solid #1f2937",borderRadius:14,padding:24,minWidth:320,maxWidth:440,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:15,color:"#e2e8f0"}}>
            {sig.dir === "LONG" ? "🟢" : "🔴"} {NAME[sym]||sym} — {sig.dir}
          </h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#60a5fa",marginBottom:12,fontWeight:600}}>{sig.strategy}</div>
        <div style={{fontSize:11,color:"#64748b",marginBottom:16}}>{sig.note}</div>
        {[
          {label:"Entry",  val:sig.entry,  color:"#c9d3df"},
          {label:"Stop",   val:sig.stop,   color:"#ef4444"},
          {label:"Target", val:sig.target, color:"#22c55e"},
          {label:"OOS PF", val:sig.oosPF,  color:"#a78bfa", noPrice:true},
          {label:"Win Rate",val:`${sig.winRate}%`,color:"#fbbf24", noPrice:true},
          {label:"RR",     val:sig.rr,     color:"#c9d3df", noPrice:true},
        ].map(f=>(
          <div key={f.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #0d1422"}}>
            <span style={{fontSize:12,color:"#475569"}}>{f.label}</span>
            <span style={{fontSize:12,fontWeight:600,color:f.color,fontFamily:"monospace"}}>
              {f.noPrice ? f.val : price(f.val as number)}
            </span>
          </div>
        ))}
        {sig.stop === null && (
          <div style={{fontSize:11,color:"#fbbf24",marginTop:10,padding:"6px 10px",background:"rgba(251,191,36,0.08)",borderRadius:6}}>
            ⚠️ RSI(2) strategy: exit when RSI(2) crosses 70 (LONG) or 30 (SHORT) — no fixed TP
          </div>
        )}
        <button
          onClick={save} disabled={saving||done}
          style={{
            width:"100%",marginTop:16,padding:"10px",borderRadius:8,border:"none",cursor:"pointer",
            background: done ? "#15803d" : sig.dir==="LONG" ? "#15803d" : "#991b1b",
            color:"#fff",fontWeight:700,fontSize:13,
          }}
        >
          {done ? "✅ Saved to Journal!" : saving ? "Saving…" : "🎯 Add to Journal"}
        </button>
      </div>
    </div>
  );
}

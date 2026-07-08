import React, { useEffect, useMemo, useState } from "react";

export interface JournalTrade {
  id: string;
  symbol: string;
  name?: string;
  direction: "LONG" | "SHORT";
  strategyLabel?: string;
  module?: string;
  takenAt: string;
  takenAsOf?: string;
  entryDate: string | null;
  entryPrice: number | null;
  stopPrice: number;
  targetPrice: number;
  status: "PENDING" | "OPEN" | "SL_HIT" | "TARGET_HIT" | "CLOSED_MANUAL";
  exitPrice?: number;
  exitDate?: string;
  returnPct?: number;
  currentPrice?: number;
  unrealizedPct?: number;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: "PENDING ⏳", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  OPEN: { label: "OPEN", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  TARGET_HIT: { label: "TARGET HIT ✓", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  SL_HIT: { label: "SL HIT ✗", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  CLOSED_MANUAL: { label: "MANUAL EXIT", color: "#60a5fa", bg: "rgba(59,130,246,0.12)" },
};

const box: React.CSSProperties = { padding: "12px 14px", borderRadius: "10px", background: "#0f141c", border: "1px solid #212836", marginBottom: "14px" };
const th: React.CSSProperties = { padding: "6px 10px", textAlign: "left", color: "#8e9ba9", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" };
const td: React.CSSProperties = { padding: "7px 10px", fontFamily: "monospace", fontSize: "12.5px", borderTop: "1px solid #1b2230" };
const btn: React.CSSProperties = { background: "#151b27", border: "1px solid #2a3342", color: "#c9d3df", borderRadius: "6px", padding: "3px 9px", fontSize: "11px", cursor: "pointer", fontFamily: "monospace" };

const fmtPct = (v?: number) => (typeof v === "number" && isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
const px = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : "—");

export function MyTrades({
  onCountChange, mode = "live", asOfDate, startDate, nameMap = {},
}: {
  onCountChange?: (n: number) => void;
  mode?: "live" | "playback";
  asOfDate?: string;
  startDate?: string;
  nameMap?: Record<string, string>;
  key?: string;
}) {
  const isPb = mode === "playback";
  const base = isPb ? "/api/playback/trades" : "/api/trades";
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null); // inline delete confirm (iframe-safe)

  const disp = (t: JournalTrade) => nameMap[t.symbol] || t.name || t.symbol;

  const setAll = (list: JournalTrade[]) => {
    setTrades(list);
    if (onCountChange) onCountChange(list.length);
  };

  const load = async () => {
    try {
      const r = await fetch(`${base}?t=${Date.now()}`);
      const d = await r.json();
      setAll(Array.isArray(d.trades) ? d.trades : []);
    } catch {
      setMsg("❌ Journal load nahi hua — server chal raha hai?");
    } finally {
      setLoading(false);
    }
  };

  const checkPrices = async (silent = false) => {
    setChecking(true);
    if (!silent) setMsg("🔄 Real daily candles se SL/target check ho raha hai…");
    try {
      const r = await fetch(`${base}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPb ? { asOfDate, start: startDate } : { start: startDate }),
      });
      const d = await r.json();
      if (d.ok) {
        setAll(Array.isArray(d.trades) ? d.trades : []);
        const fail = d.failedSymbols?.length ? ` (${d.failedSymbols.join(", ")} ka data nahi mila)` : "";
        setMsg(d.updated > 0 ? `✅ ${d.updated} trade(s) close hue is check mein${fail}` : silent ? "" : `✅ Prices updated — koi SL/target hit nahi hua${fail}`);
      }
    } catch {
      setMsg("❌ Price check fail — network dekho");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // auto-check on open; in playback, RE-check every time the virtual date moves
    load().then(() => checkPrices(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPb ? asOfDate : "live"]);

  const manualClose = async (t: JournalTrade) => {
    // playback: exit at the virtual day's close (server decides price — no prompt needed)
    if (isPb) {
      const r = await fetch(`${base}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, asOfDate }) });
      const d = await r.json();
      if (d.ok) { setMsg(`✅ ${disp(t)} closed @ ${d.trade.exitPrice} (${asOfDate} close)`); load(); } else setMsg(`❌ ${d.error}`);
      return;
    }
    // live: exit at the latest known price (currentPrice). window.prompt iframe me block ho jata hai,
    // isliye ab current market price pe hi manual-close hota hai.
    const p = Number(t.currentPrice ?? t.entryPrice ?? 0);
    if (!isFinite(p) || p <= 0) { setMsg("❌ Current price nahi mila — pehle 'Check SL / Target now' dabao"); return; }
    const r = await fetch(`${base}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, exitPrice: p }) });
    const d = await r.json();
    if (d.ok) { setMsg(`✅ ${disp(t)} closed @ ${p} (latest price)`); load(); } else setMsg(`❌ ${d.error}`);
  };

  // Two-tap delete: first tap arms (button turns into "Confirm?"), second tap deletes.
  // window.confirm iframe/AI-Studio sandbox me block ho jata hai, isliye inline confirm.
  const remove = async (t: JournalTrade) => {
    if (confirmId !== t.id) { setConfirmId(t.id); setMsg("⚠️ Delete confirm karne ke liye dobara ✕ dabao"); return; }
    setConfirmId(null);
    const r = await fetch(`${base}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) });
    const d = await r.json();
    if (d.ok) { setAll(Array.isArray(d.trades) ? d.trades : []); setMsg(`🗑 ${disp(t)} journal se hata diya`); } else setMsg(`❌ ${d.error}`);
  };

  const open = trades.filter((t) => t.status === "OPEN" || t.status === "PENDING");
  const closed = trades
    .filter((t) => t.status !== "OPEN" && t.status !== "PENDING")
    .sort((a, b) => (b.exitDate || "").localeCompare(a.exitDate || ""));

  // ---------- Stats-based learning insights (client-side) ----------
  const stats = useMemo(() => {
    if (closed.length === 0) return null;
    const rets = closed.map((t) => t.returnPct ?? 0);
    const wins = rets.filter((r) => r > 0);
    const losses = rets.filter((r) => r <= 0);
    const winRate = Math.round((100 * wins.length) / closed.length);
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const expectancy = rets.reduce((a, b) => a + b, 0) / rets.length;
    const holds = closed
      .filter((t) => t.entryDate && t.exitDate)
      .map((t) => Math.max(0, Math.round((+new Date(t.exitDate!) - +new Date(t.entryDate!)) / 86400000)));
    const avgHold = holds.length ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : 0;

    const byStrat: Record<string, { n: number; w: number; sum: number }> = {};
    for (const t of closed) {
      const k = t.strategyLabel || "unknown";
      byStrat[k] = byStrat[k] || { n: 0, w: 0, sum: 0 };
      byStrat[k].n++;
      if ((t.returnPct ?? 0) > 0) byStrat[k].w++;
      byStrat[k].sum += t.returnPct ?? 0;
    }

    const insights: string[] = [];
    if (closed.length >= 5) {
      if (expectancy > 0) insights.push(`✅ Positive expectancy (+${expectancy.toFixed(2)}%/trade) — process ko repeat karo, size discipline rakho.`);
      else insights.push(`⚠️ Negative expectancy (${expectancy.toFixed(2)}%/trade) — entries ko sirf OOS-qualified setups tak limit karo.`);
      const slHits = closed.filter((t) => t.status === "SL_HIT").length;
      if (slHits / closed.length > 0.6) insights.push(`⚠️ ${Math.round((100 * slHits) / closed.length)}% trades SL pe gaye — stop bahut tight ho sakta hai ya entry timing (PENDING → next open) ke against gap ho raha hai.`);
      const manual = closed.filter((t) => t.status === "CLOSED_MANUAL");
      if (manual.length >= 3) {
        const mAvg = manual.reduce((a, t) => a + (t.returnPct ?? 0), 0) / manual.length;
        if (mAvg < avgWin) insights.push(`⚠️ Manual exits ka average (${mAvg.toFixed(1)}%) system targets se kam hai — winners ko jaldi kaat rahe ho.`);
      }
      const bestStrat = Object.entries(byStrat).sort((a, b) => b[1].sum - a[1].sum)[0];
      if (bestStrat && Object.keys(byStrat).length > 1) insights.push(`✅ Best strategy ab tak: ${bestStrat[0]} (net ${bestStrat[1].sum >= 0 ? "+" : ""}${bestStrat[1].sum.toFixed(1)}%).`);
    }
    return { wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, expectancy, avgHold, byStrat, insights };
  }, [closed]);

  if (loading) return <div className="state"><div className="spinner" />Journal load ho raha hai…</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
        <button className="toggle-filter-btn" onClick={() => checkPrices(false)} disabled={checking}>
          {checking ? "⏳ Checking…" : "🔄 Check SL / Target now"}
        </button>
        {isPb && (
          <button
            className="toggle-filter-btn"
            onClick={async () => {
              if (confirmId !== "RESET") { setConfirmId("RESET"); setMsg("⚠️ Pura practice journal reset karne ke liye dobara dabao"); return; }
              setConfirmId(null);
              await fetch(`${base}/reset`, { method: "POST" });
              setMsg("🗑 Practice journal reset ho gaya");
              load();
            }}
          >
            {confirmId === "RESET" ? "⚠️ Confirm reset?" : "🗑 Reset practice journal"}
          </button>
        )}
        {msg && <span style={{ fontSize: "12px", color: "#8e9ba9", fontFamily: "monospace" }}>{msg}</span>}
      </div>

      {trades.length === 0 && (
        <div style={{ ...box, textAlign: "center", padding: "40px 20px", color: "#8e9ba9" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#e6edf5", marginBottom: "6px" }}>
            {isPb ? "Practice journal khali hai" : "Abhi koi trade journal mein nahi hai"}
          </div>
          {isPb
            ? <>Playback date pe kisi actionable setup pe <strong style={{ color: "#c084fc" }}>"✋ Take this trade"</strong> dabao — phir din aage badhao aur dekho SL hit hota hai ya target.</>
            : <>Optimizer / Divergence / Overview me kisi actionable row ya setup card pe <strong style={{ color: "#fbbf24" }}>"✋ Take this trade"</strong> dabao — entry, SL aur target yahan track honge.</>}
        </div>
      )}

      {open.length > 0 && (
        <div style={box}>
          <h4 style={{ margin: "0 0 8px", color: "#fbbf24" }}>🟡 {isPb ? "Open Practice Trades" : "Open Trades"} ({open.length})</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Asset</th><th style={th}>Dir</th><th style={th}>Strategy</th><th style={th}>Entry Date</th><th style={th}>Entry</th>
                <th style={th}>SL</th><th style={th}>Target</th><th style={th}>Now</th><th style={th}>Unrealized</th><th style={th}>Actions</th>
              </tr></thead>
              <tbody>
                {open.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>
                      <strong>{disp(t)}</strong>
                      {t.status === "PENDING" && <span style={{ marginLeft: "6px", fontSize: "10px", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.4)", borderRadius: "4px", padding: "1px 5px" }}>PENDING</span>}
                    </td>
                    <td style={{ ...td, color: t.direction === "SHORT" ? "#ef4444" : "#22c55e", fontWeight: 700 }}>{t.direction}</td>
                    <td style={{ ...td, fontFamily: "inherit", fontSize: "11.5px", color: "#8e9ba9" }}>{t.strategyLabel || "—"}</td>
                    <td style={td}>{t.status === "PENDING" ? "agla bar" : t.entryDate}</td>
                    <td style={td}>{px(t.entryPrice)}</td>
                    <td style={{ ...td, color: "#ef4444" }}>{px(t.stopPrice)}</td>
                    <td style={{ ...td, color: "#22c55e" }}>{px(t.targetPrice)}</td>
                    <td style={td}>{px(t.currentPrice)}</td>
                    <td style={{ ...td, color: (t.unrealizedPct ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{fmtPct(t.unrealizedPct)}</td>
                    <td style={td}>
                      {t.status !== "PENDING" && <><button style={btn} onClick={() => manualClose(t)}>{isPb ? "Exit @ day close" : "Exit @ latest"}</button>{" "}</>}
                      <button style={{ ...btn, color: "#ef4444", ...(confirmId === t.id ? { background: "#ef4444", color: "#fff", borderColor: "#ef4444" } : {}) }} onClick={() => remove(t)}>{confirmId === t.id ? "Confirm?" : "✕"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "11px", color: "#576575", marginTop: "8px", fontFamily: "monospace" }}>
            {isPb
              ? "SL/target sirf playback date TAK ke historical candles se resolve hote hain — future ka koi data leak nahi. Din aage badhao, trades khud update honge."
              : 'SL/target roz ke daily candles se check hota hai (gap-aware). "Check SL / Target now" dabao ya tab dobara kholo — auto-update ho jata hai.'}
          </div>
        </div>
      )}

      {stats && (
        <div style={box}>
          <h4 style={{ margin: "0 0 8px", color: "#60a5fa" }}>📊 Tumhara Scorecard (closed trades se)</h4>
          <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#c9d3df", marginBottom: "8px" }}>
            <strong>{closed.length}</strong> closed · <span style={{ color: "#22c55e" }}>{stats.wins} win</span> / <span style={{ color: "#ef4444" }}>{stats.losses} loss</span> · <strong>{stats.winRate}%</strong> win rate
            {" · "}Avg win <span style={{ color: "#22c55e" }}>+{stats.avgWin.toFixed(1)}%</span> · Avg loss <span style={{ color: "#ef4444" }}>{stats.avgLoss.toFixed(1)}%</span>
            {" · "}Expectancy <strong style={{ color: stats.expectancy >= 0 ? "#22c55e" : "#ef4444" }}>{stats.expectancy >= 0 ? "+" : ""}{stats.expectancy.toFixed(2)}%/trade</strong> · Avg hold {stats.avgHold}d
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#8e9ba9", marginBottom: stats.insights.length ? "8px" : 0 }}>
            {(Object.entries(stats.byStrat) as [string, { n: number; w: number; sum: number }][]).map(([k, v]) => (
              <div key={k}>· {k}: {v.n} trades, {Math.round((100 * v.w) / v.n)}% win, net {v.sum >= 0 ? "+" : ""}{v.sum.toFixed(1)}%</div>
            ))}
          </div>
          {stats.insights.map((line, i) => (
            <div key={i} style={{ fontSize: "12.5px", padding: "6px 10px", borderRadius: "6px", background: line.startsWith("✅") ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${line.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`, marginTop: "6px", color: "#c9d3df" }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div style={box}>
          <h4 style={{ margin: "0 0 8px", color: "#8e9ba9" }}>📁 Closed Trades ({closed.length})</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Asset</th><th style={th}>Dir</th><th style={th}>Entry → Exit</th><th style={th}>Entry</th><th style={th}>Exit</th>
                <th style={th}>Return</th><th style={th}>Result</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {closed.map((t) => {
                  const m = STATUS_META[t.status] || { label: String(t.status), color: "#8e9ba9", bg: "rgba(142,155,169,0.12)" };
                  return (
                    <tr key={t.id}>
                      <td style={td}><strong>{disp(t)}</strong><div style={{ fontSize: "10.5px", color: "#576575" }}>{t.strategyLabel || ""}</div></td>
                      <td style={{ ...td, color: t.direction === "SHORT" ? "#ef4444" : "#22c55e", fontWeight: 700 }}>{t.direction}</td>
                      <td style={td}>{t.entryDate} → {t.exitDate}</td>
                      <td style={td}>{px(t.entryPrice)}</td>
                      <td style={td}>{px(t.exitPrice)}</td>
                      <td style={{ ...td, color: (t.returnPct ?? 0) >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{fmtPct(t.returnPct)}</td>
                      <td style={td}><span style={{ fontSize: "10.5px", padding: "2px 7px", borderRadius: "4px", color: m.color, background: m.bg, border: `1px solid ${m.color}44`, fontWeight: 700 }}>{m.label}</span></td>
                      <td style={td}><button style={{ ...btn, color: "#ef4444", ...(confirmId === t.id ? { background: "#ef4444", color: "#fff", borderColor: "#ef4444" } : {}) }} onClick={() => remove(t)}>{confirmId === t.id ? "Confirm?" : "✕"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: "11px", color: "#576575", fontFamily: "monospace" }}>
        {isPb
          ? "Practice journal (data/playback_trades.json) — historical data pe decision-making ki training, real paisa nahi."
          : "Ye tumhara personal journal hai (data/mytrades.json mein save) — educational tracking, financial advice nahi."}
      </div>
    </div>
  );
}

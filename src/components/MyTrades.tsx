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

    // Strategy breakdown with gross win/loss for PF
    const byStrat: Record<string, { n: number; w: number; sum: number; grossW: number; grossL: number }> = {};
    for (const t of closed) {
      const k = t.strategyLabel || "unknown";
      byStrat[k] = byStrat[k] || { n: 0, w: 0, sum: 0, grossW: 0, grossL: 0 };
      byStrat[k].n++;
      const r = t.returnPct ?? 0;
      if (r > 0) { byStrat[k].w++; byStrat[k].grossW += r; }
      else byStrat[k].grossL += Math.abs(r);
      byStrat[k].sum += r;
    }

    // Total net
    const totalNet = rets.reduce((a, b) => a + b, 0);

    // Monthly P&L
    const byMonth: Record<string, { n: number; net: number }> = {};
    for (const t of closed) {
      const mo = (t.exitDate || t.takenAt || "").slice(0, 7);
      if (!mo) continue;
      byMonth[mo] = byMonth[mo] || { n: 0, net: 0 };
      byMonth[mo].n++;
      byMonth[mo].net += t.returnPct ?? 0;
    }

    // Equity curve + Drawdown
    let cum = 0, peak = 0, maxDD = 0, currentDD = 0;
    const equityCurve: number[] = [];
    for (const r of rets) {
      cum += r;
      equityCurve.push(+cum.toFixed(2));
      if (cum > peak) peak = cum;
      const dd = cum - peak;
      if (dd < maxDD) maxDD = dd;
      currentDD = dd;
    }
    const ddHistory = equityCurve;

    const insights: string[] = [];
    if (closed.length >= 5) {
      if (expectancy > 0) insights.push(`✅ Positive expectancy (+${expectancy.toFixed(2)}%/trade) — process ko repeat karo, size discipline rakho.`);
      else insights.push(`⚠️ Negative expectancy (${expectancy.toFixed(2)}%/trade) — entries ko sirf OOS-qualified setups tak limit karo.`);
      const slHits = closed.filter((t) => t.status === "SL_HIT").length;
      if (slHits / closed.length > 0.6) insights.push(`⚠️ ${Math.round((100 * slHits) / closed.length)}% trades SL pe gaye — stop bahut tight ho sakta hai ya entry timing ke against gap ho raha hai.`);
      const manual = closed.filter((t) => t.status === "CLOSED_MANUAL");
      if (manual.length >= 3) {
        const mAvg = manual.reduce((a, t) => a + (t.returnPct ?? 0), 0) / manual.length;
        if (mAvg < avgWin) insights.push(`⚠️ Manual exits ka average (${mAvg.toFixed(1)}%) system targets se kam hai — winners ko jaldi kaat rahe ho.`);
      }
      const bestStrat = Object.entries(byStrat).sort((a, b) => b[1].sum - a[1].sum)[0];
      if (bestStrat && Object.keys(byStrat).length > 1) insights.push(`✅ Best strategy ab tak: ${bestStrat[0]} (net ${bestStrat[1].sum >= 0 ? "+" : ""}${bestStrat[1].sum.toFixed(1)}%).`);
      if (Math.abs(maxDD) > 20) insights.push(`⚠️ Max drawdown ${maxDD.toFixed(1)}% — risk per trade review karo, 1-2% limit rakho.`);
    }
    return { wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, expectancy, avgHold, byStrat, insights, totalNet, byMonth, ddHistory, equityCurve, maxDD, currentDD, peak };
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
        <div>
          {/* ── TOP METRICS ── */}
          <div style={{ ...box, background: "linear-gradient(135deg, #0f141c 0%, #111827 100%)" }}>
            <h4 style={{ margin: "0 0 12px", color: "#60a5fa", fontSize: 14 }}>📊 Journal Performance Analytics</h4>

            {/* Key numbers row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Total Trades", val: closed.length, unit: "", color: "#c9d3df" },
                { label: "Win Rate", val: stats.winRate + "%", unit: "", color: stats.winRate >= 40 ? "#22c55e" : stats.winRate >= 30 ? "#fbbf24" : "#ef4444" },
                { label: "Profit Factor", val: stats.losses > 0 ? (Math.abs(stats.avgWin * stats.wins) / Math.abs(stats.avgLoss * stats.losses)).toFixed(2) : "∞", unit: "", color: parseFloat(stats.losses > 0 ? (Math.abs(stats.avgWin * stats.wins) / Math.abs(stats.avgLoss * stats.losses)).toFixed(2) : "2") >= 1.3 ? "#22c55e" : "#fbbf24" },
                { label: "Expectancy", val: (stats.expectancy >= 0 ? "+" : "") + stats.expectancy.toFixed(2) + "%", unit: "/trade", color: stats.expectancy >= 0 ? "#22c55e" : "#ef4444" },
                { label: "Max Drawdown", val: stats.maxDD.toFixed(1) + "%", unit: "", color: Math.abs(stats.maxDD) < 10 ? "#22c55e" : Math.abs(stats.maxDD) < 20 ? "#fbbf24" : "#ef4444" },
                { label: "Avg Hold", val: stats.avgHold + "d", unit: "", color: "#c9d3df" },
              ].map(m => (
                <div key={m.label} style={{ background: "#0a0f18", border: "1px solid #1b2230", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#576575", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: m.color }}>{m.val}<span style={{ fontSize: 11, color: "#576575" }}>{m.unit}</span></div>
                </div>
              ))}
            </div>

            {/* Wins / Losses detail */}
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#8e9ba9", marginBottom: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>✅ Wins: <b style={{ color: "#22c55e" }}>{stats.wins}</b> · avg <b style={{ color: "#22c55e" }}>+{stats.avgWin.toFixed(2)}%</b></span>
              <span>❌ Losses: <b style={{ color: "#ef4444" }}>{stats.losses}</b> · avg <b style={{ color: "#ef4444" }}>{stats.avgLoss.toFixed(2)}%</b></span>
              <span>💰 Net Return: <b style={{ color: stats.totalNet >= 0 ? "#22c55e" : "#ef4444" }}>{stats.totalNet >= 0 ? "+" : ""}{stats.totalNet.toFixed(2)}%</b></span>
            </div>

            {/* Insights */}
            {stats.insights.map((line, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: line.startsWith("✅") ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${line.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`, marginTop: 6, color: "#c9d3df" }}>
                {line}
              </div>
            ))}
          </div>

          {/* ── STRATEGY BREAKDOWN ── */}
          {Object.keys(stats.byStrat).length > 0 && (
            <div style={box}>
              <h4 style={{ margin: "0 0 10px", color: "#a78bfa", fontSize: 13 }}>📈 Strategy Breakdown</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                {(Object.entries(stats.byStrat) as [string, { n: number; w: number; sum: number; grossW: number; grossL: number }][])
                  .sort((a, b) => b[1].sum - a[1].sum)
                  .map(([k, v]) => {
                    const winR = Math.round((100 * v.w) / v.n);
                    const pf = v.grossL > 0 ? (v.grossW / v.grossL).toFixed(2) : v.grossW > 0 ? "∞" : "0";
                    const pfNum = parseFloat(pf === "∞" ? "99" : pf);
                    const pfColor = pfNum >= 1.5 ? "#22c55e" : pfNum >= 1.0 ? "#fbbf24" : "#ef4444";
                    return (
                      <div key={k} style={{ background: "#0a0f18", border: "1px solid #1b2230", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#c9d3df", marginBottom: 6, fontFamily: "monospace" }}>{k}</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, fontFamily: "monospace" }}>
                          <span style={{ color: "#576575" }}>N: <b style={{ color: "#c9d3df" }}>{v.n}</b></span>
                          <span style={{ color: "#576575" }}>Win: <b style={{ color: winR >= 40 ? "#22c55e" : "#fbbf24" }}>{winR}%</b></span>
                          <span style={{ color: "#576575" }}>PF: <b style={{ color: pfColor }}>{pf}</b></span>
                          <span style={{ color: "#576575" }}>Net: <b style={{ color: v.sum >= 0 ? "#22c55e" : "#ef4444" }}>{v.sum >= 0 ? "+" : ""}{v.sum.toFixed(1)}%</b></span>
                        </div>
                        {/* Mini progress bar */}
                        <div style={{ marginTop: 6, height: 3, background: "#1b2230", borderRadius: 2 }}>
                          <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, Math.max(0, winR))}%`, background: winR >= 40 ? "#22c55e" : winR >= 30 ? "#fbbf24" : "#ef4444" }} />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* PF vs Backtested comparison */}
              <div style={{ marginTop: 12, padding: "8px 10px", background: "#0a0f18", borderRadius: 8, border: "1px solid #1b2230" }}>
                <div style={{ fontSize: 11, color: "#576575", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Live PF vs Backtested PF</div>
                {[
                  { name: "Forex RSI 25/75",  backtested: 1.34 },
                  { name: "5-EMA Filtered",   backtested: 1.92 },
                  { name: "Trend Analysis",   backtested: 3.19 },
                  { name: "Channel 55/20",    backtested: 1.91 },
                  { name: "Crypto EMA 20/50", backtested: 1.08 },
                ].filter(s => stats.byStrat[s.name]).map(s => {
                  const v = stats.byStrat[s.name];
                  const livePF = v.grossL > 0 ? v.grossW / v.grossL : v.grossW > 0 ? 9.99 : 0;
                  const gap = livePF - s.backtested;
                  const gapColor = gap >= 0 ? "#22c55e" : gap >= -0.3 ? "#fbbf24" : "#ef4444";
                  return (
                    <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, fontFamily: "monospace", color: "#8e9ba9", paddingTop: 4 }}>
                      <span>{s.name}</span>
                      <span>
                        Live: <b style={{ color: livePF >= 1.2 ? "#22c55e" : "#fbbf24" }}>{livePF.toFixed(2)}</b>
                        {" vs "} Backtested: <b style={{ color: "#60a5fa" }}>{s.backtested}</b>
                        {" · "} <span style={{ color: gapColor }}>{gap >= 0 ? "+" : ""}{gap.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })}
                {!Object.keys(stats.byStrat).some(k => ["Forex RSI 25/75","5-EMA Filtered","Trend Analysis","Channel 55/20","Crypto EMA 20/50"].includes(k)) && (
                  <div style={{ fontSize: 11, color: "#576575" }}>Trades lo aur phir compare dikhe ga</div>
                )}
              </div>
            </div>
          )}

          {/* ── MONTHLY P&L ── */}
          {stats.byMonth && Object.keys(stats.byMonth).length > 0 && (
            <div style={box}>
              <h4 style={{ margin: "0 0 10px", color: "#fbbf24", fontSize: 13 }}>📅 Monthly P&L</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(stats.byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([mo, v]: [string, any]) => {
                  const barW = Math.min(Math.abs(v.net) * 3, 80);
                  return (
                    <div key={mo} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontFamily: "monospace" }}>
                      <span style={{ color: "#576575", minWidth: 60 }}>{mo}</span>
                      <span style={{ color: "#8e9ba9", minWidth: 30 }}>N:{v.n}</span>
                      <div style={{ flex: 1, height: 12, background: "#0a0f18", borderRadius: 2, position: "relative" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`, background: v.net >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)", borderRadius: 2 }} />
                      </div>
                      <span style={{ color: v.net >= 0 ? "#22c55e" : "#ef4444", minWidth: 60, textAlign: "right" }}>{v.net >= 0 ? "+" : ""}{v.net.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DRAWDOWN ── */}
          {stats.ddHistory && stats.ddHistory.length > 1 && (
            <div style={box}>
              <h4 style={{ margin: "0 0 10px", color: "#ef4444", fontSize: 13 }}>📉 Drawdown Tracker</h4>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, fontFamily: "monospace", fontSize: 12 }}>
                <span style={{ color: "#576575" }}>Max DD: <b style={{ color: "#ef4444" }}>{stats.maxDD.toFixed(1)}%</b></span>
                <span style={{ color: "#576575" }}>Current DD: <b style={{ color: stats.currentDD < -5 ? "#ef4444" : "#fbbf24" }}>{stats.currentDD.toFixed(1)}%</b></span>
                <span style={{ color: "#576575" }}>Peak: <b style={{ color: "#22c55e" }}>+{stats.peak.toFixed(1)}%</b></span>
              </div>
              {/* Equity curve mini */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 50 }}>
                {stats.equityCurve.map((val: number, i: number) => {
                  const maxVal = Math.max(...stats.equityCurve, 0);
                  const minVal = Math.min(...stats.equityCurve, 0);
                  const range = maxVal - minVal || 1;
                  const h = Math.round(((val - minVal) / range) * 46);
                  return <div key={i} style={{ flex: 1, height: Math.max(2, h), background: val >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)", borderRadius: 1 }} />;
                })}
              </div>
              <div style={{ fontSize: 10, color: "#576575", marginTop: 4, fontFamily: "monospace" }}>Cumulative % · {stats.equityCurve.length} trades</div>
            </div>
          )}
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

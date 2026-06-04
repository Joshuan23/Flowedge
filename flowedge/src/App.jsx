import { useState, useEffect, useCallback, useRef } from "react";
import { useUser, useAuth, SignInButton, UserButton } from "@clerk/clerk-react";

const DEFAULT_WATCHLIST = [
  "SPY","QQQ","IWM","NVDA","AAPL","MSFT","TSLA","META","AMZN","GOOGL",
  "AMD","PLTR","COIN","V","JPM","GLD","TLT","VXX",
];

// All tickers available in the datalist / gamma selector
const ALL_TICKERS = [
  // ETFs
  "SPY","QQQ","IWM","DIA","MDY","VOO","VTI","VEA","VWO",
  "GLD","SLV","GDX","GDXJ","USO","UNG",
  "TLT","HYG","LQD","IEF","SHY","AGG",
  "XLF","XLK","XLE","XLV","XLI","XLU","XLP","XLB","XLRE","XLY","XLC",
  "EEM","EFA","IEMG","KWEB","MCHI","EWJ","EWZ","EWY",
  "ARKK","ARKG","ARKF","ARKW","ARKQ",
  "TQQQ","SQQQ","SPXL","SPXU","UPRO","UVXY","VXX","SVXY",
  "SMH","SOXX","IGV","CIBR","HACK",
  "LABU","LABD","FAS","FAZ","SOXL","SOXS","NAIL","HIBL",
  // Mega cap
  "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","AVGO","ORCL",
  // Semis
  "AMD","INTC","QCOM","MU","AMAT","LRCX","KLAC","MRVL","SMCI","ARM",
  "TXN","NXPI","ADI","MCHP","ON","SWKS","QRVO","MTSI","MPWR","ENTG",
  // Software/Cloud
  "CRM","ADBE","NOW","WDAY","INTU","PLTR","AI","PATH","U","NET",
  "SNOW","DDOG","CRWD","ZS","PANW","OKTA","FTNT","CYBR","MDB","HUBS",
  "TWLO","BILL","TTD","GTLB","SMAR","DOCN","PTC","ANSS","CDNS","SNPS",
  // Consumer tech / fintech
  "COIN","MSTR","HOOD","RBLX","ROKU","SPOT","ZM","DKNG","SOFI","UPST",
  "AFRM","CVNA","OPEN","ETSY","CART","PCTY","PAYC","WEX","FLYW",
  // Financials
  "JPM","BAC","GS","MS","WFC","C","USB","PNC","TFC","KEY","RF","FITB",
  "V","MA","AXP","BLK","COF","SCHW","BX","KKR","APO","ARES","CG",
  "MCO","SPGI","ICE","CME","NDAQ","CBOE","FDS","MSCI",
  "MET","PRU","AFL","ALL","PGR","CB","TRV","HIG","UNM","GL",
  // Healthcare
  "UNH","JNJ","LLY","PFE","ABBV","MRK","TMO","DHR","BMY","AMGN",
  "GILD","ISRG","CVS","CI","HUM","ELV","CNC","MOH","VRTX","REGN",
  "BIIB","MRNA","BNTX","NVAX","SRPT","ALNY","RARE","BMRN","ACAD",
  "IQV","IQVIA","SYK","BSX","ABT","MDT","BDX","DXCM","PODD","INSP",
  // Consumer disc
  "AMZN","HD","LOW","MCD","YUM","NKE","SBUX","TGT","WMT","COST",
  "DIS","NFLX","BKNG","EXPE","ABNB","LYFT","UBER","DASH",
  "GM","F","RIVN","LCID","NIO","XPEV","LI","TSLA",
  "GME","AMC","BBBY","PLBY","RH","W","OSTK",
  // Energy
  "XOM","CVX","COP","EOG","SLB","OXY","PXD","VLO","PSX","MPC",
  "HAL","BKR","DVN","FANG","HES","LNG","CTRA","MRO","APA","BP","SHEL",
  "NOG","CIVI","MTDR","SM","CRC","GPOR","AR","EQT","RRC","SWN",
  // Industrials/Aero/Defense
  "BA","CAT","GE","HON","RTX","LMT","NOC","GD","L3H","KTOS","RKLB",
  "UNP","CSX","NSC","CP","CNI","FDX","UPS","DE","AGCO","CNH",
  "MMM","EMR","ROK","ETN","IR","PH","GWW","CARR","OTIS","TT","XYL",
  // Telecom/Media
  "T","VZ","TMUS","CMCSA","CHTR","WBD","SNAP","PINS","RDDT","X",
  "MTCH","IAC","PARA","SIRI","DIS","NFLX","WBD",
  // REITs
  "AMT","PLD","EQIX","SPG","O","PSA","DLR","WELL","AVB","EQR","VNO",
  "CCI","SBAC","AMT","IRM","MPW","VICI","GLPI",
  // Materials
  "FCX","NEM","GOLD","AA","CLF","STLD","NUE","X","RS","CMC",
  "LIN","APD","ECL","DD","DOW","EMN","CE","ALB","SQM","LTHM","PLL",
  // Crypto-adjacent
  "COIN","MSTR","RIOT","MARA","CLSK","CIFR","HUT","BTBT","BTDR","WGMI",
];

// ETF set for NASDAQ API asset class routing
const ETF_SET = new Set([
  "SPY","QQQ","IWM","DIA","MDY","VOO","VTI","VEA","VWO",
  "GLD","SLV","GDX","GDXJ","USO","UNG",
  "TLT","HYG","LQD","IEF","SHY","AGG",
  "XLF","XLK","XLE","XLV","XLI","XLU","XLP","XLB","XLRE","XLY","XLC",
  "EEM","EFA","IEMG","KWEB","MCHI","EWJ","EWZ","EWY",
  "ARKK","ARKG","ARKF","ARKW","ARKQ",
  "TQQQ","SQQQ","SPXL","SPXU","UPRO","UVXY","VXX","SVXY",
  "SMH","SOXX","IGV","CIBR","HACK","LABU","LABD","FAS","FAZ",
  "SOXL","SOXS","NAIL","HIBL",
]);

const fmt = (n) => {
  if (!n) return "$0";
  return n >= 1e12 ? `$${(n/1e12).toFixed(2)}T`
    : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B`
    : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M`
    : `$${n.toFixed(2)}`;
};

const pct = (n) => n != null ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%` : "—";
const dollar = (n) => n != null ? `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}` : "—";

function StatBox({ label, value, color = "#a5b4fc", sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 20, fontFamily: "'Space Mono', monospace", fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "#6b7280" }}>{sub}</span>}
    </div>
  );
}

function StockCard({ data, index, onRemove }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), index * 80); }, []);
  const up = data.regularMarketChangePercent >= 0;
  const color = up ? "#10b981" : "#ef4444";
  const rangePct = data.regularMarketDayHigh && data.regularMarketDayLow
    ? ((data.regularMarketPrice - data.regularMarketDayLow) / (data.regularMarketDayHigh - data.regularMarketDayLow)) * 100
    : 50;

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10,
      background: up ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
      border: `1px solid ${up ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
      opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(10px)",
      transition: "all 0.4s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb" }}>{data.symbol}</div>
            {onRemove && (
              <button onClick={onRemove} title="Remove from watchlist" style={{
                background: "none", border: "none", color: "#374151", cursor: "pointer",
                fontSize: 13, padding: 0, lineHeight: 1, marginTop: 1,
              }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 1 }}>{data.shortName || ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 17, color: "#f9fafb" }}>
            ${data.regularMarketPrice?.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color, fontWeight: 700 }}>{pct(data.regularMarketChangePercent)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          ["Volume", fmt(data.regularMarketVolume)],
          ["Mkt Cap", fmt(data.marketCap)],
          ["52W High", `$${data.fiftyTwoWeekHigh?.toFixed(0)}`],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", fontFamily: "monospace" }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#374151", marginBottom: 4 }}>
        <span>${data.regularMarketDayLow?.toFixed(2)}</span>
        <span style={{ color: "#4b5563" }}>Day Range</span>
        <span>${data.regularMarketDayHigh?.toFixed(2)}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
        <div style={{ width: `${rangePct}%`, height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${color}44, ${color})`, transition: "width 1s ease 0.5s" }} />
      </div>
    </div>
  );
}

function SignalCard({ data, index }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), index * 100); }, []);
  const up = data.regularMarketChangePercent >= 0;
  const color = up ? "#10b981" : "#ef4444";
  const strength = Math.min(Math.abs(data.regularMarketChangePercent || 0) * 12, 99).toFixed(0);

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`,
      opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(8px)",
      transition: "all 0.4s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: "#f9fafb" }}>{data.symbol}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
            <div style={{ width: `${strength}%`, height: "100%", background: color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, color, fontFamily: "monospace", fontWeight: 700 }}>{strength}</span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
        {up
          ? `${data.symbol} bullish. Up ${pct(data.regularMarketChangePercent)} on ${fmt(data.regularMarketVolume)} vol. Watch for institutional follow-through.`
          : `${data.symbol} bearish pressure. Down ${pct(data.regularMarketChangePercent)}. Monitor for support or capitulation.`}
      </p>
    </div>
  );
}

function PortfolioPanel({ stocks }) {
  const [positions, setPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fe_portfolio") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ symbol: "", shares: "", costBasis: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem("fe_portfolio", JSON.stringify(positions));
  }, [positions]);

  const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.regularMarketPrice]));

  const addPosition = () => {
    const shares = parseFloat(form.shares);
    const costBasis = parseFloat(form.costBasis);
    if (!shares || !costBasis || shares <= 0 || costBasis <= 0) return;
    setPositions(prev => [...prev, { id: Date.now(), symbol: form.symbol, shares, costBasis }]);
    setForm(f => ({ ...f, shares: "", costBasis: "" }));
    setAdding(false);
  };

  const removePosition = (id) => setPositions(prev => prev.filter(p => p.id !== id));

  const enriched = positions.map(p => {
    const price = priceMap[p.symbol];
    const currentValue = price ? price * p.shares : null;
    const invested = p.costBasis * p.shares;
    const pnl = currentValue != null ? currentValue - invested : null;
    const pnlPct = pnl != null ? (pnl / invested) * 100 : null;
    return { ...p, price, currentValue, invested, pnl, pnlPct };
  });

  const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);
  const totalValue = enriched.reduce((s, p) => s + (p.currentValue ?? p.invested), 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const pnlColor = totalPnl >= 0 ? "#10b981" : "#ef4444";

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, padding: "7px 10px", color: "#f9fafb", fontSize: 12,
    fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {positions.length > 0 && (
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3 }}>TOTAL VALUE</div>
              <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: "#f9fafb" }}>{fmt(totalValue)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3 }}>TOTAL P&L</div>
              <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: pnlColor }}>
                {dollar(totalPnl)} <span style={{ fontSize: 11 }}>({pct(totalPnlPct)})</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {enriched.map(p => {
        const c = p.pnl != null && p.pnl >= 0 ? "#10b981" : "#ef4444";
        return (
          <div key={p.id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#f9fafb" }}>{p.symbol}</span>
                <span style={{ fontSize: 11, color: "#4b5563", marginLeft: 6 }}>{p.shares} shares @ ${p.costBasis.toFixed(2)}</span>
              </div>
              <button onClick={() => removePosition(p.id)} style={{
                background: "none", border: "none", color: "#374151", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
              }}>×</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div>
                <div style={{ fontSize: 10, color: "#4b5563" }}>Current</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "#9ca3af" }}>
                  {p.price ? `$${p.price.toFixed(2)}` : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#4b5563" }}>P&L</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: c, fontWeight: 700 }}>
                  {p.pnl != null ? `${dollar(p.pnl)} (${pct(p.pnlPct)})` : "—"}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input list="all-tickers-dl" placeholder="Ticker symbol (e.g. AAPL)" value={form.symbol}
              onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              style={inputStyle} />
            <input placeholder="Shares" type="number" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} style={inputStyle} />
            <input placeholder="Avg cost per share" type="number" value={form.costBasis} onChange={e => setForm(f => ({ ...f, costBasis: e.target.value }))} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addPosition} style={{
                flex: 1, background: "#6366f1", border: "none", borderRadius: 6, padding: "8px 0",
                color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12,
              }}>Add Position</button>
              <button onClick={() => setAdding(false)} style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "8px 0", color: "#9ca3af", cursor: "pointer", fontSize: 12,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.4)",
          borderRadius: 8, padding: "10px 0", color: "#a5b4fc", cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>+ Add Position</button>
      )}
    </div>
  );
}

function AlertsPanel({ stocks }) {
  const [alerts, setAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fe_alerts") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ symbol: "", price: "", direction: "above" });
  const [adding, setAdding] = useState(false);
  const firedRef = useRef(new Set());

  useEffect(() => {
    localStorage.setItem("fe_alerts", JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    if (!stocks.length || !alerts.length) return;
    const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.regularMarketPrice]));
    alerts.forEach(a => {
      if (a.triggered || firedRef.current.has(a.id)) return;
      const price = priceMap[a.symbol];
      if (!price) return;
      const hit = a.direction === "above" ? price >= a.targetPrice : price <= a.targetPrice;
      if (hit) {
        firedRef.current.add(a.id);
        setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, triggered: true, triggeredAt: new Date().toLocaleTimeString() } : x));
        if (Notification.permission === "granted") {
          new Notification(`FlowEdge Alert: ${a.symbol}`, {
            body: `${a.symbol} is ${a.direction} $${a.targetPrice} — now at $${price.toFixed(2)}`,
            icon: "/favicon.ico",
          });
        }
      }
    });
  }, [stocks, alerts]);

  const addAlert = async () => {
    const targetPrice = parseFloat(form.price);
    if (!targetPrice || targetPrice <= 0) return;
    if (Notification.permission === "default") await Notification.requestPermission();
    setAlerts(prev => [...prev, { id: Date.now(), symbol: form.symbol, targetPrice, direction: form.direction, triggered: false }]);
    setForm(f => ({ ...f, price: "" }));
    setAdding(false);
  };

  const removeAlert = (id) => {
    firedRef.current.delete(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, padding: "7px 10px", color: "#f9fafb", fontSize: 12,
    fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {alerts.map(a => {
        const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.regularMarketPrice]));
        const currentPrice = priceMap[a.symbol];
        const c = a.triggered ? "#10b981" : "#6b7280";
        return (
          <div key={a.id} style={{
            padding: "10px 12px", borderRadius: 8,
            background: a.triggered ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${a.triggered ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}`,
            borderLeft: `3px solid ${c}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#f9fafb" }}>{a.symbol}</span>
                <span style={{ fontSize: 11, color: "#4b5563", marginLeft: 6 }}>
                  {a.direction === "above" ? "▲" : "▼"} ${a.targetPrice.toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {a.triggered && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>FIRED {a.triggeredAt}</span>}
                <button onClick={() => removeAlert(a.id)} style={{
                  background: "none", border: "none", color: "#374151", cursor: "pointer", fontSize: 14, padding: 0,
                }}>×</button>
              </div>
            </div>
            {currentPrice && !a.triggered && (
              <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                Current: ${currentPrice.toFixed(2)} · {a.direction === "above"
                  ? `${((a.targetPrice - currentPrice) / currentPrice * 100).toFixed(1)}% away`
                  : `${((currentPrice - a.targetPrice) / currentPrice * 100).toFixed(1)}% away`}
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input list="all-tickers-dl" placeholder="Ticker symbol (e.g. TSLA)" value={form.symbol}
              onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              style={inputStyle} />
            <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
            </select>
            <input placeholder="Target price" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addAlert} style={{
                flex: 1, background: "#6366f1", border: "none", borderRadius: 6, padding: "8px 0",
                color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12,
              }}>Set Alert</button>
              <button onClick={() => setAdding(false)} style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "8px 0", color: "#9ca3af", cursor: "pointer", fontSize: 12,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.4)",
          borderRadius: 8, padding: "10px 0", color: "#a5b4fc", cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>+ Set Price Alert</button>
      )}

      {!alerts.length && !adding && (
        <p style={{ fontSize: 11, color: "#374151", textAlign: "center", margin: "8px 0" }}>
          No alerts set. Add one above and get browser notifications when your target hits.
        </p>
      )}
    </div>
  );
}

function OIHeatMap({ heatmap, spot, buyKingNode, sellKingNode }) {
  if (!heatmap?.cells?.length) return null;

  const { expiries, strikes, cells } = heatmap;
  const cellMap = {};
  cells.forEach(c => {
    if (!cellMap[c.strike]) cellMap[c.strike] = {};
    cellMap[c.strike][c.expiry] = c;
  });

  const maxAbs = Math.max(...cells.map(c => Math.abs(c.gex || 0)), 1);
  const sortedStrikes = [...strikes].sort((a, b) => b - a);

  const abbrevExp = (exp) => {
    const [mon, day] = exp.split(' ');
    const m = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    return `${m[mon] ?? mon}/${parseInt(day)}`;
  };

  const cellBg = (gex) => {
    if (!gex) return 'rgba(255,255,255,0.02)';
    const alpha = Math.min(Math.pow(Math.abs(gex) / maxAbs, 0.45) * 0.82, 0.82);
    return gex > 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
  };

  const fmtCell = (gex) => {
    if (!gex) return '';
    const abs = Math.abs(gex), s = gex >= 0 ? '+' : '-';
    if (abs >= 1e9) return `${s}$${(abs/1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${s}$${(abs/1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${s}$${(abs/1e3).toFixed(0)}K`;
    return `${s}$${abs.toFixed(0)}`;
  };

  const colW = Math.max(54, Math.floor(240 / expiries.length));

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 9, fontFamily: 'monospace', tableLayout: 'fixed', minWidth: 46 + expiries.length * colW }}>
        <thead>
          <tr>
            <th style={{ width: 46, padding: '3px 4px', textAlign: 'right', color: '#374151', fontSize: 8, fontWeight: 400, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0d1117' }}>
              STRIKE
            </th>
            {expiries.map(exp => (
              <th key={exp} style={{ width: colW, padding: '3px 2px', textAlign: 'center', color: '#4b5563', fontSize: 8, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0d1117' }}>
                {abbrevExp(exp)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedStrikes.map(strike => {
            const isSpot = spot && Math.abs(strike - spot) < 2.5;
            const isBuyKing = strike === buyKingNode?.strike;
            const isSellKing = strike === sellKingNode?.strike;
            const rowBg = isBuyKing ? 'rgba(16,185,129,0.08)' : isSellKing ? 'rgba(239,68,68,0.08)' : isSpot ? 'rgba(245,158,11,0.07)' : 'transparent';
            const strikeColor = isBuyKing ? '#10b981' : isSellKing ? '#ef4444' : isSpot ? '#f59e0b' : '#6b7280';
            return (
              <tr key={strike} style={{ background: rowBg }}>
                <td style={{ padding: '2px 4px', textAlign: 'right', color: strikeColor, fontWeight: isBuyKing || isSellKing || isSpot ? 700 : 400, borderRight: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' }}>
                  {(isBuyKing || isSellKing) && <span style={{ marginRight: 2 }}>♛</span>}
                  {strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(1)}
                </td>
                {expiries.map(exp => {
                  const c = cellMap[strike]?.[exp];
                  const gex = c?.gex || 0;
                  return (
                    <td key={exp}
                      title={c ? `$${strike} ${exp}: ${(c.callOI||0).toLocaleString()}c / ${(c.putOI||0).toLocaleString()}p` : ''}
                      style={{
                        padding: '2px 3px', textAlign: 'right', background: cellBg(gex),
                        color: gex > 0 ? '#86efac' : gex < 0 ? '#fca5a5' : '#1f2937',
                        fontSize: 8, border: '1px solid rgba(0,0,0,0.15)',
                        whiteSpace: 'nowrap',
                      }}>
                      {fmtCell(gex)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', justifyContent: 'center' }}>
        <span style={{ fontSize: 8, color: '#86efac', fontFamily: 'monospace' }}>■ Dealer long (call&gt;put)</span>
        <span style={{ fontSize: 8, color: '#eab308', fontFamily: 'monospace' }}>♛ King node</span>
        <span style={{ fontSize: 8, color: '#fca5a5', fontFamily: 'monospace' }}>■ Dealer short (put&gt;call)</span>
      </div>
    </div>
  );
}

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ProGate({ children }) {
  if (!CLERK_KEY) return children;
  return <ProGateInner>{children}</ProGateInner>;
}

function ProGateInner({ children }) {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [checkingOut, setCheckingOut] = useState(false);
  const [justUpgraded] = useState(() => new URLSearchParams(window.location.search).get('upgraded') === '1');

  useEffect(() => {
    if (justUpgraded) window.history.replaceState({}, '', '/');
  }, [justUpgraded]);

  const handleUpgrade = async () => {
    setCheckingOut(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (e) {
      alert(e.message);
      setCheckingOut(false);
    }
  };

  const btnBase = {
    width: '100%', border: 'none', borderRadius: 8, padding: '11px 0',
    fontWeight: 800, fontSize: 13, cursor: 'pointer',
  };

  if (!isLoaded) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>Loading...</div>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 30 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#f9fafb' }}>Sign in to access Gamma</div>
        <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', margin: 0 }}>
          Options flow, gamma exposure &amp; precise trade setups
        </p>
        <SignInButton mode="modal">
          <button style={{ ...btnBase, width: 'auto', padding: '10px 28px', background: '#6366f1', color: '#fff' }}>
            Sign In / Create Account
          </button>
        </SignInButton>
      </div>
    );
  }

  if (justUpgraded && !user.publicMetadata?.isPro) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 30 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#10b981' }}>Payment successful!</div>
        <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', margin: 0 }}>
          Your account is being activated. This takes a few seconds.
        </p>
        <button onClick={() => window.location.reload()} style={{ ...btnBase, width: 'auto', padding: '9px 24px', background: '#10b981', color: '#fff' }}>
          Reload to access Pro →
        </button>
      </div>
    );
  }

  if (!user.publicMetadata?.isPro) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '18px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.22)' }}>
          <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 12 }}>🔒 PRO FEATURE</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#f9fafb', marginBottom: 12 }}>Gamma Intelligence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
            {[
              'Options flow heat map (strike × expiry)',
              'Gamma exposure by strike',
              'Precise entry · TP · SL',
              'King node directional targets',
              'Put / call pressure scoring',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af' }}>
                <span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 26, fontFamily: 'monospace', fontWeight: 800, color: '#f9fafb', marginBottom: 14 }}>
            $19.99<span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}> / month</span>
          </div>
          <button onClick={handleUpgrade} disabled={checkingOut} style={{
            ...btnBase,
            background: checkingOut ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', opacity: checkingOut ? 0.8 : 1,
            cursor: checkingOut ? 'wait' : 'pointer',
          }}>
            {checkingOut ? 'Redirecting to Stripe...' : 'Start 7-Day Free Trial →'}
          </button>
          <p style={{ fontSize: 10, color: '#374151', textAlign: 'center', margin: '10px 0 0' }}>
            Cancel anytime · Secured by Stripe
          </p>
        </div>
      </div>
    );
  }

  return children;
}

const TICKER_GROUPS = [
  { label: "ETFs — Broad Market", tickers: ["SPY","QQQ","IWM","DIA","MDY","VOO","VTI"] },
  { label: "ETFs — Sector", tickers: ["XLF","XLK","XLE","XLV","XLI","XLU","XLP","XLB","XLRE","XLY","XLC"] },
  { label: "ETFs — International", tickers: ["EEM","EFA","IEMG","KWEB","MCHI","EWJ","EWZ","EWY","VEA","VWO"] },
  { label: "ETFs — Commodity", tickers: ["GLD","SLV","GDX","GDXJ","USO","UNG"] },
  { label: "ETFs — Fixed Income", tickers: ["TLT","HYG","LQD","IEF","SHY","AGG"] },
  { label: "ETFs — Leveraged & Vol", tickers: ["TQQQ","SQQQ","SPXL","SPXU","UPRO","UVXY","VXX","SVXY","SOXL","SOXS","LABU","LABD","FAS","FAZ"] },
  { label: "ETFs — Thematic", tickers: ["ARKK","ARKG","ARKF","ARKW","ARKQ","SMH","SOXX","IGV","CIBR","HACK"] },
  { label: "Mega Cap", tickers: ["AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","AVGO","ORCL"] },
  { label: "Semiconductors", tickers: ["AMD","INTC","QCOM","MU","AMAT","LRCX","KLAC","MRVL","SMCI","ARM","TXN","NXPI","ADI","MCHP","ON","MPWR"] },
  { label: "Software & Cloud", tickers: ["CRM","ADBE","NOW","WDAY","INTU","PLTR","AI","NET","SNOW","DDOG","CRWD","ZS","PANW","OKTA","FTNT","MDB"] },
  { label: "Fintech & Crypto", tickers: ["COIN","MSTR","HOOD","RIOT","MARA","CLSK","SOFI","UPST","AFRM"] },
  { label: "Financials", tickers: ["JPM","BAC","GS","MS","WFC","C","V","MA","AXP","BLK","COF","SCHW","BX","KKR"] },
  { label: "Healthcare", tickers: ["UNH","LLY","JNJ","PFE","ABBV","MRK","TMO","DHR","AMGN","GILD","ISRG","VRTX","REGN","MRNA"] },
  { label: "Consumer", tickers: ["HD","MCD","NKE","SBUX","WMT","COST","DIS","NFLX","BKNG","ABNB","UBER","LYFT","DASH","GM","F","RIVN"] },
  { label: "Energy", tickers: ["XOM","CVX","COP","EOG","SLB","OXY","VLO","PSX","HAL","DVN","LNG","MPC"] },
  { label: "Industrials & Defense", tickers: ["BA","CAT","GE","HON","RTX","LMT","NOC","GD","UNP","CSX","FDX","UPS","DE","MMM","ETN"] },
  { label: "Telecom & Media", tickers: ["T","VZ","TMUS","CMCSA","SNAP","PINS","RDDT","MTCH","PARA"] },
  { label: "REITs", tickers: ["AMT","PLD","EQIX","SPG","O","PSA","DLR","WELL","CCI","VICI"] },
  { label: "Materials", tickers: ["FCX","NEM","GOLD","AA","CLF","STLD","NUE","LIN","APD","ECL","ALB","SQM"] },
];

function GammaPanel({ stocks }) {
  const [symbol, setSymbol] = useState("SPY");
  const [expiry, setExpiry] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fmtGex = (n) => {
    if (n == null) return "—";
    const abs = Math.abs(n);
    const s = n >= 0 ? "+" : "-";
    if (abs >= 1e9) return `${s}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(0)}M`;
    return `${s}$${abs.toFixed(0)}`;
  };

  const fetchGamma = useCallback(async (sym, exp) => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const url = `/api/gamma?symbol=${sym}${exp ? `&expiry=${encodeURIComponent(exp)}` : ''}`;
      const res = await fetch(url);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGamma(symbol, expiry); }, [symbol, expiry, fetchGamma]);

  const spot = data?.spot;

  // v2.4 — derive entry/TP/SL from king nodes + key levels
  const buyTP = data?.buyKingNode?.strike ?? null;
  const sellTP = data?.sellKingNode?.strike ?? null;
  const buySL = (() => {
    if (!spot || !buyTP) return null;
    const pw = data?.putWall;
    if (pw && pw < spot && (spot - pw) < (buyTP - spot) * 3) return pw;
    return +(spot - (buyTP - spot) * 0.5).toFixed(2);
  })();
  const sellSL = (() => {
    if (!spot || !sellTP) return null;
    const cw = data?.callWall;
    if (cw && cw > spot && (cw - spot) < (spot - sellTP) * 3) return cw;
    return +(spot + (spot - sellTP) * 0.5).toFixed(2);
  })();
  const buyRR = spot && buyTP && buySL && spot > buySL
    ? +((buyTP - spot) / (spot - buySL)).toFixed(2) : null;
  const sellRR = spot && sellTP && sellSL && sellSL > spot
    ? +((spot - sellTP) / (sellSL - spot)).toFixed(2) : null;
  const fmtP = n => n != null ? `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}` : "—";
  const rrColor = rr => rr >= 2 ? "#10b981" : rr >= 1.5 ? "#f59e0b" : "#ef4444";

  // Determine highest-probability direction from bias score + P/C + GEX regime
  const bias = data?.biasScore ?? 0;
  const pcAdj = (() => {
    const pc = parseFloat(data?.pcVolumeRatio ?? 1);
    if (pc < 0.7) return 0.1;
    if (pc > 1.0) return -0.1;
    return 0;
  })();
  const gexAdj = (data?.netGex ?? 0) >= 0 ? 0.05 : -0.05;
  const composite = Math.max(-1, Math.min(1, bias + pcAdj + gexAdj));
  const longProb = Math.round(((composite + 1) / 2) * 100);
  const showLong = longProb >= 50;
  const setupProb = Math.min(85, Math.max(52, showLong ? longProb : 100 - longProb));
  const activeNode = showLong ? data?.buyKingNode : data?.sellKingNode;
  const activeTP = showLong ? buyTP : sellTP;
  const activeSL = showLong ? buySL : sellSL;
  const activeRR = showLong ? buyRR : sellRR;

  const selectStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, padding: "7px 10px", color: "#f9fafb", fontSize: 12,
    fontFamily: "monospace", outline: "none", cursor: "pointer", flex: 1,
  };

  const chipStyle = (active) => ({
    padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
    cursor: "pointer", border: "none",
    background: active ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.05)",
    color: active ? "#a5b4fc" : "#4b5563",
  });

  const fmtStrike = (n) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Grouped ticker dropdown + refresh */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={symbol}
          onChange={e => { setSymbol(e.target.value); setExpiry(null); }}
          style={selectStyle}
        >
          {TICKER_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.tickers.map(t => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          ))}
        </select>
        <button onClick={() => fetchGamma(symbol, expiry)} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, padding: "7px 12px", color: "#9ca3af", fontSize: 11,
          cursor: "pointer", fontWeight: 600,
        }}>↻</button>
      </div>

      {/* Expiry chips */}
      {data?.availableExpiries?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setExpiry(null)} style={chipStyle(!expiry)}>All</button>
          {data.availableExpiries.map(e => (
            <button key={e} onClick={() => setExpiry(e)} style={chipStyle(expiry === e)}>{e}</button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", color: "#4b5563", fontSize: 12, padding: 20 }}>Fetching options chain...</div>}
      {error && <div style={{ color: "#ef4444", fontSize: 11, padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</div>}

      {data && (
        <>
          {/* Compact one-line summary */}
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
            fontSize: 11, fontFamily: "monospace",
          }}>
            <span style={{ color: "#f9fafb", fontWeight: 700 }}>${spot?.toFixed(2)}</span>
            <span style={{ color: data.netGex >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
              {data.netGex >= 0 ? "+" : ""}{fmtGex(data.netGex)} GEX
            </span>
            {data.buyKingNode && (
              <span style={{ color: "#10b981" }}>
                ♛ BUY ${fmtStrike(data.buyKingNode.strike)} ▲{data.buyKingNode.distancePct}%
              </span>
            )}
            {data.sellKingNode && (
              <span style={{ color: "#ef4444" }}>
                ♛ SELL ${fmtStrike(data.sellKingNode.strike)} ▼{data.sellKingNode.distancePct}%
              </span>
            )}
            <span style={{ color: "#4b5563" }}>IV {data.impliedVol}%</span>
            {data.pcVolumeRatio && (
              <span style={{ color: parseFloat(data.pcVolumeRatio) > 1 ? "#ef4444" : parseFloat(data.pcVolumeRatio) < 0.7 ? "#10b981" : "#a5b4fc" }}>
                P/C {data.pcVolumeRatio}
              </span>
            )}
          </div>

          {/* v2.4 — Single highest-probability trade setup */}
          {activeNode && activeTP && activeSL && (
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: showLong ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
              border: `1px solid ${showLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}>
              {/* Header: direction label + probability % */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: showLong ? "#10b981" : "#ef4444", fontWeight: 800, letterSpacing: "0.1em" }}>
                  {showLong ? "▲ LONG SETUP" : "▼ SHORT SETUP"}
                </span>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 800, color: showLong ? "#10b981" : "#ef4444" }}>
                    {setupProb}%
                  </span>
                  <span style={{ fontSize: 9, color: "#4b5563", marginLeft: 4 }}>likely</span>
                </div>
              </div>
              {/* Confidence bar */}
              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 12 }}>
                <div style={{
                  width: `${setupProb}%`, height: "100%", borderRadius: 2,
                  background: showLong
                    ? "linear-gradient(90deg, #10b98155, #10b981)"
                    : "linear-gradient(90deg, #ef444455, #ef4444)",
                  transition: "width 0.6s ease",
                }} />
              </div>
              {/* Entry / TP / SL rows */}
              {[
                { label: "Entry", val: spot, pct: null, color: "#f9fafb" },
                {
                  label: "TP", val: activeTP,
                  pct: showLong ? `+${activeNode.distancePct}%` : `-${activeNode.distancePct}%`,
                  color: "#10b981",
                },
                {
                  label: "SL", val: activeSL,
                  pct: showLong
                    ? `-${((spot - activeSL) / spot * 100).toFixed(1)}%`
                    : `+${((activeSL - spot) / spot * 100).toFixed(1)}%`,
                  color: "#ef4444",
                },
              ].map(({ label, val, pct, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                  <span style={{ fontSize: 9, color: "#4b5563", width: 32, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color }}>{fmtP(val)}</span>
                  <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace", minWidth: 40, textAlign: "right" }}>{pct ?? ""}</span>
                </div>
              ))}
              {/* R:R */}
              {activeRR && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#4b5563" }}>Risk : Reward</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800, color: rrColor(activeRR) }}>{activeRR} : 1</span>
                </div>
              )}
            </div>
          )}

          {/* Heat map — king nodes highlighted as rows inside */}
          {data.heatmap?.cells?.length > 0 && (
            <OIHeatMap heatmap={data.heatmap} spot={spot} buyKingNode={data.buyKingNode} sellKingNode={data.sellKingNode} />
          )}
        </>
      )}
    </div>
  );
}

const TABS = ["Signals", "Portfolio", "Alerts", "Gamma"];

export default function App() {
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fe_watchlist")) || DEFAULT_WATCHLIST; }
    catch { return DEFAULT_WATCHLIST; }
  });
  const [addInput, setAddInput] = useState("");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [tab, setTab] = useState("Signals");

  useEffect(() => { localStorage.setItem("fe_watchlist", JSON.stringify(watchlist)); }, [watchlist]);

  const addToWatchlist = (raw) => {
    const sym = raw.trim().toUpperCase().replace(/[^A-Z.]/g, '');
    if (!sym || watchlist.includes(sym)) return;
    setWatchlist(prev => [...prev, sym]);
  };

  const removeFromWatchlist = (sym) => {
    setWatchlist(prev => prev.filter(s => s !== sym));
    setStocks(prev => prev.filter(s => s.symbol !== sym));
  };

  useEffect(() => {
    const p = setInterval(() => setPulse(x => !x), 1000);
    return () => clearInterval(p);
  }, []);

  const fetchStocks = useCallback(async () => {
    if (!watchlist.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes?symbols=${watchlist.join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const results = data?.quoteResponse?.result || [];
      if (!results.length) throw new Error("No data returned");
      setStocks(results);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [watchlist]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  const bullCount = stocks.filter(s => s.regularMarketChangePercent >= 0).length;
  const totalVol = stocks.reduce((s, d) => s + (d.regularMarketVolume || 0) * (d.regularMarketPrice || 0), 0);
  const avgChange = stocks.length ? stocks.reduce((s, d) => s + (d.regularMarketChangePercent || 0), 0) / stocks.length : 0;
  const isOpen = new Date().getHours() >= 9 && new Date().getHours() < 16;

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", fontFamily: "'DM Sans', sans-serif", color: "#f9fafb" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/icons/logo.png" alt="FlowEdge" style={{ width: 34, height: 34, borderRadius: 8 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>FlowEdge</div>
            <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em" }}>INSTITUTIONAL INTELLIGENCE</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: pulse ? (error ? "#ef4444" : "#10b981") : "#059669",
              boxShadow: pulse && !error ? "0 0 8px #10b981" : "none",
              transition: "all 0.5s"
            }} />
            <span style={{ fontSize: 11, color: error ? "#ef4444" : "#10b981", fontFamily: "monospace" }}>
              {loading ? "LOADING..." : error ? "ERROR" : `LIVE · ${lastUpdate}`}
            </span>
          </div>
          <button onClick={fetchStocks} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "6px 14px", color: "#9ca3af", fontSize: 11,
            cursor: "pointer", fontWeight: 600,
          }}>↻ Refresh</button>
          {CLERK_KEY && <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 32 }}>⬡</div>
          <div style={{ color: "#4b5563", fontSize: 13 }}>Loading live market data...</div>
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 12 }}>
          <div style={{ fontSize: 32 }}>⚠</div>
          <div style={{ color: "#ef4444", fontWeight: 700 }}>{error}</div>
          <button onClick={fetchStocks} style={{
            background: "#6366f1", border: "none", borderRadius: 8, padding: "10px 24px",
            color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
          }}>Try Again</button>
        </div>
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            padding: "18px 24px", gap: 24, borderBottom: "1px solid rgba(255,255,255,0.06)"
          }}>
            <StatBox label="Total Volume Value" value={fmt(totalVol)} color="#a5b4fc" sub="tracked tickers" />
            <StatBox label="Bullish" value={`${bullCount}/${stocks.length}`} color="#10b981" sub="positive today" />
            <StatBox label="Avg Change" value={pct(avgChange)} color={avgChange >= 0 ? "#10b981" : "#ef4444"} sub="across watchlist" />
            <StatBox label="Market" value={isOpen ? "OPEN" : "CLOSED"} color={isOpen ? "#10b981" : "#6b7280"} sub="US equities" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", minHeight: "calc(100vh - 190px)" }}>
            <div style={{ padding: 16, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingLeft: 4 }}>
                <span style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Live Prices · {watchlist.length} tickers
                </span>
              </div>
              {/* Add ticker to watchlist */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <input
                  list="all-tickers-dl"
                  value={addInput}
                  onChange={e => setAddInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && addInput.trim()) { addToWatchlist(addInput); setAddInput(""); } }}
                  placeholder="+ Add ticker…"
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)",
                    borderRadius: 6, padding: "6px 10px", color: "#9ca3af", fontSize: 11,
                    fontFamily: "monospace", outline: "none",
                  }}
                />
                <button
                  onClick={() => { if (addInput.trim()) { addToWatchlist(addInput); setAddInput(""); } }}
                  style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 6, padding: "6px 12px", color: "#a5b4fc",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>Add</button>
              </div>
              <datalist id="all-tickers-dl">
                {ALL_TICKERS.map(t => <option key={t} value={t} />)}
              </datalist>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {stocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} onRemove={() => removeFromWatchlist(s.symbol)} />)}
              </div>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", border: "none",
                    background: tab === t ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.02)",
                    color: tab === t ? "#a5b4fc" : "#4b5563",
                    borderRight: t !== "Gamma" ? "1px solid rgba(255,255,255,0.08)" : "none",
                    transition: "all 0.2s",
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {tab === "Signals" && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {stocks.slice(0, 5).map((s, i) => <SignalCard key={s.symbol} data={s} index={i} />)}
                    </div>
                    <div style={{
                      marginTop: 16, padding: 14, borderRadius: 8,
                      background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)"
                    }}>
                      <div style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>🔒 PRO FEATURES</div>
                      <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.7 }}>
                        Real-time sweep detection · Dark pool prints · Gamma exposure · Institutional flow alerts
                      </p>
                    </div>
                  </>
                )}
                {tab === "Portfolio" && <PortfolioPanel stocks={stocks} />}
                {tab === "Alerts" && <AlertsPanel stocks={stocks} />}
                {tab === "Gamma" && <ProGate><GammaPanel stocks={stocks} /></ProGate>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

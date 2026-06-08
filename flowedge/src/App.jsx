import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react";
import { SignInButton, UserButton } from "@clerk/clerk-react";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const AuthContext = createContext({
  isSignedIn: false,
  user: null,
  isLoaded: true,
  getToken: async () => null,
  clerkAvailable: false,
});

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

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

function ChartModal({ symbol, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#080b12', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, width: '95vw', maxWidth: 860, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{symbol}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <iframe
          key={symbol}
          src={`https://s.tradingview.com/widgetembed/?frameElementId=tv_${symbol}&symbol=${encodeURIComponent(symbol)}&interval=D&hidesidetoolbar=1&hidetoptoolbar=0&theme=dark&style=1&locale=en&hide_legend=0&save_image=0`}
          style={{ width: '100%', height: 440, border: 'none', display: 'block' }}
          allowTransparency="true"
          scrolling="no"
          title={`${symbol} chart`}
        />
      </div>
    </div>
  );
}

function StockCard({ data, index, onRemove, onChart, onTrade }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), index * 80); }, []);
  const up = data.regularMarketChangePercent >= 0;
  const color = up ? "#10b981" : "#ef4444";
  const rangePct = data.regularMarketDayHigh && data.regularMarketDayLow
    ? ((data.regularMarketPrice - data.regularMarketDayLow) / (data.regularMarketDayHigh - data.regularMarketDayLow)) * 100
    : 50;

  const now = Date.now() / 1000;
  const et = data.earningsTimestamp;
  const earningsDays = et && et > now && et < now + 14 * 86400
    ? Math.ceil((et - now) / 86400) : null;

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
            <div
              onClick={onChart}
              style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
              title="View chart"
            >{data.symbol}</div>
            {earningsDays !== null && (
              <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>
                EARN {earningsDays}D
              </span>
            )}
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
      {onTrade && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button onClick={() => onTrade(data.symbol, data.regularMarketPrice, 'buy')} style={{
            flex: 1, padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
            background: "rgba(16,185,129,0.15)", color: "#10b981", fontWeight: 800, fontSize: 11,
          }}>Buy</button>
          <button onClick={() => onTrade(data.symbol, data.regularMarketPrice, 'sell')} style={{
            flex: 1, padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
            background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 800, fontSize: 11,
          }}>Sell</button>
        </div>
      )}
    </div>
  );
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function SignalCard({ symbol, signal, index, now }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), index * 80); }, []);
  const { showLong, setupProb, activeTP, activeSL, rrCheck, iv, spot, scannedAt } = signal;
  const color = showLong ? "#10b981" : "#ef4444";
  const fmtS = n => n == null ? "—" : n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
  const barColor = setupProb >= 65 ? "#10b981" : setupProb >= 58 ? "#f59e0b" : color;

  const ageMs = (now || Date.now()) - scannedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const isStale = ageMs > 20 * 60 * 1000;
  const ageLabel = ageMin < 1 ? "just now" : `${ageMin}m ago`;

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8,
      background: showLong ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
      border: `1px solid ${isStale ? "rgba(255,255,255,0.08)" : color + "22"}`,
      borderLeft: `3px solid ${isStale ? "#374151" : color}`,
      opacity: vis ? (isStale ? 0.45 : 1) : 0,
      transform: vis ? "translateY(0)" : "translateY(8px)",
      transition: "all 0.4s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: isStale ? "#6b7280" : "#f9fafb" }}>{symbol}</span>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
            background: isStale ? "rgba(255,255,255,0.06)" : `${color}22`,
            color: isStale ? "#4b5563" : color,
            border: `1px solid ${isStale ? "rgba(255,255,255,0.08)" : color + "44"}`,
            letterSpacing: "0.08em",
          }}>{showLong ? "LONG" : "SHORT"}</span>
          {isStale && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4, background: "rgba(107,114,128,0.15)", color: "#6b7280", letterSpacing: "0.06em" }}>STALE</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: isStale ? "#374151" : "#4b5563", fontFamily: "monospace" }}>{ageLabel}</span>
          <div style={{ width: 50, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
            <div style={{ width: `${setupProb}%`, height: "100%", background: isStale ? "#374151" : barColor, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 12, color: isStale ? "#4b5563" : "#f9fafb", fontFamily: "monospace", fontWeight: 700 }}>{setupProb}%</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[["Entry", fmtS(spot)], ["Target", fmtS(activeTP)], ["Stop", fmtS(activeSL)], ["R:R", rrCheck ? `${rrCheck.toFixed(1)}:1` : "—"]].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: "#4b5563", letterSpacing: "0.07em", marginBottom: 1 }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: isStale ? "#4b5563" : "#f9fafb", fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>
      {iv > 45 && !isStale && <div style={{ marginTop: 6, fontSize: 10, color: "#f59e0b" }}>⚠ IV {iv}% — elevated, avoid buying premium</div>}
      {isStale && <div style={{ marginTop: 6, fontSize: 10, color: "#4b5563" }}>Signal is {ageMin}m old — rescan for fresh levels</div>}
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

function AccountPanel() {
  const { user, getToken } = useContext(AuthContext);
  const [referral, setReferral] = useState(null);
  const [loadingRef, setLoadingRef] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifStatus, setNotifStatus] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const fetchReferral = useCallback(async () => {
    setLoadingRef(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/referral', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.error) setReferral(data);
    } catch {}
    setLoadingRef(false);
  }, [getToken]);

  useEffect(() => { fetchReferral(); }, [fetchReferral]);

  const enableNotifs = async () => {
    const p = await Notification.requestPermission();
    setNotifStatus(p);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`https://flowedge-rgxp.vercel.app?ref=${referral.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const row = (label, val) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{val}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Subscription */}
      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10 }}>SUBSCRIPTION</div>
        {row('Plan', user?.publicMetadata?.isPro ? '✅ Pro' : 'Free')}
        {row('Email', user?.emailAddresses?.[0]?.emailAddress || '—')}
      </div>

      {/* Referral */}
      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 8 }}>REFER A FRIEND</div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px', lineHeight: 1.6 }}>
          Your friend gets 1 month free · You get 1 month free when they subscribe.
        </p>
        {loadingRef ? (
          <div style={{ fontSize: 12, color: '#4b5563' }}>Generating link…</div>
        ) : referral ? (
          <>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 7, padding: '9px 12px', fontSize: 12, fontFamily: 'monospace', color: '#c4b5fd', marginBottom: 10, wordBreak: 'break-all' }}>
              flowedge-rgxp.vercel.app?ref={referral.code}
            </div>
            <button onClick={copyLink} style={{
              width: '100%', borderRadius: 8, padding: '9px 0', fontWeight: 800, fontSize: 12, cursor: 'pointer',
              background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.35)'}`,
              color: copied ? '#10b981' : '#a5b4fc',
            }}>{copied ? '✓ Copied!' : 'Copy Referral Link'}</button>
            {referral.referralCount > 0 && (
              <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 8 }}>
                {referral.referralCount} referral{referral.referralCount > 1 ? 's' : ''}
              </div>
            )}
          </>
        ) : (
          <button onClick={fetchReferral} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Generate my referral link →
          </button>
        )}
      </div>

      {/* Broker */}
      <BrokerSection getToken={getToken} />

      {/* Notifications */}
      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10 }}>NOTIFICATIONS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {notifStatus === 'granted' ? '✅ Enabled' : notifStatus === 'denied' ? '🚫 Blocked' : 'Not enabled'}
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>Alert notifications</div>
          </div>
          {notifStatus === 'default' && (
            <button onClick={enableNotifs} style={{
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8, padding: '7px 14px', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Enable</button>
          )}
          {notifStatus === 'denied' && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>Enable in browser settings</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TradeModal({ symbol, price, initialSide, onClose, getToken, onFilled }) {
  const [side, setSide] = useState(initialSide || 'buy');
  const [qty, setQty] = useState('1');
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState(price ? price.toFixed(2) : '');
  const [submitting, setSubmitting] = useState(false);
  const [filled, setFilled] = useState(null);
  const [err, setErr] = useState('');

  const estPrice = orderType === 'limit' ? parseFloat(limitPrice || 0) : (price || 0);
  const total = parseFloat(qty || 0) * estPrice;

  const submit = async () => {
    setSubmitting(true); setErr('');
    try {
      const token = await getToken();
      const res = await fetch('/api/broker-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, qty, side, type: orderType, limitPrice: orderType === 'limit' ? limitPrice : undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFilled(data.order);
      onFilled?.();
    } catch (e) { setErr(e.message); }
    finally { setSubmitting(false); }
  };

  const inp = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7, padding: '9px 11px', color: '#f9fafb', fontSize: 14,
    fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0f1219', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 36px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{symbol}</span>
            {price && <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8, fontFamily: 'monospace' }}>${price.toFixed(2)}</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {filled ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#10b981', marginBottom: 6 }}>Order Submitted</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {filled.side?.toUpperCase()} {filled.qty} {filled.symbol} · {filled.type?.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>Status: {filled.status}</div>
            <button onClick={onClose} style={{ marginTop: 18, background: '#10b981', border: 'none', borderRadius: 9, padding: '10px 28px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Done</button>
          </div>
        ) : (
          <>
            {/* Buy / Sell toggle */}
            <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 14 }}>
              {['buy', 'sell'].map(s => (
                <button key={s} onClick={() => setSide(s)} style={{
                  flex: 1, padding: '10px 0', fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: side === s ? (s === 'buy' ? '#10b981' : '#ef4444') : 'rgba(255,255,255,0.03)',
                  color: side === s ? '#fff' : '#4b5563',
                }}>{s}</button>
              ))}
            </div>

            {/* Order type */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {['market', 'limit'].map(t => (
                <button key={t} onClick={() => setOrderType(t)} style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer',
                  textTransform: 'uppercase',
                  background: orderType === t ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                  color: orderType === t ? '#a5b4fc' : '#4b5563',
                }}>{t}</button>
              ))}
            </div>

            {/* Qty + limit price */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 4 }}>SHARES</div>
                <input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} style={inp} />
              </div>
              {orderType === 'limit' && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 4 }}>LIMIT PRICE</div>
                  <input type="number" min="0.01" step="0.01" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} style={inp} />
                </div>
              )}
            </div>

            {/* Est. total */}
            {total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginBottom: 14, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Est. {orderType === 'market' ? 'Value' : 'Total'}</span>
                <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>${total.toFixed(2)}</span>
              </div>
            )}

            {err && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 10, padding: '8px 10px', borderRadius: 7, background: 'rgba(239,68,68,0.08)' }}>{err}</div>}

            <button onClick={submit} disabled={submitting || !qty || parseFloat(qty) <= 0} style={{
              width: '100%', border: 'none', borderRadius: 10, padding: '13px 0', fontWeight: 800, fontSize: 14,
              cursor: submitting ? 'wait' : 'pointer',
              background: side === 'buy' ? '#10b981' : '#ef4444',
              color: '#fff', opacity: submitting ? 0.7 : 1,
            }}>{submitting ? 'Placing order…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}</button>
          </>
        )}
      </div>
    </div>
  );
}

function BrokerSection({ getToken }) {
  const [status, setStatus] = useState(null);
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ key: '', secret: '', mode: 'paper' });
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const r = await fetch('/api/broker-connect', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setStatus(d);
      if (d.connected) {
        const r2 = await fetch('/api/broker-account', { headers: { Authorization: `Bearer ${token}` } });
        const d2 = await r2.json();
        if (!d2.error) setAccount(d2);
      }
    } catch {}
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    if (!form.key || !form.secret) return;
    setConnecting(true); setErr('');
    try {
      const token = await getToken();
      const res = await fetch('/api/broker-connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alpacaKey: form.key, alpacaSecret: form.secret, mode: form.mode }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setShowForm(false);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect your Alpaca account?')) return;
    const token = await getToken();
    await fetch('/api/broker-connect', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setStatus(null); setAccount(null);
  };

  const inp = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '8px 10px', color: '#f9fafb', fontSize: 12,
    fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const fmtMoney = n => n != null ? `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.08em' }}>BROKER (ALPACA)</div>
        {status?.connected && (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>
            {account?.mode === 'live' ? 'LIVE' : 'PAPER'}
          </span>
        )}
      </div>

      {!status?.connected && !showForm && (
        <>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px', lineHeight: 1.6 }}>
            Connect your Alpaca account to place trades directly from FlowEdge. Free paper trading available instantly.
          </p>
          <button onClick={() => setShowForm(true)} style={{
            width: '100%', borderRadius: 8, padding: '9px 0', fontWeight: 800, fontSize: 12, cursor: 'pointer',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc',
          }}>Connect Alpaca Account →</button>
        </>
      )}

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
            {['paper', 'live'].map(m => (
              <button key={m} onClick={() => setForm(f => ({ ...f, mode: m }))} style={{
                flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                textTransform: 'uppercase',
                background: form.mode === m ? (m === 'live' ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)') : 'rgba(255,255,255,0.03)',
                color: form.mode === m ? (m === 'live' ? '#ef4444' : '#a5b4fc') : '#4b5563',
              }}>{m === 'paper' ? 'Paper Trading' : 'Live Trading'}</button>
            ))}
          </div>
          <input placeholder="Alpaca API Key ID" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} style={inp} />
          <input placeholder="Alpaca Secret Key" type="password" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} style={inp} />
          {form.mode === 'live' && (
            <div style={{ fontSize: 10, color: '#f59e0b', padding: '6px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              ⚠ Live mode places real orders with real money
            </div>
          )}
          {err && <div style={{ fontSize: 11, color: '#ef4444' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={connect} disabled={connecting} style={{
              flex: 2, background: '#6366f1', border: 'none', borderRadius: 7, padding: '9px 0',
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, opacity: connecting ? 0.7 : 1,
            }}>{connecting ? 'Verifying…' : 'Connect'}</button>
            <button onClick={() => { setShowForm(false); setErr(''); }} style={{
              flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7, padding: '9px 0', color: '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Cancel</button>
          </div>
          <div style={{ fontSize: 10, color: '#374151', textAlign: 'center' }}>
            Get your keys at alpaca.markets → API Keys
          </div>
        </div>
      )}

      {status?.connected && account && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Portfolio Value', fmtMoney(account.account?.portfolio_value)],
              ['Buying Power', fmtMoney(account.account?.buying_power)],
              ['Day P&L', fmtMoney(account.account?.unrealized_intraday_pl)],
              ['Positions', account.positions?.length ?? 0],
            ].map(([label, val]) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          {account.positions?.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 6, letterSpacing: '0.08em' }}>OPEN POSITIONS</div>
              {account.positions.map(p => {
                const pl = parseFloat(p.unrealized_pl || 0);
                const c = pl >= 0 ? '#10b981' : '#ef4444';
                return (
                  <div key={p.symbol} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{p.symbol}</span>
                      <span style={{ fontSize: 10, color: '#4b5563', marginLeft: 6 }}>{p.qty} shares</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontFamily: 'monospace' }}>${parseFloat(p.current_price).toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: c, fontFamily: 'monospace' }}>{pl >= 0 ? '+' : ''}${pl.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {account.orders?.filter(o => ['new','partially_filled','pending_new'].includes(o.status)).length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 6, letterSpacing: '0.08em' }}>PENDING ORDERS</div>
              {account.orders.filter(o => ['new','partially_filled','pending_new'].includes(o.status)).map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{o.symbol}</span>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{o.side?.toUpperCase()} {o.qty} · {o.type?.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={load} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 0', color: '#9ca3af', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>↻ Refresh</button>
            <button onClick={disconnect} style={{ flex: 1, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '7px 0', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Disconnect</button>
          </div>
        </div>
      )}

      {status?.connected && !account && (
        <div style={{ fontSize: 12, color: '#4b5563', textAlign: 'center', padding: '12px 0' }}>Loading account…</div>
      )}
    </div>
  );
}



function ProGate({ children }) {
  if (!CLERK_KEY) return children;
  return <ProGateInner>{children}</ProGateInner>;
}

function ProGateInner({ children }) {
  const { isSignedIn, user, isLoaded, getToken, clerkAvailable } = useContext(AuthContext);
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
        {clerkAvailable ? (
          <SignInButton mode="modal">
            <button style={{ ...btnBase, width: 'auto', padding: '10px 28px', background: '#6366f1', color: '#fff' }}>
              Sign In / Create Account
            </button>
          </SignInButton>
        ) : (
          <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
            Authentication unavailable — reload to try again
          </div>
        )}
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

// Pure scoring function — shared by GammaPanel (display) and signal scanner (bulk)
function scoreGammaData(d) {
  if (!d || !d.spot) return null;
  const spot = d.spot;
  const bias = d.biasScore ?? 0;
  const pcRaw = parseFloat(d.pcVolumeRatio ?? 1);
  const pcScore = pcRaw < 0.5 ? -0.9 : pcRaw < 0.7 ? -0.6 : pcRaw < 0.9 ? -0.3
    : pcRaw < 1.1 ? 0 : pcRaw < 1.3 ? 0.3 : pcRaw < 1.6 ? 0.6 : 0.9;
  const composite = bias * 0.55 - pcScore * 0.45;
  const showLong = composite >= 0;
  const confidence = Math.abs(composite);
  const gexBullish = bias > 0.10, gexBearish = bias < -0.10;
  const pcBullish = pcScore < -0.15, pcBearish = pcScore > 0.15;
  const directionAgrees = (showLong && gexBullish && pcBullish) || (!showLong && gexBearish && pcBearish);
  const buyDistPct = d.buyKingNode?.distancePct ?? 0;
  const sellDistPct = d.sellKingNode?.distancePct ?? 0;
  const activeDistPct = showLong ? buyDistPct : sellDistPct;
  const distQuality = activeDistPct < 1 ? 0.1 : activeDistPct < 2 ? 0.5 : activeDistPct < 5 ? 1.0 : activeDistPct < 8 ? 0.6 : 0.2;
  const fl = d.flipLevel;
  const flipPenalty = !fl ? 0 : (() => { const dist = Math.abs(spot - fl) / spot * 100; return dist < 1 ? 0.9 : dist < 2 ? 0.5 : dist < 3 ? 0.2 : 0; })();
  const buyTP = d.buyKingNode?.strike ?? null;
  const sellTP = d.sellKingNode?.strike ?? null;
  const atr = d.atr14;
  const buySL = (() => {
    if (!spot || !buyTP) return null;
    if (atr) return +(spot - atr * 1.5).toFixed(2);
    const pw = d.putWall; if (pw && pw < spot && (spot - pw) < (buyTP - spot) * 3) return pw;
    return +(spot - (buyTP - spot) * 0.5).toFixed(2);
  })();
  const sellSL = (() => {
    if (!spot || !sellTP) return null;
    if (atr) return +(spot + atr * 1.5).toFixed(2);
    const cw = d.callWall; if (cw && cw > spot && (cw - spot) < (spot - sellTP) * 3) return cw;
    return +(spot + (spot - sellTP) * 0.5).toFixed(2);
  })();
  const activeTP = showLong ? buyTP : sellTP;
  const activeSL = showLong ? buySL : sellSL;
  const rrCheck = (() => {
    if (!spot || !activeTP || !activeSL) return 0;
    if (showLong && spot > activeSL) return (activeTP - spot) / (spot - activeSL);
    if (!showLong && activeSL > spot) return (spot - activeTP) / (activeSL - spot);
    return 0;
  })();
  const hasEdge = directionAgrees && confidence >= 0.25 && distQuality >= 0.4 && flipPenalty < 0.5 && rrCheck >= 1.0;
  const setupProb = hasEdge
    ? Math.min(74, Math.round(52 + confidence * 16 + (distQuality - 0.5) * 4 + Math.min(rrCheck - 1.0, 1) * 3))
    : null;
  return {
    hasEdge, setupProb, showLong, composite, confidence, spot,
    activeTP, activeSL, rrCheck: +rrCheck.toFixed(2), iv: d.impliedVol ?? 0,
    activeDistPct, pcRaw, biasScore: bias, atr,
  };
}

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

  // Auto-refresh gamma every 60 seconds
  const [gammaRefreshIn, setGammaRefreshIn] = useState(60);
  const gammaTimerRef = useRef(null);
  useEffect(() => {
    setGammaRefreshIn(60);
    gammaTimerRef.current = setInterval(() => {
      setGammaRefreshIn(prev => {
        if (prev <= 1) {
          if (!loading) fetchGamma(symbol, expiry);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(gammaTimerRef.current);
  }, [symbol, expiry, fetchGamma]);

  const spot = data?.spot;
  const fmtP = n => n != null ? `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}` : "—";
  const rrColor = rr => rr >= 2 ? "#10b981" : rr >= 1.5 ? "#f59e0b" : "#ef4444";

  // Use shared scorer — keeps GammaPanel and signal scanner in sync
  const scored = scoreGammaData(data);
  const {
    hasEdge = false, setupProb = null, showLong = true, composite = 0,
    confidence = 0, activeTP = null, activeSL = null, rrCheck = 0, iv = 25,
    activeDistPct = 0, pcRaw = 1, biasScore: bias = 0,
  } = scored ?? {};
  const activeTPval = activeTP, activeSLval = activeSL;

  // Surface-level values for the UI displays below
  const gexBullish = bias > 0.10, gexBearish = bias < -0.10;
  const pcScore = pcRaw < 0.5 ? -0.9 : pcRaw < 0.7 ? -0.6 : pcRaw < 0.9 ? -0.3
    : pcRaw < 1.1 ? 0 : pcRaw < 1.3 ? 0.3 : pcRaw < 1.6 ? 0.6 : 0.9;
  const pcBullish = pcScore < -0.15, pcBearish = pcScore > 0.15;
  const flipPenalty = (() => {
    const fl = data?.flipLevel; if (!fl || !spot) return 0;
    const d = Math.abs(spot - fl) / spot * 100; return d < 1 ? 0.9 : d < 2 ? 0.5 : d < 3 ? 0.2 : 0;
  })();

  // Warning flags — surface what's working against the trade
  const warnings = [];
  if (data) {
    if (!gexBullish && !gexBearish) warnings.push(`GEX bias near zero — no strong directional lean from options positioning`);
    if (showLong && !pcBullish) warnings.push(`P/C ${pcRaw.toFixed(2)} — put flow present, conflicts with long`);
    if (!showLong && !pcBearish) warnings.push(`P/C ${pcRaw.toFixed(2)} — call flow present, conflicts with short`);
    if (flipPenalty >= 0.4) warnings.push(`Spot near GEX flip $${data?.flipLevel?.toFixed(0)} — volatility zone, avoid`);
    if (activeDistPct > 0 && activeDistPct < 1.5) warnings.push(`King node only ${activeDistPct.toFixed(1)}% away — too close, weak magnet`);
    if (activeDistPct > 8) warnings.push(`King node ${activeDistPct.toFixed(1)}% away — stretch target`);
    if (rrCheck > 0 && rrCheck < 1.0) warnings.push(`R:R ${rrCheck.toFixed(1)}:1 — minimum 1:1 required`);
    if (iv > 50) warnings.push(`IV ${iv}% elevated — avoid buying options premium`);
  }

  const buyTP = data?.buyKingNode?.strike ?? null;
  const sellTP = data?.sellKingNode?.strike ?? null;
  const activeNode = showLong ? data?.buyKingNode : data?.sellKingNode;
  const activeRR = rrCheck > 0 ? +rrCheck.toFixed(2) : null;

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
        <button onClick={() => { fetchGamma(symbol, expiry); setGammaRefreshIn(60); }} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, padding: "7px 10px", color: "#9ca3af", fontSize: 10,
          cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
        }}>{loading ? "…" : `↻ ${gammaRefreshIn}s`}</button>
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

          {/* Setup card — shows edge when signals agree, else warns to stay out */}
          {!hasEdge ? (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 800, letterSpacing: "0.1em" }}>⊘ NO CLEAR EDGE — STAY OUT</span>
                <span style={{ fontSize: 9, color: "#374151", fontFamily: "monospace" }}>conf {(confidence * 100).toFixed(0)}%</span>
              </div>
              {warnings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span><span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {!warnings.length && (
                <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>GEX and options flow are not aligned. Wait for both to agree before entering.</p>
              )}
            </div>
          ) : activeNode && activeTP && activeSL && (
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
                  <span style={{ fontSize: 9, color: "#4b5563", marginLeft: 4 }}>edge score</span>
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
              {/* Warnings even on valid setups */}
              {warnings.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: 3 }}>
                  {warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#f59e0b", display: "flex", alignItems: "flex-start", gap: 5 }}>
                      <span style={{ flexShrink: 0 }}>⚠</span><span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Heat map — king nodes highlighted as rows inside */}
          {data.heatmap?.cells?.length > 0 && (
            <OIHeatMap heatmap={data.heatmap} spot={spot} buyKingNode={data.buyKingNode} sellKingNode={data.sellKingNode} />
          )}

          {/* King node forecast line chart */}
          {data.heatmap?.cells?.length > 0 && spot && (
            <KingNodeForecast symbol={symbol} heatmap={data.heatmap} spot={spot} />
          )}
        </>
      )}
    </div>
  );
}

function KingNodeForecast({ symbol, heatmap, spot }) {
  const nodes = useMemo(() => {
    if (!heatmap?.cells?.length) return [];
    const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const now = new Date();
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() + 36);

    const byExpiry = {};
    heatmap.cells.forEach(c => {
      if (!byExpiry[c.expiry]) byExpiry[c.expiry] = { buy: null, sell: null };
      const e = byExpiry[c.expiry];
      if (c.gex > 0 && (!e.buy || c.gex > e.buy.gex)) e.buy = c;
      if (c.gex < 0 && (!e.sell || c.gex < e.sell.gex)) e.sell = c;
    });

    return Object.entries(byExpiry).map(([expiry, { buy, sell }]) => {
      const parts = expiry.trim().split(/\s+/);
      const month = MONTHS[parts[0]]; const day = parseInt(parts[1]);
      if (!month || !day) return null;
      const year = now.getFullYear() + (month < now.getMonth() - 1 ? 1 : 0);
      const date = new Date(year, month - 1, day);
      if (date <= now || date > cutoff) return null;
      return { expiry, date, buyStrike: buy?.strike ?? null, sellStrike: sell?.strike ?? null };
    }).filter(Boolean).sort((a, b) => a.date - b.date);
  }, [heatmap]);

  if (nodes.length < 2) return null;

  const VW = 420, VH = 210;
  const PAD = { top: 28, right: 38, bottom: 44, left: 54 };
  const cw = VW - PAD.left - PAD.right, ch = VH - PAD.top - PAD.bottom;

  const allV = [spot, ...nodes.flatMap(n => [n.buyStrike, n.sellStrike])].filter(v => v != null);
  const yMin = Math.min(...allV) * 0.983, yMax = Math.max(...allV) * 1.017;
  const xOf = i => PAD.left + (nodes.length > 1 ? (i / (nodes.length - 1)) * cw : cw / 2);
  const yOf = v => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch;

  const buyPts  = nodes.map((n, i) => n.buyStrike  != null ? { x: xOf(i), y: yOf(n.buyStrike),  v: n.buyStrike  } : null);
  const sellPts = nodes.map((n, i) => n.sellStrike != null ? { x: xOf(i), y: yOf(n.sellStrike), v: n.sellStrike } : null);
  const pts2str = pts => pts.filter(Boolean).map(p => `${p.x},${p.y}`).join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ y: yOf(yMin + t*(yMax-yMin)), v: yMin + t*(yMax-yMin) }));
  const fmtD = d => { const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${M[d.getMonth()]} ${d.getDate()}`; };
  const fmtS = v => v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(1)}`;
  const spotY = yOf(spot);

  // Zone polygon between buy and sell
  const zonePts = [
    ...buyPts.filter(Boolean).map(p => `${p.x},${p.y}`),
    ...sellPts.filter(Boolean).reverse().map(p => `${p.x},${p.y}`),
  ].join(' ');

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 9, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8 }}>
        ♛ KING NODE FORECAST · {symbol} · NEXT {nodes.length} EXPIRATIONS
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 4px 4px', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">

          {/* Grid */}
          {yTicks.map(({ y, v }, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3.5} fontSize={9} fill="#374151" textAnchor="end" fontFamily="monospace">{fmtS(v)}</text>
            </g>
          ))}

          {/* Zone fill */}
          {zonePts && <polygon points={zonePts} fill="rgba(99,102,241,0.07)" />}

          {/* Spot line */}
          <line x1={PAD.left} y1={spotY} x2={VW - PAD.right} y2={spotY} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6,4" strokeOpacity={0.75} />
          <text x={VW - PAD.right + 4} y={spotY + 3.5} fontSize={8} fill="#f59e0b" fontFamily="monospace">${spot?.toFixed(0)}</text>

          {/* Buy king line + area */}
          {buyPts.filter(Boolean).length > 1 && (
            <polyline points={pts2str(buyPts)} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9} />
          )}

          {/* Sell king line */}
          {sellPts.filter(Boolean).length > 1 && (
            <polyline points={pts2str(sellPts)} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9} />
          )}

          {/* Vertical drop lines */}
          {nodes.map((n, i) => (
            <line key={i} x1={xOf(i)} y1={PAD.top + ch} x2={xOf(i)} y2={PAD.top + ch + 6} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          ))}

          {/* Buy king dots + labels */}
          {buyPts.map((p, i) => p && (
            <g key={`b${i}`}>
              <circle cx={p.x} cy={p.y} r={5.5} fill="#0a0f17" stroke="#10b981" strokeWidth={2} />
              <text x={p.x} y={p.y - 10} fontSize={9} fill="#10b981" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{fmtS(p.v)}</text>
            </g>
          ))}

          {/* Sell king dots + labels */}
          {sellPts.map((p, i) => p && (
            <g key={`s${i}`}>
              <circle cx={p.x} cy={p.y} r={5.5} fill="#0a0f17" stroke="#ef4444" strokeWidth={2} />
              <text x={p.x} y={p.y + 19} fontSize={9} fill="#ef4444" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{fmtS(p.v)}</text>
            </g>
          ))}

          {/* X axis date labels */}
          {nodes.map((n, i) => (
            <text key={i} x={xOf(i)} y={VH - PAD.bottom + 16}
              fontSize={9} fill="#4b5563" textAnchor={nodes.length > 7 ? 'end' : 'middle'} fontFamily="monospace"
              transform={nodes.length > 7 ? `rotate(-38,${xOf(i)},${VH-PAD.bottom+16})` : ''}>
              {fmtD(n.date)}
            </text>
          ))}

          {/* Axes */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top+ch} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <line x1={PAD.left} y1={PAD.top+ch} x2={VW-PAD.right} y2={PAD.top+ch} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 9, fontFamily: 'monospace', flexWrap: 'wrap' }}>
        <span style={{ color: '#10b981' }}>♛ Buy King — support magnet</span>
        <span style={{ color: '#ef4444' }}>♛ Sell King — resistance</span>
        <span style={{ color: '#f59e0b' }}>— Spot</span>
        <span style={{ color: '#6366f1' }}>▪ Forecast zone</span>
      </div>
    </div>
  );
}

function DarkPoolPanel({ stocks }) {
  const now = new Date();
  const marketOpen = new Date(); marketOpen.setHours(9, 30, 0, 0);
  const marketClose = new Date(); marketClose.setHours(16, 0, 0, 0);
  const elapsed = Math.max((now - marketOpen) / (marketClose - marketOpen), 0.05);
  const isMarketHours = now >= marketOpen && now <= marketClose;

  const scored = stocks
    .filter(s => s.regularMarketVolume && (s.averageDailyVolume3Month || s.averageDailyVolume10Day))
    .map(s => {
      const avgVol = s.averageDailyVolume3Month || s.averageDailyVolume10Day || 1;
      const projectedVol = isMarketHours ? s.regularMarketVolume / elapsed : s.regularMarketVolume;
      const volRatio = projectedVol / avgVol;
      const priceImpact = Math.abs(s.regularMarketChangePercent || 0.01);
      const score = (volRatio * 10) / Math.max(priceImpact, 0.1);
      return { ...s, volRatio, priceImpact, score };
    })
    .sort((a, b) => b.score - a.score);

  const getSignal = (score) => {
    if (score > 80) return { label: "STRONG", color: "#ef4444" };
    if (score > 40) return { label: "MODERATE", color: "#f59e0b" };
    if (score > 15) return { label: "WEAK", color: "#10b981" };
    return { label: "NORMAL", color: "#374151" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", fontSize: 10, color: "#6b7280", lineHeight: 1.7 }}>
        <strong style={{ color: "#a5b4fc" }}>Dark Pool Score</strong> — Volume anomaly ÷ price impact. High score = large volume with minimal price movement, the hallmark of institutional dark pool activity.
      </div>
      {scored.length === 0 && (
        <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", padding: 20 }}>No volume data available yet.</div>
      )}
      {scored.map(s => {
        const { label, color } = getSignal(s.score);
        const barW = Math.min(s.score / 100, 1) * 100;
        const up = s.regularMarketChangePercent >= 0;
        return (
          <div key={s.symbol} style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#f9fafb" }}>{s.symbol}</span>
                <span style={{ fontSize: 10, color: "#4b5563", marginLeft: 6 }}>{(s.shortName || "").slice(0, 20)}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 17, fontFamily: "monospace", fontWeight: 700, color: "#f9fafb" }}>{s.score.toFixed(0)}</div>
              </div>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 8 }}>
              <div style={{ width: `${barW}%`, height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${color}44, ${color})` }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              {[
                ["VOL RATIO", `${s.volRatio.toFixed(2)}×`, s.volRatio > 1.5 ? "#fbbf24" : "#9ca3af"],
                ["PRICE ΔIMPACT", `${s.priceImpact.toFixed(2)}%`, up ? "#10b981" : "#ef4444"],
                ["TODAY VOL", fmt(s.regularMarketVolume), "#9ca3af"],
                ["AVG VOL", fmt(s.averageDailyVolume3Month || s.averageDailyVolume10Day), "#4b5563"],
              ].map(([lbl, val, c]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 8, color: "#374151", marginBottom: 2 }}>{lbl}</div>
                  <div style={{ fontSize: 10, fontFamily: "monospace", color: c }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SignalsPanel({ scanResults, scanning, scanProgress, watchlist, onRescan }) {
  const now = useNow(60000);
  const edgeTickers = watchlist
    .filter(sym => scanResults[sym]?.hasEdge)
    .sort((a, b) => (scanResults[b].setupProb ?? 0) - (scanResults[a].setupProb ?? 0));
  const noEdgeTickers = watchlist.filter(sym => scanResults[sym] && !scanResults[sym].hasEdge);
  const pendingTickers = watchlist.filter(sym => !scanResults[sym]);
  const allDone = !scanning && pendingTickers.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          GEX-Scored Signals
        </span>
        {scanning ? (
          <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "monospace" }}>
            scanning {scanProgress.done}/{scanProgress.total}…
          </span>
        ) : (
          <button onClick={onRescan} style={{
            background: "none", border: "none", color: "#4b5563", fontSize: 10,
            cursor: "pointer", padding: 0,
          }}>↻ rescan</button>
        )}
      </div>

      {edgeTickers.map((sym, i) => (
        <SignalCard key={sym} symbol={sym} signal={scanResults[sym]} index={i} now={now} />
      ))}

      {allDone && edgeTickers.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>No clear edge in watchlist</div>
          <div style={{ fontSize: 10, color: "#374151" }}>GEX bias and P/C flow must agree on direction for a signal to appear</div>
        </div>
      )}

      {(noEdgeTickers.length > 0 || pendingTickers.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
          {noEdgeTickers.map(sym => (
            <span key={sym} style={{ fontSize: 10, fontFamily: "monospace", color: "#374151", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 4, padding: "3px 7px" }}>{sym}</span>
          ))}
          {pendingTickers.map(sym => (
            <span key={sym} style={{ fontSize: 10, fontFamily: "monospace", color: "#1f2937", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 4, padding: "3px 7px" }}>{sym}…</span>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ["Signals", "Portfolio", "Alerts", "Gamma", "Dark Pool", "Account"];

export default function App() {
  const isMobile = useIsMobile();
  const { isSignedIn, user, getToken, clerkAvailable } = useContext(AuthContext);

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
  const [tab, setTab] = useState("Watch");
  const [chartSymbol, setChartSymbol] = useState(null);
  const [tradeTarget, setTradeTarget] = useState(null);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const syncTimer = useRef(null);

  // ── Signal scanner ──────────────────────────────────────────────────────
  const [scanResults, setScanResults] = useState({});
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const scanActiveRef = useRef(false);
  const watchlistRef = useRef(watchlist);
  const scanResultsRef = useRef({});
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  const triggerScan = useCallback(async (force = false) => {
    if (scanActiveRef.current) return;
    scanActiveRef.current = true;
    setScanning(true);
    const CACHE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const queue = force
      ? [...watchlistRef.current]
      : watchlistRef.current.filter(sym => {
          const r = scanResultsRef.current[sym];
          return !r || (now - r.scannedAt) > CACHE_MS;
        });
    setScanProgress({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      const sym = queue[i];
      try {
        const res = await fetch(`/api/gamma?symbol=${sym}`);
        const d = await res.json();
        if (!d.error) {
          const scored = scoreGammaData(d);
          if (scored) {
            const entry = { ...scored, scannedAt: now };
            scanResultsRef.current = { ...scanResultsRef.current, [sym]: entry };
            setScanResults(prev => ({ ...prev, [sym]: entry }));
          }
        }
      } catch {}
      setScanProgress({ done: i + 1, total: queue.length });
      if (i < queue.length - 1) await new Promise(r => setTimeout(r, 350));
    }
    scanActiveRef.current = false;
    setScanning(false);
  }, []);

  // Scan when Signals tab opens
  useEffect(() => {
    if (tab === 'Signals') triggerScan();
  }, [tab]);

  // Request notification permission on first Signals tab visit
  useEffect(() => {
    if (tab === 'Signals' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [tab]);

  // Background scan every 5 min — fires alerts even when user is on a different tab
  useEffect(() => {
    const interval = setInterval(() => triggerScan(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [triggerScan]);

  // Fire push notification when a new edge signal appears (or direction flips)
  const prevSignalsRef = useRef({});
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      prevSignalsRef.current = { ...scanResults };
      return;
    }
    Object.entries(scanResults).forEach(([sym, result]) => {
      if (!result.hasEdge) return;
      const prev = prevSignalsRef.current[sym];
      const isNew = !prev?.hasEdge || prev.showLong !== result.showLong;
      if (!isNew) return;
      const dir = result.showLong ? '▲ LONG' : '▼ SHORT';
      const body = `${dir} · ${result.setupProb}% · ${result.rrCheck.toFixed(1)}:1 R:R · Entry $${result.spot?.toFixed(2)}`;
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(`FlowEdge: ${sym}`, {
            body, icon: '/icons/logo.png', badge: '/icons/logo.png',
            tag: `signal-${sym}`, renotify: true,
          });
        }).catch(() => new Notification(`FlowEdge: ${sym}`, { body }));
      } else {
        new Notification(`FlowEdge: ${sym}`, { body });
      }
    });
    prevSignalsRef.current = { ...scanResults };
  }, [scanResults]);

  // Persist watchlist to localStorage
  useEffect(() => { localStorage.setItem("fe_watchlist", JSON.stringify(watchlist)); }, [watchlist]);

  // Load watchlist from cloud on sign-in, then keep it synced
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/watchlist', { headers: { Authorization: `Bearer ${token}` } });
        const { watchlist: cloud } = await res.json();
        if (cloud?.length) setWatchlist(cloud);
      } catch {}
    })();
  }, [isSignedIn]);

  // Debounced cloud save on watchlist change
  useEffect(() => {
    if (!isSignedIn) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const token = await getToken();
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchlist }),
        });
      } catch {}
    }, 1500);
  }, [watchlist, isSignedIn]);

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

  // Auto-refresh quotes every 60 seconds
  const [nextRefresh, setNextRefresh] = useState(60);
  const refreshRef = useRef(null);
  useEffect(() => {
    setNextRefresh(60);
    refreshRef.current = setInterval(() => {
      setNextRefresh(prev => {
        if (prev <= 1) {
          fetchStocks();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(refreshRef.current);
  }, [fetchStocks]);

  // When resizing from mobile to desktop, "Watch" tab has no desktop equivalent
  useEffect(() => {
    if (!isMobile && tab === "Watch") setTab("Signals");
  }, [isMobile]);

  // Check broker connection on sign-in
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/broker-connect', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setBrokerConnected(!!data.connected);
      } catch {}
    })();
  }, [isSignedIn]);

  const bullCount = stocks.filter(s => s.regularMarketChangePercent >= 0).length;
  const totalVol = stocks.reduce((s, d) => s + (d.regularMarketVolume || 0) * (d.regularMarketPrice || 0), 0);
  const avgChange = stocks.length ? stocks.reduce((s, d) => s + (d.regularMarketChangePercent || 0), 0) / stocks.length : 0;
  const isOpen = new Date().getHours() >= 9 && new Date().getHours() < 16;

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", fontFamily: "'DM Sans', sans-serif", color: "#f9fafb" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobile ? "10px 14px" : "14px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
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
              {loading ? "LOADING..." : error ? "ERROR" : `LIVE · ${lastUpdate} · ${nextRefresh}s`}
            </span>
          </div>
          <button onClick={() => { fetchStocks(); setNextRefresh(60); }} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "6px 14px", color: "#9ca3af", fontSize: 11,
            cursor: "pointer", fontWeight: 600,
          }}>{isMobile ? "↻" : "↻ Refresh"}</button>
          {clerkAvailable && <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />}
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
          <button onClick={() => { fetchStocks(); setNextRefresh(60); }} style={{
            background: "#6366f1", border: "none", borderRadius: 8, padding: "10px 24px",
            color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13,
          }}>Try Again</button>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            padding: isMobile ? "12px 14px" : "18px 24px",
            gap: isMobile ? 12 : 24,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <StatBox label="Volume" value={fmt(totalVol)} color="#a5b4fc" sub="tracked tickers" />
            <StatBox label="Bullish" value={`${bullCount}/${stocks.length}`} color="#10b981" sub="positive today" />
            <StatBox label="Avg Chg" value={pct(avgChange)} color={avgChange >= 0 ? "#10b981" : "#ef4444"} sub="across watchlist" />
            <StatBox label="Market" value={isOpen ? "OPEN" : "CLOSED"} color={isOpen ? "#10b981" : "#6b7280"} sub="US equities" />
          </div>

          {isMobile ? (
            /* ── Mobile: full-width stacked layout ── */
            <>
              <div style={{
                position: "sticky", top: 0, zIndex: 10,
                display: "flex", overflowX: "auto", scrollbarWidth: "none",
                background: "#0d1117", borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}>
                {(["Watch", ...TABS]).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flexShrink: 0, padding: "11px 14px", fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                    border: "none", borderBottom: `2px solid ${tab === t ? "#6366f1" : "transparent"}`,
                    background: "transparent", color: tab === t ? "#a5b4fc" : "#4b5563",
                    cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.2s",
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ padding: "14px 14px 100px" }}>
                {tab === "Watch" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        list="all-tickers-dl"
                        value={addInput}
                        onChange={e => setAddInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter' && addInput.trim()) { addToWatchlist(addInput); setAddInput(""); } }}
                        placeholder="+ Add ticker…"
                        style={{
                          flex: 1, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)",
                          borderRadius: 6, padding: "9px 10px", color: "#9ca3af", fontSize: 13,
                          fontFamily: "monospace", outline: "none",
                        }}
                      />
                      <button
                        onClick={() => { if (addInput.trim()) { addToWatchlist(addInput); setAddInput(""); } }}
                        style={{
                          background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                          borderRadius: 6, padding: "9px 16px", color: "#a5b4fc",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}>Add</button>
                    </div>
                    <datalist id="all-tickers-dl">
                      {ALL_TICKERS.map(t => <option key={t} value={t} />)}
                    </datalist>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {stocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} onRemove={() => removeFromWatchlist(s.symbol)} onChart={() => setChartSymbol(s.symbol)} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />)}
                    </div>
                  </div>
                )}
                {tab === "Signals" && <SignalsPanel scanResults={scanResults} scanning={scanning} scanProgress={scanProgress} watchlist={watchlist} onRescan={() => { scanResultsRef.current = {}; setScanResults({}); triggerScan(true); }} />}
                {tab === "Portfolio" && <PortfolioPanel stocks={stocks} />}
                {tab === "Alerts" && <AlertsPanel stocks={stocks} />}
                {tab === "Gamma" && <ProGate><GammaPanel stocks={stocks} /></ProGate>}
                {tab === "Dark Pool" && <DarkPoolPanel stocks={stocks} />}
                {tab === "Account" && (clerkAvailable ? <AccountPanel /> : <div style={{ fontSize: 12, color: '#6b7280', padding: 16 }}>Sign in to access account settings.</div>)}
              </div>
            </>
          ) : (
            /* ── Desktop: two-column layout ── */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", minHeight: "calc(100vh - 190px)" }}>
              <div style={{ padding: 16, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingLeft: 4 }}>
                  <span style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Live Prices · {watchlist.length} tickers
                  </span>
                </div>
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
                  {stocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} onRemove={() => removeFromWatchlist(s.symbol)} onChart={() => setChartSymbol(s.symbol)} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />)}
                </div>
              </div>

              <div style={{ padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
                  {TABS.map((t, i) => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      flexShrink: 0, minWidth: 64, padding: "8px 10px", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", border: "none",
                      background: tab === t ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.02)",
                      color: tab === t ? "#a5b4fc" : "#4b5563",
                      borderRight: i < TABS.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                      transition: "all 0.2s", whiteSpace: "nowrap",
                    }}>{t}</button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {tab === "Signals" && <SignalsPanel scanResults={scanResults} scanning={scanning} scanProgress={scanProgress} watchlist={watchlist} onRescan={() => { scanResultsRef.current = {}; setScanResults({}); triggerScan(true); }} />}
                  {tab === "Portfolio" && <PortfolioPanel stocks={stocks} />}
                  {tab === "Alerts" && <AlertsPanel stocks={stocks} />}
                  {tab === "Gamma" && <ProGate><GammaPanel stocks={stocks} /></ProGate>}
                  {tab === "Dark Pool" && <DarkPoolPanel stocks={stocks} />}
                  {tab === "Account" && (clerkAvailable ? <AccountPanel /> : <div style={{ fontSize: 12, color: '#6b7280', padding: 16 }}>Sign in to access account settings.</div>)}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {chartSymbol && <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />}
      {tradeTarget && (
        <TradeModal
          symbol={tradeTarget.symbol}
          price={tradeTarget.price}
          initialSide={tradeTarget.side}
          onClose={() => setTradeTarget(null)}
          getToken={getToken}
          onFilled={() => setBrokerConnected(true)}
        />
      )}
      <div style={{
        padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(0,0,0,0.3)", textAlign: "center",
      }}>
        <p style={{ fontSize: 10, color: "#374151", margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: "#4b5563" }}>Not Financial Advice.</strong>{" "}
          FlowEdge provides market data and analysis tools for informational and educational purposes only.
          Signals, scores, and trade setups do not constitute investment advice or recommendations.
          Market data is sourced from Yahoo Finance and NASDAQ. Past performance does not guarantee future results.
          Options trading involves significant risk. Trade at your own risk.
        </p>
      </div>
    </div>
  );
}

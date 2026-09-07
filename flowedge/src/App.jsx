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
  const containerRef = useRef(null);
  const [tf, setTf] = useState('D');

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.cssText = 'width:100%;height:100%;';
    el.appendChild(widget);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: tf,
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(8,11,18,1)',
      gridColor: 'rgba(255,255,255,0.04)',
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      allow_symbol_change: true,
      save_image: false,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);

    return () => { el.innerHTML = ''; };
  }, [symbol, tf]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#080b12', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, width: '96vw', maxWidth: 1060, height: '88vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#f9fafb', letterSpacing: '-0.01em' }}>{symbol}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[['1','1m'],['5','5m'],['15','15m'],['60','1H'],['240','4H'],['D','D'],['W','W'],['M','M']].map(([v, label]) => (
              <button key={v} onClick={() => setTf(v)} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tf === v ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                color: tf === v ? '#a5b4fc' : '#6b7280',
              }}>{label}</button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px', marginLeft: 8 }}>×</button>
        </div>
        <div ref={containerRef} className="tradingview-widget-container" style={{ flex: 1, minHeight: 0 }} />
      </div>
    </div>
  );
}

function MarketContextBar({ contextData }) {
  if (!contextData?.length) return null;
  const vix = contextData.find(d => d.symbol === '^VIX' || d.symbol === 'VIX' || d.symbol?.endsWith('VIX'));
  const vixVal = vix?.regularMarketPrice;
  const regime = vixVal == null ? null
    : vixVal < 15 ? { label: 'RISK ON', color: '#10b981' }
    : vixVal < 20 ? { label: 'NEUTRAL', color: '#f59e0b' }
    : vixVal < 30 ? { label: 'CAUTION', color: '#f97316' }
    : { label: 'RISK OFF', color: '#ef4444' };

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', overflowX: 'auto', scrollbarWidth: 'none',
      borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.25)',
      minHeight: 34,
    }}>
      {contextData.filter(d => d && !String(d.symbol).includes('VIX')).map(d => {
        const up = (d.regularMarketChangePercent ?? 0) >= 0;
        const c = up ? '#10b981' : '#ef4444';
        const label = {
          'BZ=F': 'BRENT', 'CL=F': 'WTI', 'GC=F': 'GOLD', 'SI=F': 'SILVER',
          'BTC-USD': 'BTC', '^TNX': '10Y',
          ...Object.fromEntries(Object.entries(FX_NAMES).map(([k, v]) => [k, v])),
        }[d.symbol] || d.symbol;
        const isFx = d.symbol?.endsWith('=X');
        const priceStr = d.symbol === '^TNX'
          ? `${d.regularMarketPrice?.toFixed(2)}%`
          : d.symbol === 'BTC-USD'
          ? `$${((d.regularMarketPrice || 0) / 1000).toFixed(1)}k`
          : isFx
          ? ((d.regularMarketPrice || 0) >= 10 ? (d.regularMarketPrice || 0).toFixed(3) : (d.regularMarketPrice || 0).toFixed(4))
          : `$${d.regularMarketPrice?.toFixed(2)}`;
        return (
          <div key={d.symbol} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0 16px', borderRight: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#e5e7eb' }}>
              {priceStr}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: c, fontWeight: 600 }}>
              {(d.regularMarketChangePercent ?? 0) > 0 ? '+' : ''}{(d.regularMarketChangePercent ?? 0).toFixed(2)}%
            </span>
          </div>
        );
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderLeft: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        {vixVal != null && (
          <>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280' }}>VIX</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: vixVal > 25 ? '#ef4444' : vixVal > 18 ? '#f59e0b' : '#10b981' }}>
              {vixVal.toFixed(2)}
            </span>
            {regime && (
              <>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: regime.color }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: regime.color, letterSpacing: '0.1em' }}>{regime.label}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const SECTOR_NAMES = { XLK:'Tech', XLF:'Finance', XLV:'Health', XLC:'Comms', XLY:'Discret', XLP:'Staples', XLE:'Energy', XLI:'Industr', XLB:'Matls', XLRE:'REITs', XLU:'Util' };

function SectorGrid({ sectorData }) {
  if (!sectorData?.length) return null;
  const sorted = [...sectorData].sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0));
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 6 }}>SECTOR ROTATION</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {sorted.map(s => {
          const chg = s.regularMarketChangePercent ?? 0;
          const up = chg >= 0;
          const intensity = Math.min(Math.abs(chg) / 3, 1);
          const bg = up ? `rgba(16,185,129,${0.05 + intensity * 0.2})` : `rgba(239,68,68,${0.05 + intensity * 0.2})`;
          const bd = up ? `rgba(16,185,129,${0.12 + intensity * 0.28})` : `rgba(239,68,68,${0.12 + intensity * 0.28})`;
          return (
            <div key={s.symbol} style={{ padding: '5px 6px', borderRadius: 6, background: bg, border: `1px solid ${bd}`, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#6b7280', fontWeight: 700, marginBottom: 1 }}>{SECTOR_NAMES[s.symbol] || s.symbol}</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: up ? '#10b981' : '#ef4444' }}>
                {chg > 0 ? '+' : ''}{chg.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockCard({ data, index, onRemove, onChart, onTrade, signalData, spyChange }) {
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
            {(() => {
              const avgVol = data.averageDailyVolume3Month || data.averageDailyVolume10Day;
              if (!avgVol || !data.regularMarketVolume) return null;
              const rvol = data.regularMarketVolume / avgVol;
              if (rvol < 1.5) return null;
              return (
                <span style={{ fontSize: 8, fontWeight: 800, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 3, padding: '1px 4px' }}>
                  {rvol.toFixed(1)}×VOL
                </span>
              );
            })()}
            {signalData?.hasEdge && (
              <span style={{
                fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                background: signalData.showLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: signalData.showLong ? '#10b981' : '#ef4444',
                border: `1px solid ${signalData.showLong ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {signalData.showLong ? '▲' : '▼'} {signalData.setupProb}%
              </span>
            )}
            {spyChange != null && (() => {
              const rs = (data.regularMarketChangePercent ?? 0) - spyChange;
              if (Math.abs(rs) < 0.5) return null;
              const c = rs > 0 ? '#10b981' : '#ef4444';
              return <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'monospace', color: c }}>RS{rs >= 0 ? '+' : ''}{rs.toFixed(1)}</span>;
            })()}
            {onRemove && (
              <button onClick={onRemove} title="Remove from watchlist" style={{
                background: "none", border: "none", color: "#374151", cursor: "pointer",
                fontSize: 13, padding: 0, lineHeight: 1, marginTop: 1,
              }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 1 }}>{data.shortName || ""}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {data.priceHistory?.length > 2 && <div style={{ paddingTop: 4 }}><Sparkline prices={data.priceHistory} /></div>}
          <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 17, color: "#f9fafb" }}>
            ${data.regularMarketPrice?.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color, fontWeight: 700 }}>{pct(data.regularMarketChangePercent)}</div>
          {(() => {
            const ms = data.marketState;
            if (ms === 'PRE' && data.preMarketPrice) {
              const pc = data.preMarketChangePercent ?? 0;
              const c2 = pc >= 0 ? '#10b981' : '#ef4444';
              return <div style={{ fontSize: 9, color: '#4b5563', marginTop: 2 }}>PRE <span style={{ color: c2, fontFamily: 'monospace', fontWeight: 700 }}>${data.preMarketPrice.toFixed(2)} {pc >= 0 ? '+' : ''}{pc.toFixed(2)}%</span></div>;
            }
            if ((ms === 'POST' || ms === 'CLOSED') && data.postMarketPrice) {
              const pc = data.postMarketChangePercent ?? 0;
              const c2 = pc >= 0 ? '#10b981' : '#ef4444';
              return <div style={{ fontSize: 9, color: '#4b5563', marginTop: 2 }}>AH <span style={{ color: c2, fontFamily: 'monospace', fontWeight: 700 }}>${data.postMarketPrice.toFixed(2)} {pc >= 0 ? '+' : ''}{pc.toFixed(2)}%</span></div>;
            }
            return null;
          })()}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          ["Volume", fmt(data.regularMarketVolume), "#9ca3af"],
          ["Mkt Cap", fmt(data.marketCap), "#9ca3af"],
          (() => {
            const open = data.regularMarketOpen, price = data.regularMarketPrice;
            if (!open || !price) return ["From Open", "—", "#9ca3af"];
            const chg = ((price - open) / open) * 100;
            return ["From Open", `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, chg >= 0 ? '#10b981' : '#ef4444'];
          })(),
        ].map(([label, val, color]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: color, fontFamily: "monospace", fontWeight: label === "From Open" ? 700 : 400 }}>{val}</div>
          </div>
        ))}
      </div>
      {(data.trailingPE || data.forwardPE) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {data.trailingPE && <span style={{ fontSize: 10, color: '#4b5563' }}>P/E <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{data.trailingPE.toFixed(1)}</span></span>}
          {data.forwardPE && <span style={{ fontSize: 10, color: '#4b5563' }}>Fwd P/E <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{data.forwardPE.toFixed(1)}</span></span>}
        </div>
      )}
      {data.fiftyTwoWeekLow && data.fiftyTwoWeekHigh && data.regularMarketPrice && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#374151', marginBottom: 3 }}>
            <span>${data.fiftyTwoWeekLow.toFixed(0)}</span>
            <span style={{ color: '#4b5563' }}>52W Range</span>
            <span>${data.fiftyTwoWeekHigh.toFixed(0)}</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, position: 'relative' }}>
            {(() => {
              const lo = data.fiftyTwoWeekLow, hi = data.fiftyTwoWeekHigh, price = data.regularMarketPrice;
              const pos = Math.min(Math.max(((price - lo) / (hi - lo)) * 100, 0), 100);
              const c = pos > 75 ? '#10b981' : pos < 25 ? '#ef4444' : '#f59e0b';
              return (
                <>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: `${pos}%`, height: '100%', background: `${c}33`, borderRadius: 2 }} />
                  <div style={{ position: 'absolute', left: `${pos}%`, top: -2, width: 7, height: 7, background: c, borderRadius: '50%', transform: 'translateX(-50%)', border: '1px solid rgba(0,0,0,0.4)' }} />
                </>
              );
            })()}
          </div>
        </div>
      )}
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

function Sparkline({ prices, width = 58, height = 22 }) {
  if (!prices || prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || min * 0.001 || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - 1 - ((p - min) / range) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = prices[prices.length - 1] >= prices[0];
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0, opacity: 0.75 }}>
      <polyline points={pts} fill="none" stroke={up ? '#10b981' : '#ef4444'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignalCard({ symbol, signal, index, now, onTrade }) {
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
      {signal.posSizePer10K && !isStale && (() => {
        let acctSize = 25000;
        try { acctSize = parseInt(localStorage.getItem('fe_account_size') || '25000') || 25000; } catch {}
        const actualShares = Math.max(1, Math.floor(acctSize * signal.posSizePer10K / 10000));
        const riskDollars = Math.round(acctSize * 0.01);
        const acctLabel = acctSize >= 1000000 ? `$${(acctSize/1000000).toFixed(1)}M` : acctSize >= 1000 ? `$${(acctSize/1000).toFixed(0)}K` : `$${acctSize}`;
        return (
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#4b5563' }}>{acctLabel} acct · ${riskDollars} risk (1%)</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#a5b4fc' }}>~{actualShares} shares</span>
          </div>
        );
      })()}
      {isStale && <div style={{ marginTop: 6, fontSize: 10, color: "#4b5563" }}>Signal is {ageMin}m old — rescan for fresh levels</div>}
      {onTrade && !isStale && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => onTrade(symbol, signal.spot, showLong ? 'buy' : 'sell')} style={{
            width: '100%', padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: showLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: showLong ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: 800,
          }}>
            {showLong ? '▲ Buy' : '▼ Sell'} {symbol} →
          </button>
        </div>
      )}
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
          {(() => {
            const betaSum = enriched.reduce((sum, p) => {
              const stock = stocks.find(s => s.symbol === p.symbol);
              const beta = stock?.beta ?? 1;
              const weight = totalValue > 0 ? (p.currentValue ?? p.invested) / totalValue : 0;
              return sum + beta * weight;
            }, 0);
            const spy1pct = totalValue > 0 ? totalValue * betaSum * 0.01 : 0;
            return (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: '#4b5563' }}>β-weighted exposure</span>
                <span>
                  <span style={{ color: '#a5b4fc', fontFamily: 'monospace' }}>β {betaSum.toFixed(2)}</span>
                  <span style={{ color: '#374151', fontFamily: 'monospace', marginLeft: 8 }}>SPY 1% ≈ ±${Math.abs(spy1pct).toFixed(0)}</span>
                </span>
              </div>
            );
          })()}
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

  // Live feed of forex/ICT signal alerts (written by the signal engines)
  const [signalLog, setSignalLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const t = setInterval(() => {
      try { setSignalLog(JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]')); } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, []);
  const clearSignalLog = () => {
    try { localStorage.setItem('fe_signal_alerts', '[]'); } catch {}
    setSignalLog([]);
  };

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
        if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
          new Notification(`FlowEdge Alert: ${a.symbol}`, {
            body: `${a.symbol} is ${a.direction} $${a.targetPrice} — now at $${price.toFixed(2)}`,
            icon: "/favicon.ico",
          });
        }
      }
    });
  }, [stocks, alerts]);

  const addAlert = async () => {
    const num = parseFloat(form.price);
    if (!num || num <= 0) return;
    const isPct = form.direction.startsWith('pct');
    let targetPrice = num;
    let pct = null;
    if (isPct) {
      const priceMap = Object.fromEntries(stocks.map(s => [s.symbol, s.regularMarketPrice]));
      const base = priceMap[form.symbol];
      if (!base) { alert(`${form.symbol} must be in your watchlist to use % alerts`); return; }
      pct = num;
      targetPrice = +(form.direction === 'pctAbove' ? base * (1 + num / 100) : base * (1 - num / 100)).toFixed(2);
    }
    const direction = isPct ? (form.direction === 'pctAbove' ? 'above' : 'below') : form.direction;
    if (typeof Notification !== 'undefined' && Notification.permission === "default") await Notification.requestPermission();
    setAlerts(prev => [...prev, { id: Date.now(), symbol: form.symbol, targetPrice, direction, pct, triggered: false }]);
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
      {signalLog.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>SIGNAL ALERTS — FOREX & ICT</span>
            <button onClick={clearSignalLog} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 9, cursor: 'pointer', padding: 0 }}>clear</button>
          </div>
          {signalLog.slice(0, 15).map(s => {
            const dc = s.dir === 'long' ? '#10b981' : '#ef4444';
            const sc = { ICT: '#8b5cf6', SCALP: '#f59e0b', INTRADAY: '#3b82f6', FOREX: '#6366f1', ORB: '#f97316', SMC: '#14b8a6', CONFLUENCE: '#fbbf24' }[s.source] || '#3b82f6';
            const fmtP = p => p == null ? '' : p >= 100 ? p.toFixed(2) : p >= 10 ? p.toFixed(3) : p.toFixed(4);
            const ago = (() => {
              const m = Math.floor((Date.now() - s.time) / 60000);
              return m < 1 ? 'now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
            })();
            return (
              <div key={s.id} style={{ padding: '7px 10px', borderRadius: 7, background: `${dc}06`, border: `1px solid ${dc}20`, borderLeft: `3px solid ${dc}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 8, fontWeight: 800, color: sc, background: `${sc}18`, padding: '1px 4px', borderRadius: 3 }}>{s.source}</span>
                    <span style={{ fontWeight: 800, fontSize: 11, color: '#f9fafb' }}>{s.name}</span>
                    <span style={{ fontSize: 8, fontWeight: 800, color: dc }}>{s.dir === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
                    <span style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>{s.type}</span>
                    {s.outcome && (() => {
                      const oc = s.outcome === 'WIN' ? '#10b981' : s.outcome === 'LOSS' ? '#ef4444' : '#6b7280';
                      const rTxt = s.rMult != null ? ` ${s.rMult > 0 ? '+' : ''}${s.rMult}R` : '';
                      return <span style={{ fontSize: 8, fontWeight: 900, color: oc, background: `${oc}18`, padding: '1px 5px', borderRadius: 3 }}>{s.outcome === 'WIN' ? '✓' : s.outcome === 'LOSS' ? '✗' : '–'} {s.outcome}{rTxt}</span>;
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {s.price != null && <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#9ca3af' }}>{fmtP(s.price)}</span>}
                    <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 800, color: s.conf >= 70 ? '#10b981' : '#f59e0b' }}>{s.conf}%</span>
                    <span style={{ fontSize: 8, color: '#374151' }}>{ago}</span>
                  </div>
                </div>
                <div style={{ fontSize: 9, color: '#6b7280', fontStyle: 'italic', marginTop: 2 }}>{s.reason}</div>
              </div>
            );
          })}
        </div>
      )}

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
                  {a.pct != null && <span style={{ color: '#a5b4fc', marginLeft: 4 }}>({a.direction === 'above' ? '+' : '-'}{a.pct}%)</span>}
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
              <option value="pctAbove">% gain from current</option>
              <option value="pctBelow">% drop from current</option>
            </select>
            <input
              placeholder={form.direction.startsWith('pct') ? 'Target % (e.g. 5)' : 'Target price'}
              type="number"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              style={inputStyle}
            />
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
  const [acctSize, setAcctSize] = useState(() => {
    try { return parseInt(localStorage.getItem('fe_account_size') || '25000') || 25000; } catch { return 25000; }
  });
  const [acctInput, setAcctInput] = useState('');
  const [editingAcct, setEditingAcct] = useState(false);
  const saveAcctSize = () => {
    const v = parseInt(acctInput.replace(/[^0-9]/g, ''));
    if (v >= 100) { localStorage.setItem('fe_account_size', String(v)); setAcctSize(v); }
    setEditingAcct(false);
  };
  const [riskPct, setRiskPct] = useState(() => {
    try { return parseFloat(localStorage.getItem('fe_risk_pct') || '1') || 1; } catch { return 1; }
  });
  const setRisk = (v) => {
    const clamped = Math.max(0.1, Math.min(5, v));
    localStorage.setItem('fe_risk_pct', String(clamped));
    setRiskPct(clamped);
  };
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

      {/* Account Size */}
      <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10 }}>TRADING ACCOUNT SIZE</div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>
          Used for 1% risk position sizing shown on each signal.
        </p>
        {editingAcct ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              placeholder={`Current: $${acctSize.toLocaleString()}`}
              value={acctInput}
              onChange={e => setAcctInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAcctSize(); if (e.key === 'Escape') setEditingAcct(false); }}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '7px 10px', color: '#f9fafb', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
            />
            <button onClick={saveAcctSize} style={{ background: '#6366f1', border: 'none', borderRadius: 6, padding: '0 14px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Save</button>
            <button onClick={() => setEditingAcct(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '0 10px', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontFamily: 'monospace', fontWeight: 800, color: '#f9fafb' }}>
              ${acctSize.toLocaleString()}
            </span>
            <button onClick={() => { setAcctInput(''); setEditingAcct(true); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '5px 12px', color: '#a5b4fc', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Edit
            </button>
          </div>
        )}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Fixed risk per trade — position sizing on every signal card is based on this</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[0.25, 0.5, 1, 2].map(v => (
              <button key={v} onClick={() => setRisk(v)} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: riskPct === v ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                color: riskPct === v ? '#a5b4fc' : '#6b7280',
              }}>{v}%</button>
            ))}
          </div>
        </div>
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
  const slDist = (activeSL != null && spot != null) ? Math.abs(spot - activeSL) : null;
  const posSizePer10K = (slDist && slDist > 0.01) ? Math.max(1, Math.floor(100 / slDist)) : null;
  return {
    hasEdge, setupProb, showLong, composite, confidence, spot,
    activeTP, activeSL, rrCheck: +rrCheck.toFixed(2), iv: d.impliedVol ?? 0,
    activeDistPct, pcRaw, biasScore: bias, atr, posSizePer10K,
  };
}

// Copies the gamma levels in the exact order the FlowEdge Pine indicator
// (pine/gamma-walls.pine) asks for them, plus the GEX-by-strike profile
// string. Pine has no HTTP access, so paste is the only way in.
function PineCopyButton({ data }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const build = () => {
    const profile = (data.gexByStrike || [])
      .filter(x => x.gex)
      .map(x => `${x.strike}:${(x.gex / 1e9).toFixed(2)}`)
      .join(',');
    return [
      `FlowEdge gamma levels — ${data.symbol} @ ${data.spot?.toFixed(2)} · ${new Date().toLocaleString()}`,
      ``,
      `Gamma Wall : ${data.gammaWall ?? 0}`,
      `Call Wall  : ${data.callWall ?? 0}`,
      `Put Wall   : ${data.putWall ?? 0}`,
      `Gamma Flip : ${data.flipLevel ?? 0}`,
      `Net GEX $B : ${((data.netGex || 0) / 1e9).toFixed(2)}`,
      ``,
      `GEX profile (paste into "GEX data"):`,
      profile,
    ].join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(build());
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  return (
    <button onClick={copy} title="Copy these levels for the FlowEdge TradingView indicator"
      style={{
        marginLeft: 'auto', background: copied ? 'rgba(16,185,129,0.18)' : 'rgba(99,102,241,0.14)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(99,102,241,0.3)'}`,
        borderRadius: 5, padding: '3px 9px', color: copied ? '#6ee7b7' : '#a5b4fc',
        fontSize: 9, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
      }}>
      {copied ? '✓ Copied' : '📋 Pine inputs'}
    </button>
  );
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
      {/* Watchlist quick-access chips */}
      {stocks.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {stocks.slice(0, 16).map(s => (
            <button key={s.symbol} onClick={() => { setSymbol(s.symbol); setExpiry(null); }} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: symbol === s.symbol ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
              color: symbol === s.symbol ? '#a5b4fc' : '#6b7280',
            }}>{s.symbol}</button>
          ))}
        </div>
      )}
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
            <PineCopyButton data={data} />
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

          {/* Options strategy suggestion */}
          <OptionsStrategy data={data} scored={scored} />

          {/* Implied move box */}
          {data.impliedVol && spot && (
            <div style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 7, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 800, letterSpacing: '0.1em' }}>IMPLIED MOVE</span>
              {[[5, 'Weekly'], [21, 'Monthly'], [252, 'Annual']].map(([days, label]) => {
                const mv = spot * (data.impliedVol / 100) * Math.sqrt(days / 252);
                return (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 8, color: '#4b5563' }}>{label}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#a5b4fc' }}>
                      ±${mv.toFixed(2)} <span style={{ fontSize: 9, color: '#6b7280' }}>(±{(mv/spot*100).toFixed(1)}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* GEX Bar Chart */}
          {data.gexByStrike?.length > 0 && (
            <div style={{ padding: '10px 0' }}>
              <GEXBarChart
                gexByStrike={data.gexByStrike}
                spot={spot}
                gammaWall={data.gammaWall}
                putWall={data.putWall}
                callWall={data.callWall}
                flipLevel={data.flipLevel}
              />
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

function OptionsStrategy({ data, scored }) {
  if (!data || !scored) return null;
  const { iv = 0, showLong, hasEdge, rrCheck = 0 } = scored;
  const spot = data.spot;
  const nearFlip = data.flipLevel && spot && Math.abs(spot - data.flipLevel) / spot < 0.025;
  const ivLow = iv < 22, ivHigh = iv > 45;

  let primary, secondary, note;

  if (nearFlip) {
    primary = 'Iron Condor';
    secondary = 'Butterfly Spread';
    note = `Spot within 2.5% of GEX flip $${data.flipLevel?.toFixed(0)} — price likely to pin`;
  } else if (!hasEdge) {
    primary = ivHigh ? 'Short Strangle' : 'Wait';
    secondary = ivHigh ? 'Iron Condor' : null;
    note = ivHigh ? `IV at ${iv}% — sell premium, no directional edge needed` : 'No GEX + flow alignment. Stand aside until signals agree.';
  } else if (ivLow) {
    primary = showLong ? 'Long Call' : 'Long Put';
    secondary = showLong ? 'Bull Call Spread' : 'Bear Put Spread';
    note = `IV at ${iv}% — premium is cheap, buying options has edge`;
  } else if (ivHigh) {
    primary = showLong ? 'Bull Call Spread' : 'Bear Put Spread';
    secondary = showLong ? 'Cash-Secured Put' : 'Covered Call';
    note = `IV at ${iv}% — use spreads to cap premium cost`;
  } else {
    primary = showLong ? 'Bull Call Spread' : 'Bear Put Spread';
    secondary = showLong ? 'Long Call' : 'Long Put';
    note = `Normal IV (${iv}%) — spreads reduce breakeven vs outright options`;
  }

  const activeTP = showLong ? data.buyKingNode?.strike : data.sellKingNode?.strike;

  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
      <div style={{ fontSize: 9, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8 }}>✦ OPTIONS STRATEGY</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ padding: '3px 9px', borderRadius: 4, background: 'rgba(99,102,241,0.25)', color: '#c4b5fd', fontSize: 11, fontWeight: 800 }}>
          {primary}
        </span>
        {secondary && (
          <span style={{ padding: '3px 9px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#6b7280', fontSize: 11, fontWeight: 600 }}>
            or {secondary}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.55 }}>{note}</div>
      {hasEdge && activeTP && data.availableExpiries?.[0] && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 16, fontSize: 10, fontFamily: 'monospace' }}>
          <span style={{ color: '#4b5563' }}>Target strike <span style={{ color: '#a5b4fc', fontWeight: 700 }}>${activeTP}</span></span>
          <span style={{ color: '#4b5563' }}>Nearest exp <span style={{ color: '#f9fafb' }}>{data.availableExpiries[0]}</span></span>
          {rrCheck > 0 && <span style={{ color: '#4b5563' }}>R:R <span style={{ color: rrCheck >= 2 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{rrCheck.toFixed(1)}:1</span></span>}
        </div>
      )}
    </div>
  );
}

function WatchlistHeatmap({ stocks, scanResults, onChart }) {
  if (!stocks.length) return null;
  const sorted = [...stocks].sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 5 }}>
      {sorted.map(s => {
        const chg = s.regularMarketChangePercent ?? 0;
        const up = chg >= 0;
        const sig = scanResults?.[s.symbol];
        const intensity = Math.min(Math.abs(chg) / 4, 1);
        const bg = up ? `rgba(16,185,129,${0.07 + intensity * 0.48})` : `rgba(239,68,68,${0.07 + intensity * 0.48})`;
        const bd = sig?.hasEdge
          ? `1px solid ${sig.showLong ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'}`
          : '1px solid rgba(255,255,255,0.06)';
        return (
          <div key={s.symbol} onClick={() => onChart?.(s.symbol)} style={{
            padding: '8px 5px', borderRadius: 7, background: bg, border: bd,
            textAlign: 'center', cursor: 'pointer', position: 'relative',
          }}>
            {sig?.hasEdge && (
              <div style={{ position: 'absolute', top: 3, right: 4, fontSize: 7, fontWeight: 800,
                color: sig.showLong ? '#10b981' : '#ef4444' }}>
                {sig.showLong ? '▲' : '▼'}
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 800, color: '#f9fafb', marginBottom: 2 }}>{s.symbol}</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: up ? '#86efac' : '#fca5a5' }}>
              {chg > 0 ? '+' : ''}{chg.toFixed(1)}%
            </div>
            {sig?.hasEdge && (
              <div style={{ fontSize: 8, color: sig.showLong ? '#6ee7b7' : '#fca5a5', marginTop: 1 }}>
                {sig.setupProb}%
              </div>
            )}
          </div>
        );
      })}
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

function GEXBarChart({ gexByStrike, spot, gammaWall, putWall, callWall, flipLevel }) {
  if (!gexByStrike?.length || !spot) return null;
  const filtered = gexByStrike
    .filter(x => Math.abs(x.strike - spot) / spot <= 0.10)
    .sort((a, b) => b.strike - a.strike);
  if (!filtered.length) return null;
  const maxAbs = Math.max(...filtered.map(x => Math.abs(x.gex)), 1);
  const BAR_MAX = 108;
  const fmtG = n => {
    const a = Math.abs(n);
    const s = n >= 0 ? '+' : '-';
    if (a >= 1e9) return `${s}${(a/1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${s}${(a/1e6).toFixed(0)}M`;
    if (a >= 1e3) return `${s}${(a/1e3).toFixed(0)}K`;
    return `${s}${a.toFixed(0)}`;
  };
  return (
    <div>
      <div style={{ fontSize: 9, color: '#a5b4fc', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8 }}>
        ■ NET GEX BY STRIKE — DEALER POSITIONING
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 340 }}>
        {filtered.map(x => {
          const isSpot = Math.abs(x.strike - spot) / spot < 0.004;
          const isPos = x.gex >= 0;
          const w = Math.max(1, Math.round((Math.abs(x.gex) / maxAbs) * BAR_MAX));
          const alpha = 0.22 + (Math.abs(x.gex) / maxAbs) * 0.7;
          return (
            <div key={x.strike} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '1.5px 0',
              background: isSpot ? 'rgba(245,158,11,0.07)' : 'transparent',
            }}>
              <div style={{ width: 40, textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: isSpot ? '#f59e0b' : '#4b5563', fontWeight: isSpot ? 800 : 400 }}>
                  {x.strike % 1 === 0 ? x.strike.toFixed(0) : x.strike.toFixed(1)}
                </span>
              </div>
              <div style={{ width: BAR_MAX * 2 + 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: BAR_MAX, display: 'flex', justifyContent: 'flex-end' }}>
                  {!isPos && <div style={{ width: w, height: 9, borderRadius: '2px 0 0 2px', background: `rgba(239,68,68,${alpha})` }} />}
                </div>
                <div style={{ width: 1, height: 13, background: isSpot ? '#f59e0b' : 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                <div style={{ width: BAR_MAX, display: 'flex', justifyContent: 'flex-start' }}>
                  {isPos && <div style={{ width: w, height: 9, borderRadius: '0 2px 2px 0', background: `rgba(16,185,129,${alpha})` }} />}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 52 }}>
                <span style={{ fontSize: 8, fontFamily: 'monospace', color: isPos ? '#86efac' : '#fca5a5' }}>{fmtG(x.gex)}</span>
                {isSpot && <span style={{ fontSize: 7, color: '#f59e0b', fontWeight: 800 }}>●</span>}
                {x.strike === gammaWall && <span style={{ fontSize: 7, color: '#a5b4fc', fontWeight: 800 }}>Γ</span>}
                {x.strike === flipLevel && <span style={{ fontSize: 7, color: '#f59e0b', fontWeight: 800 }}>↕</span>}
                {x.strike === putWall && <span style={{ fontSize: 7, color: '#fca5a5', fontWeight: 800 }}>P</span>}
                {x.strike === callWall && <span style={{ fontSize: 7, color: '#86efac', fontWeight: 800 }}>C</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 8, fontFamily: 'monospace', flexWrap: 'wrap' }}>
        <span style={{ color: '#86efac' }}>■ Call GEX (dealer long gamma)</span>
        <span style={{ color: '#fca5a5' }}>■ Put GEX (dealer short gamma)</span>
        <span style={{ color: '#a5b4fc' }}>Γ gamma wall</span>
        <span style={{ color: '#f59e0b' }}>↕ flip level</span>
      </div>
    </div>
  );
}

function JournalPanel() {
  const [trades, setTrades] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fe_journal') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ symbol: '', direction: 'long', entry: '', exit: '', shares: '', date: new Date().toISOString().split('T')[0], notes: '' });

  useEffect(() => { localStorage.setItem('fe_journal', JSON.stringify(trades)); }, [trades]);

  const addTrade = () => {
    const entry = parseFloat(form.entry), exit = parseFloat(form.exit), shares = parseFloat(form.shares);
    if (!form.symbol || !entry || !exit || !shares || shares <= 0) return;
    const pnl = form.direction === 'long' ? (exit - entry) * shares : (entry - exit) * shares;
    setTrades(prev => [{ id: Date.now(), symbol: form.symbol.toUpperCase(), direction: form.direction, entry, exit, shares, pnl, date: form.date, notes: form.notes }, ...prev]);
    setForm(f => ({ ...f, symbol: '', entry: '', exit: '', shares: '', notes: '' }));
    setAdding(false);
  };

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length ? Math.round(wins.length / trades.length * 100) : null;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : null;
  const totalColor = totalPnl >= 0 ? '#10b981' : '#ef4444';

  const inp = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '7px 10px', color: '#f9fafb', fontSize: 12,
    fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {trades.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['TRADES', trades.length, '#f9fafb'],
            ['WIN RATE', winRate != null ? `${winRate}%` : '—', winRate >= 50 ? '#10b981' : '#ef4444'],
            ['PROFIT FACTOR', profitFactor ?? '—', parseFloat(profitFactor) >= 1.5 ? '#10b981' : '#f59e0b'],
            ['TOTAL P&L', `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, totalColor],
          ].map(([label, val, color]) => (
            <div key={label} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#4b5563', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {trades.length > 1 && (() => {
        const pts = trades.slice().reverse();
        let cum = 0;
        const cumPnls = pts.map(t => { cum += t.pnl; return cum; });
        const minV = Math.min(...cumPnls, 0), maxV = Math.max(...cumPnls, 0);
        const range = maxV - minV || 1;
        const W = 300, H = 40, PAD = 4;
        const xOf = i => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
        const yOf = v => PAD + (1 - (v - minV) / range) * (H - PAD * 2);
        const polyline = cumPnls.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');
        const fillPts = [`${xOf(0)},${yOf(0)}`, ...cumPnls.map((v, i) => `${xOf(i)},${yOf(v)}`), `${xOf(cumPnls.length - 1)},${yOf(0)}`].join(' ');
        const finalColor = totalPnl >= 0 ? '#10b981' : '#ef4444';
        return (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 8, color: '#4b5563', marginBottom: 6, letterSpacing: '0.08em' }}>EQUITY CURVE</div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', height: H }}>
              <line x1={PAD} y1={yOf(0)} x2={W - PAD} y2={yOf(0)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3,3" />
              <polygon points={fillPts} fill={`${finalColor}18`} />
              <polyline points={polyline} fill="none" stroke={finalColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        );
      })()}

      {/* Monthly P&L Calendar */}
      {trades.length > 0 && (() => {
        const now = new Date();
        const yr = now.getFullYear(), mo = now.getMonth();
        const daysInMonth = new Date(yr, mo + 1, 0).getDate();
        const firstDay = new Date(yr, mo, 1).getDay();
        const dayPnl = {};
        trades.forEach(t => {
          const d = new Date(t.date + 'T12:00:00');
          if (d.getFullYear() === yr && d.getMonth() === mo) {
            const k = d.getDate();
            dayPnl[k] = (dayPnl[k] || 0) + t.pnl;
          }
        });
        const today = now.getDate();
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 8, color: '#4b5563', marginBottom: 8, letterSpacing: '0.08em' }}>
              {MONTHS[mo].toUpperCase()} {yr} · P&L CALENDAR
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} style={{ fontSize: 7, color: '#374151', textAlign: 'center', paddingBottom: 2, fontWeight: 700 }}>{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`pad${i}`} />;
                const pnl = dayPnl[day];
                const isToday = day === today;
                const intensity = pnl != null ? Math.min(0.55, 0.12 + Math.abs(pnl) / 400 * 0.43) : 0;
                const bg = pnl > 0 ? `rgba(16,185,129,${intensity})` : pnl < 0 ? `rgba(239,68,68,${intensity})` : 'rgba(255,255,255,0.02)';
                const color = pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#374151';
                return (
                  <div key={day} title={pnl != null ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}` : ''} style={{
                    aspectRatio: '1', borderRadius: 3, background: bg,
                    border: isToday ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, color, fontWeight: pnl != null ? 700 : 400,
                  }}>{day}</div>
                );
              })}
            </div>
            {Object.keys(dayPnl).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 8, color: '#10b981' }}>■ Profit</span>
                <span style={{ fontSize: 8, color: '#ef4444' }}>■ Loss</span>
              </div>
            )}
          </div>
        );
      })()}

      {trades.length > 1 && (() => {
        const bySymbol = {};
        trades.forEach(t => {
          if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { wins: 0, total: 0, pnl: 0 };
          bySymbol[t.symbol].pnl += t.pnl;
          bySymbol[t.symbol].total++;
          if (t.pnl > 0) bySymbol[t.symbol].wins++;
        });
        const symList = Object.entries(bySymbol).sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl)).slice(0, 6);
        let streak = 0, streakType = null;
        for (const t of trades) {
          const w = t.pnl > 0;
          if (streakType === null) { streakType = w; streak = 1; }
          else if (w === streakType) streak++;
          else break;
        }
        return (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: '#4b5563', letterSpacing: '0.08em' }}>BY SYMBOL</div>
              {streak > 1 && <span style={{ fontSize: 9, fontWeight: 800, color: streakType ? '#10b981' : '#ef4444' }}>{streak}{streakType ? 'W' : 'L'} STREAK</span>}
            </div>
            {symList.map(([sym, s]) => {
              const c = s.pnl >= 0 ? '#10b981' : '#ef4444';
              const wr = s.wins / s.total;
              return (
                <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontWeight: 800, fontSize: 11, color: '#f9fafb', width: 46 }}>{sym}</span>
                  <span style={{ fontSize: 9, color: '#374151', width: 28 }}>{s.wins}/{s.total}</span>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ width: `${wr * 100}%`, height: '100%', background: wr >= 0.5 ? '#10b981' : '#ef4444', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: c, minWidth: 54, textAlign: 'right' }}>
                    {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {adding ? (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>SYMBOL</div>
                <input list="all-tickers-dl" placeholder="AAPL" value={form.symbol}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>DIRECTION</div>
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="long">▲ Long</option>
                  <option value="short">▼ Short</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['ENTRY $', 'entry'], ['EXIT $', 'exit'], ['SHARES', 'shares']].map(([label, key]) => (
                <div key={key}>
                  <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>{label}</div>
                  <input type="number" step="0.01" placeholder="0.00" value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>DATE</div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#4b5563', marginBottom: 3 }}>NOTES (optional)</div>
                <input placeholder="Setup, catalyst, lesson…" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
              </div>
            </div>
            {form.entry && form.exit && form.shares && (() => {
              const e = parseFloat(form.entry), x = parseFloat(form.exit), s = parseFloat(form.shares);
              if (!e || !x || !s) return null;
              const p = form.direction === 'long' ? (x - e) * s : (e - x) * s;
              const pct = ((x - e) / e * (form.direction === 'long' ? 100 : -100)).toFixed(1);
              return (
                <div style={{ padding: '7px 10px', borderRadius: 6, background: p >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${p >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Est. P&L</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: p >= 0 ? '#10b981' : '#ef4444' }}>
                    {p >= 0 ? '+' : ''}${p.toFixed(2)} ({pct}%)
                  </span>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTrade} style={{
                flex: 2, background: '#6366f1', border: 'none', borderRadius: 6, padding: '9px 0',
                color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12,
              }}>Log Trade</button>
              <button onClick={() => setAdding(false)} style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '9px 0', color: '#9ca3af', cursor: 'pointer', fontSize: 12,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.4)',
          borderRadius: 8, padding: '10px 0', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>+ Log Trade</button>
      )}

      {trades.length === 0 && !adding && (
        <div style={{ padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.25 }}>📋</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>No trades logged yet</div>
          <div style={{ fontSize: 11, color: '#374151' }}>Track every trade to see your win rate, profit factor, and equity curve.</div>
        </div>
      )}

      {trades.map(t => {
        const c = t.pnl >= 0 ? '#10b981' : '#ef4444';
        return (
          <div key={t.id} style={{
            padding: '10px 12px', borderRadius: 8,
            background: t.pnl >= 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
            border: `1px solid ${t.pnl >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}`,
            borderLeft: `3px solid ${c}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#f9fafb' }}>{t.symbol}</span>
                <span style={{ fontSize: 10, color: t.direction === 'long' ? '#10b981' : '#ef4444', marginLeft: 6, fontWeight: 700 }}>
                  {t.direction === 'long' ? '▲' : '▼'} {t.direction.toUpperCase()}
                </span>
                <span style={{ fontSize: 10, color: '#4b5563', marginLeft: 6 }}>{t.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 800, color: c }}>
                  {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                </span>
                <button onClick={() => setTrades(prev => prev.filter(x => x.id !== t.id))} style={{
                  background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 14, padding: 0,
                }}>×</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>
              <span>${t.entry.toFixed(2)}</span>
              <span>→</span>
              <span>${t.exit.toFixed(2)}</span>
              <span>×{t.shares}</span>
              {t.notes && <span style={{ color: '#4b5563', fontFamily: 'sans-serif', fontStyle: 'italic', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {t.notes}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dark Pool Levels ───────────────────────────────────────────────────────

const DP_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AMD', 'GLD'];
const dpFmtNotional = n =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` :
  n >= 1e9  ? `$${(n / 1e9).toFixed(2)}B` :
  n >= 1e6  ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`;
const dpFmtWeek = w => { const [, m, d] = w.split('-'); return `${+m}/${+d}`; };

// Candles with dark pool levels drawn as labeled horizontal lines — level
// thickness/opacity scales with notional, so the heaviest institutional
// price levels read at a glance. Levels above spot act as supply, below as
// demand. Mirrors the classic "DP levels on the chart" layout.
function DarkPoolChart({ candles, levels, price, scale = 1, fmtPx }) {
  if (!candles?.length || candles.length < 5) return null;
  // Candles must ride the same scale as the levels and price line — in SPX
  // view everything is ×10, otherwise the y-axis is built from SPY-scale
  // candles and every level falls outside it
  const data = candles.slice(-90).map(c => scale === 1 ? c : ({
    ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale,
  }));

  const W = 340, H = 240, labelW = 108;
  const plotW = W - labelW;
  const maxNotional = Math.max(...levels.map(l => l.notional), 1);

  let lo = Math.min(...data.map(c => c.low));
  let hi = Math.max(...data.map(c => c.high));
  // Include any level that sits within a sane distance of price so the chart
  // doesn't get crushed by a far-away outlier level
  levels.forEach(l => {
    const p = l.price * scale;
    if (p > lo * 0.9 && p < hi * 1.1) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  });
  const pad = (hi - lo) * 0.06 || hi * 0.01;
  lo -= pad; hi += pad;

  const y = v => ((hi - v) / (hi - lo)) * (H - 12) + 6;
  const x = i => 2 + (i / data.length) * (plotW - 4);
  const cw = Math.max(1.2, ((plotW - 4) / data.length) * 0.62);
  const inRange = v => v != null && v >= lo && v <= hi;

  const visible = levels
    .map(l => ({ ...l, px: l.price * scale }))
    .filter(l => inRange(l.px))
    .sort((a, b) => b.notional - a.notional)
    .slice(0, 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: 'rgba(8,8,20,0.55)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* dark pool levels */}
      {visible.map((l, i) => {
        const w = 0.5 + (l.notional / maxNotional) * 1.8;
        const op = 0.35 + (l.notional / maxNotional) * 0.55;
        const above = l.px > price;
        const col = above ? '#a78bfa' : '#8b5cf6';
        const ly = y(l.px);
        return (
          <g key={i}>
            <line x1={0} x2={plotW} y1={ly} y2={ly} stroke={col} strokeWidth={w} strokeDasharray="5 3" opacity={op} />
            <rect x={plotW + 1} y={ly - 5.5} width={labelW - 3} height={11} rx={2} fill={col} opacity={0.9} />
            <text x={plotW + 4} y={ly + 3} fontSize="7.5" fontWeight="800" fill="#0b0616">
              DP {dpFmtNotional(l.notional)} · {dpFmtWeek(l.week)}
            </text>
          </g>
        );
      })}

      {/* candles */}
      {data.map((c, i) => {
        const up = c.close >= c.open;
        const col = up ? '#d1d5db' : '#6b7280';
        const cx = x(i) + cw / 2;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="0.6" />
            <rect x={x(i)} y={y(Math.max(c.open, c.close))} width={cw}
              height={Math.max(0.8, Math.abs(y(c.open) - y(c.close)))}
              fill={up ? 'none' : col} stroke={col} strokeWidth="0.5" />
          </g>
        );
      })}

      {/* current price */}
      {inRange(price) && (
        <g>
          <line x1={0} x2={plotW} y1={y(price)} y2={y(price)} stroke="#f9fafb" strokeWidth="0.8" strokeDasharray="2 2" />
          <rect x={plotW + 1} y={y(price) - 5.5} width={labelW - 3} height={11} rx={2} fill="#f9fafb" />
          <text x={plotW + 4} y={y(price) + 3} fontSize="7.5" fontWeight="900" fill="#0b0616">{fmtPx(price)}</text>
        </g>
      )}
    </svg>
  );
}

function DarkPoolPanel({ onChart }) {
  const [symbol, setSymbol] = useState('SPY');
  const [data, setData] = useState(null);
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // The SPX view mirrors how desks read SPY dark pool levels against the index
  const [spxView, setSpxView] = useState(false);

  const load = useCallback(async (sym) => {
    setLoading(true); setErr('');
    try {
      const [dp, ohlc] = await Promise.all([
        fetch(`/api/darkpool?symbol=${encodeURIComponent(sym)}&weeks=26`).then(r => r.json()),
        fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=1d&range=6mo`).then(r => r.json()),
      ]);
      if (dp.error) setErr(dp.error);
      setData(dp);
      setCandles(ohlc.candles || []);
      setPrice(ohlc.meta?.regularMarketPrice || ohlc.candles?.[ohlc.candles.length - 1]?.close || null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  const scale = spxView && symbol === 'SPY' ? 10 : 1;
  const fmtPx = p => p == null ? '—' : `$${p.toFixed(2)}`;
  const levels = data?.levels || [];
  const dispPrice = price != null ? price * scale : null;

  // Nearest levels either side of spot — the actionable read
  const sorted = [...levels].map(l => ({ ...l, px: l.price * scale }));
  const above = sorted.filter(l => dispPrice != null && l.px > dispPrice).sort((a, b) => a.px - b.px);
  const below = sorted.filter(l => dispPrice != null && l.px <= dispPrice).sort((a, b) => b.px - a.px);
  const heaviest = [...sorted].sort((a, b) => b.notional - a.notional).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Dark Pool Levels</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
            Off-exchange price levels from FINRA ATS transparency data — where institutional size actually printed
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {symbol === 'SPY' && (
            <button onClick={() => setSpxView(v => !v)} style={{
              padding: '4px 9px', borderRadius: 5, fontSize: 9, fontWeight: 800, border: 'none', cursor: 'pointer',
              background: spxView ? 'rgba(168,139,250,0.22)' : 'rgba(255,255,255,0.05)',
              color: spxView ? '#c4b5fd' : '#6b7280',
            }}>×10 → SPX</button>
          )}
          {onChart && (
            <button onClick={() => onChart(spxView && symbol === 'SPY' ? 'SP:SPX' : symbol)} title="Open full TradingView chart" style={{
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 5,
              padding: '4px 9px', color: '#a5b4fc', fontSize: 9, fontWeight: 700, cursor: 'pointer',
            }}>📈 TV</button>
          )}
          <button onClick={() => load(symbol)} disabled={loading} style={{
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6,
            padding: '4px 10px', color: loading ? '#4b5563' : '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      {/* Symbol picker */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {DP_SYMBOLS.map(s => (
          <button key={s} onClick={() => setSymbol(s)} style={{
            padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer',
            background: symbol === s ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
            color: symbol === s ? '#c4b5fd' : '#4b5563',
          }}>{s}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 10, color: '#fca5a5', padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{err}</div>}

      {loading && !levels.length && <div style={{ fontSize: 11, color: '#4b5563', padding: 16, textAlign: 'center' }}>Loading FINRA off-exchange data…</div>}

      {!loading && !levels.length && !err && (
        <div style={{ padding: 20, textAlign: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>No off-exchange data published for {symbol}</div>
        </div>
      )}

      {levels.length > 0 && (
        <>
          <DarkPoolChart candles={candles} levels={levels} price={dispPrice} scale={scale} fmtPx={fmtPx} />

          {/* Nearest levels — the actionable read */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[['NEAREST ABOVE — supply', above.slice(0, 3), '#a78bfa'], ['NEAREST BELOW — demand', below.slice(0, 3), '#8b5cf6']].map(([label, list, col]) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                {list.length ? list.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontFamily: 'monospace', padding: '1px 0' }}>
                    <span style={{ color: col, fontWeight: 800 }}>{fmtPx(l.px)}</span>
                    <span style={{ color: '#6b7280' }}>
                      {dpFmtNotional(l.notional)} · {dispPrice ? `${(Math.abs(l.px - dispPrice) / dispPrice * 100).toFixed(1)}%` : ''}
                    </span>
                  </div>
                )) : <div style={{ fontSize: 9, color: '#374151' }}>none in range</div>}
              </div>
            ))}
          </div>

          {/* Heaviest levels */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 5 }}>HEAVIEST DARK POOL LEVELS — LAST {data.weeksCovered} WEEKS</div>
            {heaviest.map((l, i) => {
              const isAbove = dispPrice != null && l.px > dispPrice;
              const col = isAbove ? '#a78bfa' : '#8b5cf6';
              const pct = Math.max(6, (l.notional / heaviest[0].notional) * 100);
              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9.5, fontFamily: 'monospace', marginBottom: 1 }}>
                    <span style={{ color: '#e5e7eb', fontWeight: 800 }}>
                      {fmtPx(l.px)} <span style={{ color: '#4b5563', fontWeight: 600 }}>· wk {dpFmtWeek(l.week)} · {l.venues} venues</span>
                    </span>
                    <span style={{ color: col, fontWeight: 800 }}>{dpFmtNotional(l.notional)}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: col, opacity: 0.75 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Latest week flow split — dark pool vs wholesaler internalization */}
          {(() => {
            const last = levels[levels.length - 1];
            if (!last?.otcNotional) return null;
            const total = last.notional + last.otcNotional;
            const atsPct = (last.notional / total) * 100;
            return (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>
                  OFF-EXCHANGE FLOW SPLIT — WEEK OF {dpFmtWeek(last.week)}
                </div>
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ width: `${atsPct}%`, background: '#8b5cf6' }} />
                  <div style={{ width: `${100 - atsPct}%`, background: '#3b82f6' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace' }}>
                  <span style={{ color: '#c4b5fd' }}>■ Dark pools (ATS) {dpFmtNotional(last.notional)} · {atsPct.toFixed(0)}%</span>
                  <span style={{ color: '#93c5fd' }}>■ Wholesalers {dpFmtNotional(last.otcNotional)}</span>
                </div>
                <div style={{ fontSize: 8, color: '#374151', marginTop: 4 }}>
                  Dark pools are institutional block venues. Wholesalers (Citadel, Virtu, Jane Street) internalize mostly retail flow — off-exchange too, but a different signal.
                </div>
              </div>
            );
          })()}

          {/* Top venues */}
          {data.venues?.length > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 5 }}>TOP ATS VENUES — WHERE THE SIZE ROUTED</div>
              {data.venues.slice(0, 6).map((v, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontFamily: 'monospace', padding: '1px 0' }}>
                  <span style={{ color: '#9ca3af' }}>{v.name}</span>
                  <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{dpFmtNotional(v.notional)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>
            Each level is one week's volume-weighted average execution price across all reporting ATS (dark pool) venues, sized by that week's total dark pool notional — real regulator-reported off-exchange activity, not a volume proxy. Wholesaler/internalizer flow is tracked separately and excluded from the levels. Source: FINRA OTC Transparency, published weekly with a 2–4 week lag{data.latestWeek ? ` (latest week ${dpFmtWeek(data.latestWeek)}, ${data.lagDays}d ago)` : ''} — so these are structural levels institutions accumulated around, not same-day prints. Use as context, not entry triggers.
          </div>
        </>
      )}
    </div>
  );
}

function scoreCommoditySignal(d) {
  const price = d?.regularMarketPrice;
  if (!price) return null;
  const hi52  = d.fiftyTwoWeekHigh;
  const lo52  = d.fiftyTwoWeekLow;
  if (!hi52 || !lo52 || hi52 <= lo52) return null;

  const range    = hi52 - lo52;
  const pos      = (price - lo52) / range;
  const chgPct   = d.regularMarketChangePercent ?? 0;
  const dayHi    = d.regularMarketDayHigh  ?? price;
  const dayLo    = d.regularMarketDayLow   ?? price;
  const atrPct   = Math.max(((dayHi - dayLo) / price) * 100, 0.8);

  let dir = null, type = '', conf = 0, reason = '';

  if      (pos > 0.93)                         { dir = 'short'; type = 'RESIST';  conf = 65; reason = `Near 52W high $${hi52.toFixed(2)} — resistance / overbought`; }
  else if (pos < 0.07)                         { dir = 'long';  type = 'SUPPORT'; conf = 68; reason = `Near 52W low $${lo52.toFixed(2)} — support / oversold`; }
  else if (chgPct > 2.0  && pos > 0.55)        { dir = 'long';  type = 'MOM';     conf = 60; reason = `+${chgPct.toFixed(1)}% daily move, in upper half of 52W range`; }
  else if (chgPct < -2.0 && pos < 0.45)        { dir = 'short'; type = 'MOM';     conf = 58; reason = `${chgPct.toFixed(1)}% sell-off, in lower half of 52W range`; }
  else if (chgPct > 1.5  && pos > 0.4 && pos < 0.6) { dir = 'long'; type = 'BREAK'; conf = 52; reason = `Upside momentum at mid-range — watching for range break`; }
  else if (chgPct < -1.5 && pos > 0.4 && pos < 0.6) { dir = 'short'; type = 'BREAK'; conf = 50; reason = `Downside pressure at mid-range — potential breakdown`; }

  if (!dir) return null;

  const slPct = (atrPct * 1.5) / 100;
  const tpPct = (atrPct * 2.25) / 100; // 1.5:1 reward:risk
  return {
    dir, type, conf, reason, pos,
    entry: price, chgPct,
    sl: dir === 'long' ? price * (1 - slPct) : price * (1 + slPct),
    tp: dir === 'long' ? price * (1 + tpPct) : price * (1 - tpPct),
    rr: (tpPct / slPct).toFixed(1),
  };
}

const FX_NAMES = {
  'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'USDJPY=X': 'USD/JPY',
  'AUDUSD=X': 'AUD/USD', 'NZDUSD=X': 'NZD/USD',
  'GBPJPY=X': 'GBP/JPY', 'GC=F': 'XAU/USD', 'SI=F': 'XAG/USD',
};

// Persistent signal-alert feed shared by forex + ICT + scalp engines (shown in
// Alerts tab). Returns true only when the alert is new — the same signal seen by
// two watchers (panel + background) within 30 min is logged and notified once.
function logSignalAlert(entry) {
  try {
    const log = JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]');
    const dup = log.find(e =>
      e.source === entry.source && e.name === entry.name &&
      e.dir === entry.dir && e.type === entry.type &&
      Date.now() - e.time < 30 * 60 * 1000
    );
    if (dup) return false;
    log.unshift({ ...entry, id: Date.now() + Math.random(), time: Date.now() });
    localStorage.setItem('fe_signal_alerts', JSON.stringify(log.slice(0, 200)));
    return true;
  } catch { return false; }
}

// ICT killzones — the narrow, highest-probability windows (New York time) where
// institutional order flow concentrates. Tighter than a broad "session is open"
// check. DST-safe via Intl (no manual UTC offset math).
function ictKillzones() {
  const parts  = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const etHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const zones = [];
  if (etHour >= 2  && etHour < 5)  zones.push('LONDON OPEN');
  if (etHour >= 7  && etHour < 10) zones.push('NY OPEN');
  if (etHour >= 10 && etHour < 12) zones.push('LONDON CLOSE');
  if (etHour >= 20)                zones.push('ASIAN');
  return zones;
}

// News blackout — hard-blocks alerts within a window of major US releases,
// which move price on liquidity/positioning, not on technical structure, and
// aren't something the backtest's OHLC-only simulation can price in (no
// spread widening or slippage modeled). FOMC/CPI/NFP release at fixed times
// (ET); dates come from FOMC_DATES/CPI_DATES (declared later, but this is
// only ever called from event handlers, well after module load).
const NEWS_BLACKOUT_MIN = 20;
function newsBlackoutActive() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const get = t => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
  const todayET = `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`;
  const minutesNow = get('hour') * 60 + get('minute');

  const events = [];
  if (typeof FOMC_DATES !== 'undefined' && FOMC_DATES.includes(todayET)) events.push({ label: 'FOMC', at: 14 * 60 });      // 2:00 PM ET statement
  if (typeof CPI_DATES  !== 'undefined' && CPI_DATES.includes(todayET))  events.push({ label: 'CPI',  at: 8 * 60 + 30 });  // 8:30 AM ET
  // NFP: first Friday of the month, 8:30 AM ET
  const d = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (d.getDay() === 5 && d.getDate() <= 7) events.push({ label: 'NFP', at: 8 * 60 + 30 });

  for (const e of events) {
    const diff = Math.abs(minutesNow - e.at);
    if (diff <= NEWS_BLACKOUT_MIN) return { active: true, event: e.label, minutesFrom: minutesNow - e.at };
  }
  return { active: false, event: null, minutesFrom: null };
}

// Regime classification — Kaufman-style efficiency ratio: how much of the
// path traveled over N bars was net directional movement vs back-and-forth
// noise. High = trending (a clean directional move), low = ranging/choppy.
function efficiencyRatio(candles, n = 20) {
  if (!candles || candles.length < n + 1) return null;
  const recent = candles.slice(-n - 1);
  const net = Math.abs(recent[recent.length - 1].close - recent[0].close);
  let path = 0;
  for (let i = 1; i < recent.length; i++) path += Math.abs(recent[i].close - recent[i - 1].close);
  return path > 0 ? net / path : 0;
}
function regimeOf(candles, n = 20) {
  const er = efficiencyRatio(candles, n);
  if (er == null) return null;
  return er >= 0.35 ? 'trending' : er <= 0.2 ? 'ranging' : 'transitional';
}

// Volatility state — current range vs its own recent average. Expansion =
// breakout-friendly (ORB wants this); compression = quiet, reversion-prone.
function volatilityState(candles, n = 20) {
  if (!candles || candles.length < n + 1) return null;
  const recent = candles.slice(-n - 1, -1);
  const avgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
  if (!(avgRange > 0)) return null;
  const lastRange = candles[candles.length - 1].high - candles[candles.length - 1].low;
  const ratio = lastRange / avgRange;
  return ratio >= 1.5 ? 'expansion' : ratio <= 0.6 ? 'compression' : 'normal';
}

// Which regime each setup type is hypothesized to want — reversal setups favor
// ranging/exhausted conditions, continuation setups favor a trending tape,
// breakouts favor volatility expansion. This is a hypothesis until StatsPanel's
// backtest measures whether matched-regime trades actually outperform
// mismatched ones (bt.validation.regimeHelps) — only then does it gate live
// alerts (see edgeFilterOk). Until proven, signals still carry the regime tag.
const SETUP_REGIME = {
  'LIQ SWEEP': 'ranging', 'LIQ_SWEEP': 'ranging',
  'STRUCTURE': 'trending',
  'FVG': 'trending', 'FVG + OTE': 'trending', 'FAIR VALUE GAP': 'trending', 'FAIR_VALUE_GAP': 'trending',
  'CHOCH MITIGATION': 'ranging', 'BOS MITIGATION': 'trending',
};
function regimeMatches(setup, regime) {
  const want = SETUP_REGIME[setup];
  if (!want || !regime) return true; // no hypothesis for this setup (e.g. ORB, CONF n/x) — don't block
  return want === regime || regime === 'transitional';
}

// Daily risk circuit breaker — reads today's closed trades from the live
// tracker (fe_signal_alerts) and halts new alerts once the day's realized
// loss reaches -2R or 3 losing trades, whichever comes first. Resets at ET
// midnight since that's the FX day boundary. Protects against a system that's
// individually well-calibrated but hits a genuinely bad day/correlated move.
const DAILY_MAX_LOSS_R = -2;
const DAILY_MAX_LOSSES = 3;
function dailyRiskHalt() {
  try {
    const log = JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]');
    const now = new Date();
    const etDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const todays = log.filter(e => e.closedAt && new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.closedAt)) === etDate);
    const losses = todays.filter(e => e.outcome === 'LOSS').length;
    const netR = todays.reduce((s, e) => s + (e.rMult ?? 0), 0);
    if (losses >= DAILY_MAX_LOSSES) return { halted: true, reason: `${losses} losing trades today` };
    if (netR <= DAILY_MAX_LOSS_R) return { halted: true, reason: `${netR.toFixed(1)}R realized today` };
    return { halted: false, reason: null, netR: +netR.toFixed(1), losses };
  } catch { return { halted: false, reason: null }; }
}

// Data-driven edge filter — once a backtest has been run, suppress alerts the
// data says lose money. All rules are derived from the IN-SAMPLE slice only
// (see StatsPanel's out-of-sample split); bt.validation carries the honest
// out-of-sample verdict per source, and a source whose edge FAILED on held-out
// data doesn't get to page anyone. Setups are graded per pair, not pooled —
// a setup only gets blocked on pairs where it actually loses.
function edgeFilterOk(source, name, setup, regime) {
  try {
    const bt = JSON.parse(localStorage.getItem('fe_backtest') || 'null');
    if (!bt) return true; // no backtest yet — don't block anything
    if (bt.validation) {
      if (source === 'INTRADAY'   && bt.validation.intradayOOS   === false) return false;
      if (source === 'CONFLUENCE' && bt.validation.confluenceOOS === false) return false;
      if (source === 'ICT'        && bt.validation.swingOOS      === false) return false;
    }
    if (source === 'INTRADAY' && name) {
      const row = (bt.rows || []).find(r => r.pair === name);
      if (row?.intra && row.intra.n >= 10 && row.intra.totalR <= 0) return false;
      if (setup && bt.pairSetups) {
        const ps = bt.pairSetups[`${name}|${setup}`];
        if (ps && ps.n >= 8 && ps.totalR <= 0) return false;
      }
    }
    // ICT source = the daily swing engine, backtested via backtestDailySwing
    if (source === 'ICT' && name) {
      const row = (bt.swingRows || []).find(r => r.pair === name);
      if (row?.swing && row.swing.n >= 5 && row.swing.totalR <= 0) return false;
      if (setup && bt.swingPairSetups) {
        const ps = bt.swingPairSetups[`${name}|${setup}`];
        if (ps && ps.n >= 5 && ps.totalR <= 0) return false;
      }
    }
    // Regime gate — only enforced once the backtest has shown matched-regime
    // trades actually outperform mismatched ones (see StatsPanel's regime
    // check). Until proven, signals still carry the regime tag but aren't
    // blocked on it — "measure before you gate" applies here too.
    if (regime && bt.validation?.regimeHelps === true && setup && !regimeMatches(setup, regime)) return false;
    // Backtest evidence only covers INTRADAY/CONFLUENCE/ICT — other sources
    // (ORB, SMC, FOREX) keep their own conf/RR/session gates for now
    return true;
  } catch { return true; }
}

// Alert quality gate — only A-grade setups reach the feed and notifications:
// confidence >= 70, reward:risk >= 1.5:1, intraday/SMC only during London/NY
// sessions, nothing within 20min of FOMC/CPI/NFP (unpriceable slippage risk),
// nothing once the day's risk budget is blown (-2R or 3 losses), nothing the
// backtest shows losing money for this pair/setup/regime.
function isHighQualitySignal(source, conf, rr, name, setup, regime) {
  if ((conf ?? 0) < 70) return false;
  if (rr != null && parseFloat(rr) < 1.5) return false;
  if (newsBlackoutActive().active) return false;
  if (dailyRiskHalt().halted) return false;
  if (source === 'INTRADAY' || source === 'SMC') {
    const s = fxSessions();
    if (!s.includes('LONDON') && !s.includes('NEW YORK')) return false;
  }
  if (!edgeFilterOk(source, name, setup, regime)) return false;
  return true;
}

// Derive a directional bias in a uniform shape from either the daily ictAnalyze()
// result or an ictIntradayAnalyze() result, so a higher timeframe's read can gate
// a lower timeframe's entry (ICT: never trade against the HTF bias).
function ictHtfBias(a) {
  if (!a) return null;
  if (a.bias) return { verdict: a.bias.verdict, structure: a.structure };
  const verdict = a.sig ? (a.sig.dir === 'long' ? 'BUY' : 'SELL')
    : a.structure === 'bullish' ? 'BUY' : a.structure === 'bearish' ? 'SELL' : 'WAIT';
  return { verdict, structure: a.structure };
}

// Rejection-candle confirmation — require a candle that wicked into the zone and
// closed back out strongly (long wick, close near the far edge of its range)
// before treating an OB/FVG tap as a valid entry, instead of firing the instant
// price is merely inside the zone.
// TP1 distance in R for the scale-out playbook: bank half at +0.75R and move
// the stop to breakeven, run the rest to TP2. Grid-tested against live data —
// 0.75R maximizes expectancy now that stops are tight and TP2 floors at 1.5R.
const ICT_TP1_R = 0.75;

// Points of Interest — unmitigated FVG zones away from current price, in the
// direction of the prevailing bias. Each is a ready-made limit-entry plan:
// entry at the zone edge, tight stop beyond the zone, fixed 1.5:1 target.
// Returns the best two (OTE-confluent first, then nearest).
function ictComputePOIs({ candles, fvgs, bsl, ssl, atr, hi, lo, price, wantLong, wantShort }) {
  const tol = atr * 0.25;
  const unmit = (z, d) => {
    for (let i = (z.idx ?? 0) + 1; i < candles.length; i++) {
      if (d === 'long' ? candles[i].close < z.bottom : candles[i].close > z.top) return false;
    }
    return true;
  };
  const pois = [];
  const add = (z, kind, d) => {
    const entry = d === 'long' ? z.top : z.bottom;
    let sl = d === 'long' ? z.bottom - atr * 0.2 : z.top + atr * 0.2;
    // Floor the risk so spread can't eat the stop; cap it so wide zones can't
    // create oversized stops
    const minRisk = Math.max(atr * 0.4, price * 0.0008);
    const maxRisk = atr * 1.2;
    if (Math.abs(entry - sl) < minRisk) sl = d === 'long' ? entry - minRisk : entry + minRisk;
    if (Math.abs(entry - sl) > maxRisk) sl = d === 'long' ? entry - maxRisk : entry + maxRisk;
    const risk = Math.abs(entry - sl);
    if (!(risk > 0)) return;
    // Fixed 1.5:1 reward:risk
    const tp = d === 'long' ? entry + risk * 1.5 : entry - risk * 1.5;
    const retr = hi > lo ? (d === 'long' ? (hi - entry) / (hi - lo) : (entry - lo) / (hi - lo)) : 0;
    pois.push({
      dir: d, kind, top: z.top, bottom: z.bottom, idx: z.idx,
      entry, sl, tp, rr: +(Math.abs(tp - entry) / risk).toFixed(1),
      distPct: +(Math.abs(price - entry) / price * 100).toFixed(2),
      inOTE: retr >= 0.62 && retr <= 0.79,
    });
  };
  if (wantLong) {
    fvgs.filter(f => f.type === 'bullish' && f.top < price - tol && unmit(f, 'long')).forEach(f => add(f, 'FVG', 'long'));
  }
  if (wantShort) {
    fvgs.filter(f => f.type === 'bearish' && f.bottom > price + tol && unmit(f, 'short')).forEach(f => add(f, 'FVG', 'short'));
  }
  pois.sort((a, b) => ((b.inOTE ? 1 : 0) - (a.inOTE ? 1 : 0)) || (a.distPct - b.distPct));
  return pois.slice(0, 2);
}

function hasRejectionCandle(candles, zTop, zBottom, dir, lookback = 3) {
  if (!candles?.length) return false;
  for (const c of candles.slice(-lookback)) {
    if (c.high < zBottom || c.low > zTop) continue;
    const body  = Math.abs(c.close - c.open);
    const range = (c.high - c.low) || 1e-9;
    if (dir === 'long') {
      const lowerWick = Math.min(c.open, c.close) - c.low;
      if (lowerWick >= body * 0.4 && (c.close - c.low) / range >= 0.6) return true;
    } else {
      const upperWick = c.high - Math.max(c.open, c.close);
      if (upperWick >= body * 0.4 && (c.high - c.close) / range >= 0.6) return true;
    }
  }
  return false;
}

function scoreForexSignal(d) {
  const price = d?.regularMarketPrice;
  if (!price) return null;
  const hi52 = d.fiftyTwoWeekHigh;
  const lo52 = d.fiftyTwoWeekLow;
  if (!hi52 || !lo52 || hi52 <= lo52) return null;

  const range  = hi52 - lo52;
  const pos    = (price - lo52) / range;
  const chgPct = d.regularMarketChangePercent ?? 0;
  const dayHi  = d.regularMarketDayHigh ?? price;
  const dayLo  = d.regularMarketDayLow  ?? price;
  const atrPct = Math.max(((dayHi - dayLo) / price) * 100, 0.15);

  let dir = null, type = '', conf = 0, reason = '';

  if      (pos > 0.93 && chgPct > 0)          { dir = 'short'; type = 'RESIST';  conf = 67; reason = `Near 52W high — overbought resistance zone`; }
  else if (pos < 0.07 && chgPct < 0)          { dir = 'long';  type = 'SUPPORT'; conf = 70; reason = `Near 52W low — oversold support zone`; }
  else if (chgPct >  0.5 && pos > 0.55)       { dir = 'long';  type = 'TREND';   conf = Math.min(72, 56 + Math.abs(chgPct) * 5); reason = `+${chgPct.toFixed(2)}% daily — uptrend momentum`; }
  else if (chgPct < -0.5 && pos < 0.45)       { dir = 'short'; type = 'TREND';   conf = Math.min(70, 54 + Math.abs(chgPct) * 5); reason = `${chgPct.toFixed(2)}% daily — downtrend momentum`; }
  else if (pos > 0.96)                         { dir = 'long';  type = 'BREAK';   conf = 62; reason = `Pressing 52W highs — potential upside breakout`; }
  else if (pos < 0.04)                         { dir = 'short'; type = 'BREAK';   conf = 62; reason = `Pressing 52W lows — potential breakdown`; }

  if (!dir) return null;

  const slPct = (atrPct * 1.5) / 100;
  const tpPct = (atrPct * 2.25) / 100; // 1.5:1 reward:risk
  return {
    dir, type, conf: Math.round(conf), reason, pos, entry: price, chgPct,
    name: FX_NAMES[d.symbol] || d.symbol,
    sl: dir === 'long' ? price * (1 - slPct) : price * (1 + slPct),
    tp: dir === 'long' ? price * (1 + tpPct) : price * (1 - tpPct),
    rr: (tpPct / slPct).toFixed(1),
  };
}

// ─── ICT Smart Money Concepts ───────────────────────────────────────────────

const ICT_PAIRS = [
  { symbol: 'EURUSD=X',  name: 'EUR/USD' },
  { symbol: 'GBPUSD=X',  name: 'GBP/USD' },
  { symbol: 'USDJPY=X',  name: 'USD/JPY' },
  { symbol: 'AUDUSD=X',  name: 'AUD/USD' },
  { symbol: 'NZDUSD=X',  name: 'NZD/USD' },
  { symbol: 'GBPJPY=X',  name: 'GBP/JPY' },
  { symbol: 'XAUUSD',    name: 'XAU/USD' },
  { symbol: 'XAGUSD',    name: 'XAG/USD' },
];

function ictFindSwings(candles, lookback = 3) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    const isHigh = candles.slice(i - lookback, i).every(p => p.high <= c.high)
      && candles.slice(i + 1, i + lookback + 1).every(p => p.high <= c.high);
    const isLow  = candles.slice(i - lookback, i).every(p => p.low  >= c.low)
      && candles.slice(i + 1, i + lookback + 1).every(p => p.low  >= c.low);
    if (isHigh) highs.push({ idx: i, price: c.high, time: c.time });
    if (isLow)  lows.push({ idx: i, price: c.low,  time: c.time });
  }
  return { highs, lows };
}

function ictMarketStructure(swings) {
  const { highs, lows } = swings;
  if (highs.length < 2 || lows.length < 2) return 'ranging';
  const rh = highs.slice(-3), rl = lows.slice(-3);
  const hhC = rh.slice(1).filter((h, i) => h.price > rh[i].price).length;
  const hlC = rl.slice(1).filter((l, i) => l.price > rl[i].price).length;
  const lhC = rh.slice(1).filter((h, i) => h.price < rh[i].price).length;
  const llC = rl.slice(1).filter((l, i) => l.price < rl[i].price).length;
  if (hhC >= 1 && hlC >= 1) return 'bullish';
  if (lhC >= 1 && llC >= 1) return 'bearish';
  return 'ranging';
}

function ictFairValueGaps(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    if (c3.low  > c1.high) fvgs.push({ type: 'bullish', top: c3.low,  bottom: c1.high, mid: (c3.low  + c1.high) / 2, idx: i });
    if (c3.high < c1.low)  fvgs.push({ type: 'bearish', top: c1.low,  bottom: c3.high, mid: (c1.low  + c3.high) / 2, idx: i });
  }
  return fvgs.slice(-20);
}

function ictAnalyze(candles, currentPrice) {
  if (!candles || candles.length < 20) return null;
  const swings   = ictFindSwings(candles);
  const structure = ictMarketStructure(swings);
  const fvgs     = ictFairValueGaps(candles);

  const bsl = swings.highs.slice(-3).map(h => h.price);
  const ssl = swings.lows.slice(-3).map(l => l.price);

  const recent    = candles.slice(-20);
  const rangeHigh = Math.max(...recent.map(c => c.high));
  const rangeLow  = Math.min(...recent.map(c => c.low));
  const rangeMid  = (rangeHigh + rangeLow) / 2;
  const priceZone = currentPrice > rangeMid ? 'premium' : 'discount';

  const last      = candles[candles.length - 1];
  const sweptBSL  = bsl.some(lv => last.high > lv && last.close < lv);
  const sweptSSL  = ssl.some(lv => last.low  < lv && last.close > lv);

  const activeFVGs = fvgs.filter(f => f.type === 'bullish' ? currentPrice < f.top : currentPrice > f.bottom);

  const atr = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;

  let signal = null, signalType = '', confidence = 0, reason = '';
  let sl = 0, tp = 0;

  if (sweptSSL && structure !== 'bearish') {
    signal = 'long';  signalType = 'LIQ_SWEEP';   confidence = 78;
    reason = 'SSL swept — price closed above → institutional reversal long';
    sl = currentPrice - atr * 1.0; tp = currentPrice + atr * 1.5;
  } else if (sweptBSL && structure !== 'bullish') {
    signal = 'short'; signalType = 'LIQ_SWEEP';   confidence = 78;
    reason = 'BSL swept — price closed below → distribution / short reversal';
    sl = currentPrice + atr * 1.0; tp = currentPrice - atr * 1.5;
  } else if (structure === 'bullish' && priceZone === 'discount') {
    const nearFVG = activeFVGs.find(f => f.type  === 'bullish' && currentPrice >= f.bottom && currentPrice <= f.top);
    const fvgConfirmed = nearFVG && hasRejectionCandle(candles, nearFVG.top, nearFVG.bottom, 'long');
    if (fvgConfirmed) {
      signal = 'long'; signalType = 'FAIR_VALUE_GAP'; confidence = 68;
      reason = 'Confirmed rejection filling bullish FVG — imbalance fill with bullish structure';
      sl = nearFVG.bottom - atr * 0.5; tp = currentPrice + atr * 1.5;
    } else {
      signal = 'long'; signalType = 'STRUCTURE'; confidence = 60;
      reason = 'HH/HL market structure in discount zone — trend continuation';
      sl = currentPrice - atr * 1.25; tp = currentPrice + atr * 2;
    }
  } else if (structure === 'bearish' && priceZone === 'premium') {
    const nearFVG = activeFVGs.find(f => f.type  === 'bearish' && currentPrice >= f.bottom && currentPrice <= f.top);
    const fvgConfirmed = nearFVG && hasRejectionCandle(candles, nearFVG.top, nearFVG.bottom, 'short');
    if (fvgConfirmed) {
      signal = 'short'; signalType = 'FAIR_VALUE_GAP'; confidence = 68;
      reason = 'Confirmed rejection filling bearish FVG — imbalance fill with bearish structure';
      sl = nearFVG.top + atr * 0.5; tp = currentPrice - atr * 1.5;
    } else {
      signal = 'short'; signalType = 'STRUCTURE'; confidence = 60;
      reason = 'LH/LL market structure in premium zone — trend continuation';
      sl = currentPrice + atr * 1.25; tp = currentPrice - atr * 2;
    }
  }

  // Cap the stop at 1.5 ATR (wide zones can't create oversized risk); every
  // trade at least 1.5:1 — the branch target stands when it's further out
  let tp1 = null;
  if (signal && sl) {
    let risk = Math.abs(currentPrice - sl);
    const maxRisk = atr * 1.5;
    if (risk > maxRisk) { sl = signal === 'long' ? currentPrice - maxRisk : currentPrice + maxRisk; risk = maxRisk; }
    if (risk > 0) {
      if (Math.abs(tp - currentPrice) < risk * 1.5) {
        tp = signal === 'long' ? currentPrice + risk * 1.5 : currentPrice - risk * 1.5;
      }
      tp1 = signal === 'long' ? currentPrice + risk * ICT_TP1_R : currentPrice - risk * ICT_TP1_R; // bank half here
    }
  }

  let orderFlow = 'neutral';
  if      (sweptSSL || (structure === 'bullish' && priceZone === 'discount')) orderFlow = 'accumulating';
  else if (sweptBSL || (structure === 'bearish' && priceZone === 'premium'))  orderFlow = 'distributing';

  // Always-on ICT verdict — BUY / SELL / WAIT from the confluence score, so every
  // pair gets a directional read even when no A+ entry is firing
  let score = 0;
  const factors = [];
  if (structure === 'bullish')      { score += 2; factors.push('HH/HL structure'); }
  else if (structure === 'bearish') { score -= 2; factors.push('LH/LL structure'); }
  if (sweptSSL) { score += 2; factors.push('SSL sweep'); }
  if (sweptBSL) { score -= 2; factors.push('BSL sweep'); }
  if (priceZone === 'discount') { score += 1; factors.push('discount zone'); }
  else                          { score -= 1; factors.push('premium zone'); }
  if (activeFVGs.some(f => f.type === 'bullish' && currentPrice >= f.bottom && currentPrice <= f.top)) { score += 1; factors.push('in bullish FVG'); }
  if (activeFVGs.some(f => f.type === 'bearish' && currentPrice >= f.bottom && currentPrice <= f.top)) { score -= 1; factors.push('in bearish FVG'); }
  const bias = {
    verdict: score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'WAIT',
    score,
    conf: Math.min(85, 50 + Math.abs(score) * 6),
    factors,
  };

  // Pending limit-entry plans at unmitigated FVGs price hasn't reached yet
  const pois = ictComputePOIs({
    candles, fvgs: activeFVGs, bsl, ssl, atr,
    hi: rangeHigh, lo: rangeLow, price: currentPrice,
    wantLong:  bias.verdict === 'BUY'  || (bias.verdict === 'WAIT' && structure !== 'bearish'),
    wantShort: bias.verdict === 'SELL' || (bias.verdict === 'WAIT' && structure !== 'bullish'),
  });

  return {
    structure, priceZone, orderFlow, bsl, ssl, bias, pois,
    fvgCount: activeFVGs.length,
    sweptBSL, sweptSSL,
    activeFVGs: activeFVGs.slice(-3),
    signal, signalType, confidence, reason, entry: currentPrice, sl, tp, tp1,
    rr: (sl && tp && sl !== currentPrice) ? Math.abs((tp - currentPrice) / (sl - currentPrice)).toFixed(1) : null,
    atr, rangeHigh, rangeLow, rangeMid,
    regime: regimeOf(candles, 20), volState: volatilityState(candles, 20),
  };
}

// One clear instruction per metal: BUY or SELL with entry/SL/TP, or WAIT.
// Checks the daily ICT engine first, then 15m intraday, then 5m scalp.
function MetalsTradePlan({ onChart, livePrices }) {
  const [plans, setPlans] = useState({});
  const inflight = useRef({});

  const load = useCallback(async (sym, name) => {
    if (inflight.current[sym]) return;
    inflight.current[sym] = true;
    try {
      const [d1, d15] = await Promise.all([
        fetch(`/api/ohlcv?symbol=${sym}&interval=1d&range=90d`).then(r => r.json()),
        fetch(`/api/ohlcv?symbol=${sym}&interval=15m&range=5d`).then(r => r.json()),
      ]);
      const c1 = d1.candles || [], c15 = d15.candles || [];
      const price = d1.meta?.regularMarketPrice || c1[c1.length - 1]?.close;
      if (!price) return;
      const daily = ictAnalyze(c1, price);
      const dailyHtf = ictHtfBias(daily);
      let plan = null;
      if (daily?.signal) {
        plan = { action: daily.signal === 'long' ? 'BUY' : 'SELL', tf: 'DAILY', conf: daily.confidence, entry: daily.entry, sl: daily.sl, tp: daily.tp, tp1: daily.tp1, rr: daily.rr, reason: daily.reason, setup: daily.signalType.replace('_', ' ') };
      }
      // Higher timeframe sets direction: daily → 15m intraday
      const i = ictIntradayAnalyze(c15, price, 'intra', dailyHtf);
      if (!plan && i?.sig) {
        plan = { action: i.sig.dir === 'long' ? 'BUY' : 'SELL', tf: '15M', conf: i.sig.conf, entry: i.sig.entry, sl: i.sig.sl, tp: i.sig.tp, tp1: i.sig.tp1, rr: i.sig.rr, reason: i.sig.reason, setup: i.sig.setup };
      }
      setPlans(prev => ({ ...prev, [sym]: { name, price, plan, bias: daily?.bias, poi: daily?.pois?.[0] || i?.pois?.[0] || null } }));
    } catch {}
    inflight.current[sym] = false;
  }, []);

  useEffect(() => {
    const run = () => { load('XAUUSD', 'GOLD — XAU/USD'); load('XAGUSD', 'SILVER — XAG/USD'); };
    run();
    const t = setInterval(run, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>METALS TRADE PLAN — CLEAR ENTRY OR WAIT</div>
      {[['XAUUSD', 2], ['XAGUSD', 3]].map(([sym, dp]) => {
        const m = plans[sym];
        if (!m) {
          return <div key={sym} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#4b5563' }}>Loading {sym === 'XAUUSD' ? 'gold' : 'silver'}…</div>;
        }
        const fp = v => v?.toFixed(dp);
        const p = m.plan;
        const ac = p ? (p.action === 'BUY' ? '#10b981' : '#ef4444') : '#6b7280';
        return (
          <div key={sym} style={{ padding: '12px 14px', borderRadius: 10, background: `${ac}08`, border: `1.5px solid ${ac}35`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 13, color: '#f9fafb' }}>{m.name}</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#e5e7eb' }}>{fp(livePrices?.[sym] ?? m.price)}</span>
                {onChart && (
                  <button onClick={() => onChart(TV_SYMBOLS[sym] || sym)} title="Open TradingView chart" style={{
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4,
                    padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                  }}>📈 TV</button>
                )}
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 900, background: `${ac}22`, color: ac, letterSpacing: '0.03em' }}>
                {p ? (p.action === 'BUY' ? '▲ BUY' : '▼ SELL') : '⏸ WAIT'}
              </span>
            </div>
            {p ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                  {[['ENTRY', fp(p.entry), '#e5e7eb'], ['STOP LOSS', fp(p.sl), '#ef4444'], ['TP1 · BANK ½', fp(p.tp1), '#6ee7b7'], ['TP2 · RUNNER', fp(p.tp), '#10b981'], ['R:R', p.rr ? `${p.rr}×` : '—', '#a5b4fc']].map(([lbl, val, color]) => (
                    <div key={lbl} style={{ padding: '6px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 800, color }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#a5b4fc', background: 'rgba(99,102,241,0.14)', padding: '1px 6px', borderRadius: 3 }}>{p.tf}</span>
                  <span style={{ fontSize: 8, fontWeight: 800, color: ac, background: `${ac}14`, padding: '1px 6px', borderRadius: 3 }}>{p.setup}</span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 800, color: p.conf >= 70 ? '#10b981' : '#f59e0b' }}>{p.conf}% confidence</span>
                  <span style={{ fontSize: 9, color: '#6b7280', fontStyle: 'italic' }}>{p.reason}</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  No trade available right now.{' '}
                  {m.bias && m.bias.verdict !== 'WAIT'
                    ? `Leaning ${m.bias.verdict === 'BUY' ? 'bullish' : 'bearish'} (${m.bias.factors.join(', ')}) — waiting for an OB/FVG tap or OTE pullback to give a clean entry.`
                    : 'Confluences are mixed — stand aside until structure, zone, and liquidity agree.'}
                </div>
                {m.poi && (
                  <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: '#5eead4', background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 5, padding: '5px 8px' }}>
                    ⌖ POINT OF INTEREST — set a {m.poi.dir === 'long' ? 'BUY' : 'SELL'} LIMIT @ {fp(m.poi.entry)} · SL {fp(m.poi.sl)} · TP {fp(m.poi.tp)} · {m.poi.rr}R · {m.poi.kind}{m.poi.inOTE ? '+OTE' : ''} · {m.poi.distPct}% from price
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ICTPanel({ onChart, livePrices }) {
  const [pairData, setPairData]   = useState({});
  const [loadingSet, setLoadingSet] = useState({});
  const [selected, setSelected]   = useState(null);
  const prevSignalsRef            = useRef({});

  const inflightRef = useRef({});

  const fetchPair = useCallback(async (sym) => {
    if (inflightRef.current[sym]) return; // don't stack requests on the 1s loop
    inflightRef.current[sym] = true;
    setLoadingSet(prev => prev[sym] === undefined ? { ...prev, [sym]: true } : prev);
    try {
      const res  = await fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=1d&range=90d`);
      const data = await res.json();
      if (data.candles?.length) {
        const price    = data.meta?.regularMarketPrice || data.candles[data.candles.length - 1].close;
        const analysis = ictAnalyze(data.candles, price);
        setPairData(prev => ({ ...prev, [sym]: { candles: data.candles, meta: data.meta, analysis } }));
        if (analysis?.signal) {
          const key = analysis.signal + analysis.signalType;
          const prev = prevSignalsRef.current[sym];
          const name = ICT_PAIRS.find(p => p.symbol === sym)?.name || sym;
          if (prev !== key && isHighQualitySignal('ICT', analysis.confidence, analysis.rr, name, analysis.signalType.replace('_', ' '), analysis.regime)) {
            const isNew = logSignalAlert({ source: 'ICT', symbol: sym, name, dir: analysis.signal, type: analysis.signalType.replace('_', ' '), conf: analysis.confidence, reason: analysis.reason, price: analysis.entry, sl: analysis.sl, tp: analysis.tp, regime: analysis.regime, volState: analysis.volState });
            if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(`FlowEdge ICT — ${name}`, {
                body: `${analysis.signal.toUpperCase()} ${analysis.signalType.replace('_', ' ')} · ${analysis.confidence}%\n${analysis.reason}`,
                icon: '/icon.png',
              });
            }
          }
          prevSignalsRef.current[sym] = key;
        }
      }
    } catch (_) {}
    inflightRef.current[sym] = false;
    setLoadingSet(prev => prev[sym] ? { ...prev, [sym]: false } : prev);
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    ICT_PAIRS.forEach(p => fetchPair(p.symbol));
    const iv = setInterval(() => ICT_PAIRS.forEach(p => fetchPair(p.symbol)), 1000);
    return () => clearInterval(iv);
  }, [fetchPair]);

  const fmtPx = (sym, p) => {
    if (!p) return '—';
    if (sym?.startsWith('XAUUSD')) return p.toFixed(2);
    if (sym?.startsWith('XAGUSD')) return p.toFixed(3);
    return p >= 100 ? p.toFixed(3) : p.toFixed(4);
  };

  const structColor = s => s === 'bullish' ? '#10b981' : s === 'bearish' ? '#ef4444' : '#6b7280';
  const flowColor   = f => f === 'accumulating' ? '#10b981' : f === 'distributing' ? '#ef4444' : '#6b7280';
  const typeColor   = { LIQ_SWEEP: '#f59e0b', FAIR_VALUE_GAP: '#8b5cf6', STRUCTURE: '#6b7280' };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb', letterSpacing: '-0.01em' }}>ICT Smart Money</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Fair Value Gaps · Liquidity Sweeps · Order Flow</div>
        </div>
        <button onClick={() => ICT_PAIRS.forEach(p => fetchPair(p.symbol))} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '5px 10px', color: '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      {/* Gold & silver: one clear instruction — BUY/SELL with levels, or WAIT */}
      <MetalsTradePlan onChart={onChart} livePrices={livePrices} />

      {/* Institutional Order Flow grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>INSTITUTIONAL ORDER FLOW</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {ICT_PAIRS.map(pair => {
            const d   = pairData[pair.symbol];
            const a   = d?.analysis;
            const isl = loadingSet[pair.symbol];
            const dc  = a?.signal === 'long' ? '#10b981' : a?.signal === 'short' ? '#ef4444' : null;
            return (
              <button key={pair.symbol} onClick={() => setSelected(selected === pair.symbol ? null : pair.symbol)} style={{
                background: selected === pair.symbol ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                border: selected === pair.symbol ? '1px solid rgba(99,102,241,0.3)' : `1px solid ${dc ? dc + '25' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 7, padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#e5e7eb' }}>{pair.name}</span>
                  {isl && <span style={{ fontSize: 9, color: '#374151' }}>…</span>}
                  {!isl && dc && <span style={{ fontSize: 8, fontWeight: 800, color: dc, background: dc + '18', padding: '1px 5px', borderRadius: 3 }}>{a.signal === 'long' ? '▲' : '▼'}</span>}
                </div>
                {a ? (
                  <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, color: structColor(a.structure), fontWeight: 700 }}>{a.structure.toUpperCase()}</span>
                    <span style={{ fontSize: 8, color: a.priceZone === 'discount' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{a.priceZone.toUpperCase()}</span>
                    <span style={{ fontSize: 8, color: flowColor(a.orderFlow) }}>{a.orderFlow}</span>
                    {a.sweptSSL && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700 }}>SSL✓</span>}
                    {a.sweptBSL && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700 }}>BSL✓</span>}
                  </div>
                ) : !isl ? (
                  <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>no data</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected pair detail */}
      {selected && pairData[selected]?.analysis && (() => {
        const pair  = ICT_PAIRS.find(p => p.symbol === selected);
        const d     = pairData[selected];
        const a     = d.analysis;
        const price = livePrices?.[selected] ?? (d.meta?.regularMarketPrice || d.candles?.[d.candles.length - 1]?.close);
        const fp    = p => fmtPx(selected, p);
        const dc    = a.signal === 'long' ? '#10b981' : '#ef4444';
        const tc    = typeColor[a.signalType] || '#9ca3af';
        const chartSig = a.signal ? { dir: a.signal, entry: a.entry, sl: a.sl, tp: a.tp, tp1: a.tp1, setup: a.signalType.replace('_', ' ') } : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>ICT ANALYSIS — {pair.name}</span>
                {(() => {
                  const b = a.bias || { verdict: 'WAIT', conf: 50 };
                  const vc = b.verdict === 'BUY' ? '#10b981' : b.verdict === 'SELL' ? '#ef4444' : '#6b7280';
                  return <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 900, background: `${vc}20`, color: vc }}>{b.verdict === 'BUY' ? '▲ BUY' : b.verdict === 'SELL' ? '▼ SELL' : '◦ WAIT'}{b.verdict !== 'WAIT' ? ` ${b.conf}%` : ''}</span>;
                })()}
              </div>
              {onChart && (
                <button onClick={() => onChart(TV_SYMBOLS[selected] || selected)} title="Open TradingView chart" style={{
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4,
                  padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                }}>📈 TradingView</button>
              )}
            </div>

            {/* Confluence chart — sweeps, FVGs, EQ, liquidity, entry/TP/SL */}
            <ICTCandleChart candles={d.candles} sym={selected} tfLabel="1D · ICT" bars={90}
              zones={[
                ...(a.activeFVGs || []).map(f => ({ ...f, fill: 'rgba(139,92,246,0.13)' })),
                ...(a.pois || []).map(p => ({ top: p.top, bottom: p.bottom, idx: p.idx, fill: 'rgba(20,184,166,0.13)' })),
              ]}
              eq={a.rangeMid} bsl={a.bsl || []} ssl={a.ssl || []} sig={chartSig} />
            {!a.signal && (a.pois || []).map((p, i) => (
              <div key={i} style={{ fontSize: 8.5, fontFamily: 'monospace', fontWeight: 700, color: '#5eead4', background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.18)', borderRadius: 4, padding: '3px 7px' }}>
                ⌖ POI {p.dir === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'} @ {fp(p.entry)} · SL {fp(p.sl)} · TP {fp(p.tp)} · {p.rr}R · {p.kind}{p.inOTE ? '+OTE' : ''} · {p.distPct}% away
              </div>
            ))}

            {/* Stats row */}
            <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                ['PRICE',     fp(price),                             '#f9fafb',   18, "'Space Mono',monospace"],
                ['STRUCTURE', a.structure === 'bullish' ? 'HH/HL' : a.structure === 'bearish' ? 'LH/LL' : 'RANGING', structColor(a.structure), 12, 'inherit'],
                ['ZONE',      a.priceZone.toUpperCase(),             a.priceZone === 'discount' ? '#10b981' : '#ef4444', 12, 'inherit'],
                ['ORDER FLOW',a.orderFlow.toUpperCase(),             flowColor(a.orderFlow), 12, 'inherit'],
                ['FVGs',      String(a.fvgCount),                   a.fvgCount > 0 ? '#8b5cf6' : '#374151', 14, 'monospace'],
              ].map(([label, val, color, fs, ff]) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: fs, fontFamily: ff, fontWeight: 800, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Liquidity levels */}
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em' }}>LIQUIDITY LEVELS</div>
              {a.bsl.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', minWidth: 60 }}>BSL (sells)</span>
                  {a.bsl.map((l, i) => <span key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#fca5a5', background: 'rgba(239,68,68,0.08)', padding: '1px 6px', borderRadius: 3 }}>{fp(l)}</span>)}
                  {a.sweptBSL && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>SWEPT ✓</span>}
                </div>
              )}
              {a.ssl.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981', minWidth: 60 }}>SSL (buys)</span>
                  {a.ssl.map((l, i) => <span key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#6ee7b7', background: 'rgba(16,185,129,0.08)', padding: '1px 6px', borderRadius: 3 }}>{fp(l)}</span>)}
                  {a.sweptSSL && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>SWEPT ✓</span>}
                </div>
              )}
            </div>

            {/* ICT signal */}
            {a.signal && (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: `${dc}07`, border: `1px solid ${dc}25`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 13, color: '#f9fafb' }}>ICT Signal</span>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${dc}20`, color: dc }}>{a.signal === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${tc}18`, color: tc }}>{a.signalType.replace('_', ' ')}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 800, color: a.confidence >= 70 ? '#10b981' : '#f59e0b' }}>{a.confidence}%</span>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>{a.reason}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3 }}>
                  {[['Entry', fp(a.entry), '#e5e7eb'], ['TP1 ½', fp(a.tp1), '#6ee7b7'], ['TP2', fp(a.tp), '#10b981'], ['SL', fp(a.sl), '#ef4444'], ['RR', a.rr ? `${a.rr}×` : '—', '#a5b4fc']].map(([lbl, val, color]) => (
                    <div key={lbl} style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                      <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }}>{lbl}</div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[[`Range: ${fp(a.rangeLow)} – ${fp(a.rangeHigh)}`, '#4b5563'], [`Mid: ${fp(a.rangeMid)}`, a.priceZone === 'discount' ? '#10b981' : '#ef4444']].map(([text, color]) => (
                    <span key={text} style={{ fontSize: 9, fontFamily: 'monospace', color, background: `${color}12`, padding: '1px 6px', borderRadius: 3 }}>{text}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Active FVGs */}
            {a.activeFVGs?.length > 0 && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 5 }}>FAIR VALUE GAPS</div>
                {a.activeFVGs.map((fvg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, fontFamily: 'monospace', marginBottom: 2 }}>
                    <span style={{ color: fvg.type === 'bullish' ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 9, minWidth: 50 }}>{fvg.type === 'bullish' ? '▲ BULL' : '▼ BEAR'}</span>
                    <span style={{ color: '#9ca3af' }}>{fp(fvg.bottom)} – {fp(fvg.top)}</span>
                    <span style={{ color: '#4b5563' }}>mid {fp(fvg.mid)}</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        );
      })()}

      {/* Every pair: chart + BUY/SELL/WAIT verdict, entry details when a setup is live */}
      {ICT_PAIRS.filter(p => pairData[p.symbol]?.analysis && p.symbol !== selected)
        .sort((p1, p2) => (pairData[p2.symbol].analysis.signal ? 1 : 0) - (pairData[p1.symbol].analysis.signal ? 1 : 0))
        .map(pair => {
        const d     = pairData[pair.symbol];
        const a     = d.analysis;
        const price = livePrices?.[pair.symbol] ?? (d.meta?.regularMarketPrice || d.candles?.[d.candles.length - 1]?.close);
        const bias  = a.bias || { verdict: 'WAIT', conf: 50, factors: [] };
        const vc    = bias.verdict === 'BUY' ? '#10b981' : bias.verdict === 'SELL' ? '#ef4444' : '#6b7280';
        const dc    = a.signal ? (a.signal === 'long' ? '#10b981' : '#ef4444') : vc;
        const tc    = typeColor[a.signalType] || '#9ca3af';
        const fp    = p => fmtPx(pair.symbol, p);
        return (
          <div key={pair.symbol} onClick={() => setSelected(pair.symbol)} style={{ padding: '9px 12px', borderRadius: 9, background: `${dc}06`, border: `1px solid ${dc}20`, display: 'flex', flexDirection: 'column', gap: 5, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{pair.name}</span>
                <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 900, background: `${vc}20`, color: vc }}>
                  {bias.verdict === 'BUY' ? '▲ BUY' : bias.verdict === 'SELL' ? '▼ SELL' : '◦ WAIT'} {bias.verdict !== 'WAIT' ? `${bias.conf}%` : ''}
                </span>
                {a.signal && <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${tc}18`, color: tc }}>{a.signalType.replace('_', ' ')} ENTRY</span>}
                {onChart && (
                  <button onClick={e => { e.stopPropagation(); onChart(TV_SYMBOLS[pair.symbol] || pair.symbol); }} title="Open TradingView chart" style={{
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4,
                    padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                  }}>📈 TV</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#9ca3af' }}>{fp(price)}</span>
                {a.signal && <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: a.confidence >= 70 ? '#10b981' : '#f59e0b' }}>{a.confidence}%</span>}
              </div>
            </div>
            <ICTCandleChart candles={d.candles} sym={pair.symbol} tfLabel="1D · ICT" bars={90}
              zones={[
                ...(a.activeFVGs || []).map(f => ({ ...f, fill: 'rgba(139,92,246,0.13)' })),
                ...(a.pois || []).map(p => ({ top: p.top, bottom: p.bottom, idx: p.idx, fill: 'rgba(20,184,166,0.13)' })),
              ]}
              eq={a.rangeMid} bsl={a.bsl || []} ssl={a.ssl || []}
              sig={a.signal ? { dir: a.signal, entry: a.entry, sl: a.sl, tp: a.tp, tp1: a.tp1, setup: a.signalType.replace('_', ' ') } : null} />
            <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
              {a.signal ? a.reason : `${bias.verdict === 'WAIT' ? 'No edge yet' : `Bias ${bias.verdict.toLowerCase()}`} — ${bias.factors.join(' · ') || 'no confluences'}`}
            </div>
            {!a.signal && (a.pois || []).map((p, i) => (
              <div key={i} style={{ fontSize: 8.5, fontFamily: 'monospace', fontWeight: 700, color: '#5eead4', background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.18)', borderRadius: 4, padding: '3px 7px' }}>
                ⌖ POI {p.dir === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'} @ {fp(p.entry)} · SL {fp(p.sl)} · TP {fp(p.tp)} · {p.rr}R · {p.kind}{p.inOTE ? '+OTE' : ''} · {p.distPct}% away
              </div>
            ))}
            {a.signal && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3 }}>
                {[['Entry', fp(a.entry), '#e5e7eb'], ['TP1 ½', fp(a.tp1), '#6ee7b7'], ['TP2', fp(a.tp), '#10b981'], ['SL', fp(a.sl), '#ef4444'], ['RR', a.rr ? `${a.rr}×` : '—', '#a5b4fc']].map(([lbl, val, color]) => (
                  <div key={lbl} style={{ padding: '3px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                    <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }}>{lbl}</div>
                    <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[
                [a.structure === 'bullish' ? 'HH/HL' : a.structure === 'bearish' ? 'LH/LL' : 'RANGING', structColor(a.structure)],
                [a.priceZone.toUpperCase(), a.priceZone === 'discount' ? '#10b981' : '#ef4444'],
                [a.orderFlow.toUpperCase(), flowColor(a.orderFlow)],
              ].map(([text, color]) => (
                <span key={text} style={{ fontSize: 9, fontFamily: 'monospace', color, background: `${color}12`, padding: '1px 5px', borderRadius: 3 }}>{text}</span>
              ))}
            </div>
          </div>
        );
      })}

      {ICT_PAIRS.every(p => !pairData[p.symbol]?.analysis) && (
        <div style={{ padding: 20, textAlign: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Loading ICT analysis…</div>
          <div style={{ fontSize: 10, color: '#374151' }}>Fetching 90 days of OHLCV data for 10 pairs</div>
        </div>
      )}

      <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', paddingTop: 4 }}>
        ICT Smart Money — FVGs, Liquidity Sweeps, Order Flow · Educational use only
      </div>
    </div>
  );
}

// ─── Forex Intraday / Scalping — ICT method on 5m/15m ──────────────────────

function atrLast(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  return trs.slice(-period).reduce((s, x) => s + x, 0) / period;
}

// Active forex sessions by UTC hour — scalping edge is best during London/NY
function fxSessions() {
  const h = new Date().getUTCHours();
  const s = [];
  if (h >= 22 || h < 7) s.push('ASIA');
  if (h >= 7 && h < 16) s.push('LONDON');
  if (h >= 12 && h < 21) s.push('NEW YORK');
  return s;
}

// ICT intraday engine — FVGs, OTE fib (62–79%), premium/discount, liquidity
// sweeps, rejection-candle confirmation. mode 'scalp' runs on 5m candles,
// 'intra' on 15m. htfBias (from ictHtfBias) vetoes counter-trend entries and
// boosts confidence when the higher timeframe agrees.
function ictIntradayAnalyze(candles, price, mode, htfBias = null) {
  const isScalp = mode === 'scalp';
  if (!candles || candles.length < (isScalp ? 40 : 60) || !price) return null;
  const atr = atrLast(candles);
  if (!atr) return null;

  const swings    = ictFindSwings(candles, isScalp ? 2 : 3);
  const structure = ictMarketStructure(swings);
  const fvgs      = ictFairValueGaps(candles);

  // Dealing range + equilibrium → premium/discount
  const rangeBars = candles.slice(isScalp ? -48 : -64);
  const hi = Math.max(...rangeBars.map(c => c.high));
  const lo = Math.min(...rangeBars.map(c => c.low));
  if (hi <= lo) return null;
  const eq   = (hi + lo) / 2;
  const zone = price > eq ? 'premium' : 'discount';

  // Fibonacci retracement of the dealing-range leg — OTE = 62–79% pullback
  const retrLong   = (hi - price) / (hi - lo);
  const retrShort  = (price - lo) / (hi - lo);
  const inOTELong  = retrLong  >= 0.62 && retrLong  <= 0.79;
  const inOTEShort = retrShort >= 0.62 && retrShort <= 0.79;

  // Liquidity pools: BSL above swing highs, SSL below swing lows
  const bsl  = swings.highs.slice(-3).map(s => s.price);
  const ssl  = swings.lows.slice(-3).map(s => s.price);
  const last = candles[candles.length - 1];
  const sweptBSL = bsl.some(lv => last.high > lv && last.close < lv);
  const sweptSSL = ssl.some(lv => last.low  < lv && last.close > lv);

  // Is price sitting in an FVG right now?
  const fvgLong  = fvgs.filter(f => f.type === 'bullish').find(f => price >= f.bottom && price <= f.top);
  const fvgShort = fvgs.filter(f => f.type === 'bearish').find(f => price >= f.bottom && price <= f.top);

  // Rejection-candle confirmation — an FVG tap only counts once a candle has
  // wicked in and closed back out strongly, not the instant price touches it
  const fvgLongConfirmed  = fvgLong  && hasRejectionCandle(candles, fvgLong.top,  fvgLong.bottom,  'long');
  const fvgShortConfirmed = fvgShort && hasRejectionCandle(candles, fvgShort.top, fvgShort.bottom, 'short');

  let dir = null, setup = '', conf = 0, reason = '';
  if (sweptSSL && structure !== 'bearish') {
    dir = 'long';  setup = 'LIQ SWEEP'; conf = isScalp ? 75 : 78;
    reason = 'SSL swept and reclaimed — smart money reversal long';
  } else if (sweptBSL && structure !== 'bullish') {
    dir = 'short'; setup = 'LIQ SWEEP'; conf = isScalp ? 75 : 78;
    reason = 'BSL swept and rejected — smart money reversal short';
  } else if (structure === 'bullish' && zone === 'discount') {
    if      (fvgLongConfirmed && inOTELong) { dir = 'long'; setup = 'FVG + OTE';   conf = 71; reason = `Confirmed rejection filling bullish FVG inside OTE (${(retrLong * 100).toFixed(0)}% retrace) in discount`; }
    else if (fvgLongConfirmed)              { dir = 'long'; setup = 'FVG';         conf = 64; reason = 'Confirmed rejection filling bullish fair value gap in discount zone'; }
    // Bare OTE-fib entries (no FVG behind them) removed: backtested net-negative
    // — fib retracement alone is not an edge, only OTE + zone confluence
  } else if (structure === 'bearish' && zone === 'premium') {
    if      (fvgShortConfirmed && inOTEShort) { dir = 'short'; setup = 'FVG + OTE';   conf = 71; reason = `Confirmed rejection filling bearish FVG inside OTE (${(retrShort * 100).toFixed(0)}% retrace) in premium`; }
    else if (fvgShortConfirmed)               { dir = 'short'; setup = 'FVG';         conf = 64; reason = 'Confirmed rejection filling bearish fair value gap in premium zone'; }
  }

  // Multi-timeframe gate — never take an entry that fights the higher timeframe's
  // bias; boost confidence when the HTF agrees (ICT: HTF sets direction, LTF times entry)
  let mtfVetoed = false, mtfAligned = false;
  const rawDir = dir, rawSetup = setup, rawReason = reason;
  if (dir && htfBias && htfBias.verdict !== 'WAIT') {
    const wants = dir === 'long' ? 'BUY' : 'SELL';
    if (htfBias.verdict === wants) {
      mtfAligned = true;
      conf = Math.min(90, conf + 6);
      reason += ' · HTF aligned';
    } else {
      mtfVetoed = true;
      dir = null;
    }
  }

  let sig = null;
  if (dir) {
    // Tight stop just beyond the FVG that defines the entry (1 ATR fallback)
    let sl;
    if (dir === 'long') {
      sl = fvgLong ? fvgLong.bottom - atr * 0.25 : price - atr * 1.2;
    } else {
      sl = fvgShort ? fvgShort.top + atr * 0.25 : price + atr * 1.2;
    }
    // Floor at a spread-safe distance, cap so wide zones can't blow up the risk
    const minRisk = price * (isScalp ? 0.001 : 0.0015); // 10 / 15 pips on a 1.0000 pair
    const maxRisk = atr * (isScalp ? 1.2 : 1.5);
    if (Math.abs(price - sl) < minRisk) sl = dir === 'long' ? price - minRisk : price + minRisk;
    if (Math.abs(price - sl) > maxRisk) sl = dir === 'long' ? price - maxRisk : price + maxRisk;
    // Every trade at least 1.5:1 — TP2 runs to the opposite liquidity pool when
    // it sits beyond 1.5R, otherwise exactly 1.5R
    const risk = Math.abs(price - sl);
    const target = dir === 'long'
      ? bsl.filter(lv => lv > price + risk * 1.5).sort((a, b) => a - b)[0]
      : ssl.filter(lv => lv < price - risk * 1.5).sort((a, b) => b - a)[0];
    const tp = target ?? (dir === 'long' ? price + risk * 1.5 : price - risk * 1.5);
    sig = {
      dir, setup, conf, reason, entry: price, sl, tp,
      tp1: dir === 'long' ? price + risk * ICT_TP1_R : price - risk * ICT_TP1_R, // bank half here, stop to breakeven
      rr: risk > 0 ? (Math.abs(tp - price) / risk).toFixed(1) : null,
      fvg: dir === 'long' ? fvgLong : fvgShort,
    };
  }

  // Pending limit-entry plans at unmitigated FVGs price hasn't reached yet,
  // in the direction the higher timeframe allows
  const pois = ictComputePOIs({
    candles, fvgs, bsl, ssl, atr, hi, lo, price,
    wantLong:  htfBias && htfBias.verdict !== 'WAIT' ? htfBias.verdict === 'BUY'  : structure !== 'bearish',
    wantShort: htfBias && htfBias.verdict !== 'WAIT' ? htfBias.verdict === 'SELL' : structure !== 'bullish',
  });

  const regime = regimeOf(candles, isScalp ? 20 : 20), volState = volatilityState(candles, 20);
  if (sig) { sig.regime = regime; sig.volState = volState; }
  return {
    structure, zone, eq, hi, lo, bsl, ssl, pois,
    retr: structure === 'bearish' ? retrShort : retrLong,
    inOTE: structure === 'bearish' ? inOTEShort : inOTELong,
    fvgCount: fvgs.length, sweptBSL, sweptSSL, sig,
    mtfVetoed, mtfAligned, regime, volState,
    vetoedSetup: mtfVetoed ? { dir: rawDir, setup: rawSetup, reason: rawReason } : null,
  };
}

// ─── Opening Range Breakout (ORB) ───────────────────────────────────────────

// Minutes to add to UTC to get New York time (DST-safe via Intl round-trip)
function etOffsetMin() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return Math.round((et.getTime() - now.getTime()) / 60000);
}

const ORB_SESSIONS = [
  { key: 'LONDON OPEN', startMin: 3 * 60 },      // 3:00 AM ET
  { key: 'NY OPEN',     startMin: 9 * 60 + 30 }, // 9:30 AM ET
];
const ORB_WINDOW = 30;  // minutes that define the opening range
const ORB_VALID  = 240; // breakout stays tradeable this long after the open

// The first 30 minutes after the London / New York opens define a range; the
// first candle CLOSE beyond it trades the breakout. Stop at the range midpoint
// (floored/capped), target the measured move (1x range) with a 1.5R minimum.
// Counter-HTF breakouts are skipped, ranges too wide or too thin are skipped.
function orbAnalyze(candles, price, htfBias = null) {
  if (!candles || candles.length < 20 || !price) return null;
  const atr = atrLast(candles);
  if (!atr) return null;
  const off = etOffsetMin();
  const minOfDay = ts => (((Math.floor(ts / 60) + off) % 1440) + 1440) % 1440;
  const dayOf    = ts => Math.floor((Math.floor(ts / 60) + off) / 1440);
  const last   = candles[candles.length - 1];
  const nowMin = minOfDay(last.time), nowDay = dayOf(last.time);

  const sessions = [];
  let sig = null;
  for (const s of ORB_SESSIONS) {
    const sDay = nowMin >= s.startMin ? nowDay : nowDay - 1;
    const winIdx = [];
    for (let i = candles.length - 1; i >= 0; i--) {
      const d = dayOf(candles[i].time);
      if (d < sDay) break;
      const m = minOfDay(candles[i].time);
      if (d === sDay && m >= s.startMin && m < s.startMin + ORB_WINDOW) winIdx.unshift(i);
    }
    if (winIdx.length < 3) continue;
    const orHigh = Math.max(...winIdx.map(i => candles[i].high));
    const orLow  = Math.min(...winIdx.map(i => candles[i].low));
    const orMid  = (orHigh + orLow) / 2;
    const range  = orHigh - orLow;
    const endIdx = winIdx[winIdx.length - 1];
    const forming = nowDay === sDay && nowMin >= s.startMin && nowMin < s.startMin + ORB_WINDOW;
    const minutesSinceOpen = (nowDay - sDay) * 1440 + nowMin - s.startMin;
    const sess = { key: s.key, orHigh, orLow, orMid, range, startIdx: winIdx[0], state: forming ? 'forming' : 'set', dir: null, brokeIdx: null };

    if (!forming && minutesSinceOpen <= ORB_VALID + ORB_WINDOW) {
      for (let i = endIdx + 1; i < candles.length; i++) {
        if (candles[i].close > orHigh) { sess.state = 'long';  sess.dir = 'long';  sess.brokeIdx = i; break; }
        if (candles[i].close < orLow)  { sess.state = 'short'; sess.dir = 'short'; sess.brokeIdx = i; break; }
      }
      const tooWide = range > atr * 4;
      const tooThin = range < Math.max(atr * 0.6, price * 0.0006);
      if (sess.dir && !tooWide && !tooThin && !sig) {
        const fresh     = candles.length - 1 - sess.brokeIdx <= 6; // breakout within ~30 min
        const level     = sess.dir === 'long' ? orHigh : orLow;
        const nearLevel = Math.abs(price - level) <= range * 0.75;  // not chasing an extended move
        const against   = htfBias && htfBias.verdict !== 'WAIT' && ((sess.dir === 'long') !== (htfBias.verdict === 'BUY'));
        if (fresh && nearLevel && !against) {
          let sl = orMid;
          const minRisk = Math.max(price * 0.0008, atr * 0.5);
          const maxRisk = atr * 1.5;
          if (Math.abs(price - sl) < minRisk) sl = sess.dir === 'long' ? price - minRisk : price + minRisk;
          if (Math.abs(price - sl) > maxRisk) sl = sess.dir === 'long' ? price - maxRisk : price + maxRisk;
          const risk = Math.abs(price - sl);
          const measured = sess.dir === 'long' ? level + range : level - range;
          const tp = sess.dir === 'long' ? Math.max(price + risk * 1.5, measured) : Math.min(price - risk * 1.5, measured);
          const aligned = !!(htfBias && htfBias.verdict !== 'WAIT');
          sig = {
            dir: sess.dir, setup: `${s.key} ORB`, conf: aligned ? 76 : 71,
            reason: `${s.key} ${ORB_WINDOW}m opening range broke ${sess.dir === 'long' ? 'up' : 'down'} — trading the breakout${aligned ? ' · HTF aligned' : ''}`,
            entry: price, sl, tp,
            tp1: sess.dir === 'long' ? price + risk * ICT_TP1_R : price - risk * ICT_TP1_R,
            rr: (Math.abs(tp - price) / risk).toFixed(1),
            session: s.key,
            regime: regimeOf(candles, 20), volState: volatilityState(candles, 20),
          };
        }
      }
    }
    sessions.push(sess);
  }
  return { sessions, sig, atr, regime: regimeOf(candles, 20), volState: volatilityState(candles, 20) };
}

// ─── Smart Money Concepts (SMC) ─────────────────────────────────────────────

// Structure first: BOS (break of structure) confirms continuation, CHoCH
// (change of character) flags reversal. The entry is the mitigation — price
// returning to the zone that caused the break, confirmed by a rejection
// candle, in the direction the higher timeframe allows.
function smcAnalyze(candles, price, htfBias = null) {
  if (!candles || candles.length < 60 || !price) return null;
  const atr = atrLast(candles);
  if (!atr) return null;
  const LOOK = 3;
  const { highs, lows } = ictFindSwings(candles, LOOK);
  if (!highs.length || !lows.length) return null;

  // Walk candles chronologically, tracking the last confirmed swing each side;
  // a close beyond it is BOS (with trend) or CHoCH (against it)
  let trend = 'range', refHigh = null, refLow = null, hi = 0, li = 0;
  const events = [];
  for (let i = 0; i < candles.length; i++) {
    while (hi < highs.length && highs[hi].idx + LOOK <= i) { refHigh = highs[hi]; hi++; }
    while (li < lows.length && lows[li].idx + LOOK <= i)   { refLow = lows[li];  li++; }
    const c = candles[i];
    if (refHigh && c.close > refHigh.price) {
      events.push({ dir: 'up', type: trend === 'down' ? 'CHOCH' : 'BOS', idx: i, level: refHigh.price });
      trend = 'up'; refHigh = null;
    } else if (refLow && c.close < refLow.price) {
      events.push({ dir: 'down', type: trend === 'up' ? 'CHOCH' : 'BOS', idx: i, level: refLow.price });
      trend = 'down'; refLow = null;
    }
  }
  const lastEvent = events[events.length - 1] || null;

  // Mitigation zone: last opposing candle before the breaking move, still valid
  let zone = null;
  if (lastEvent) {
    for (let i = lastEvent.idx - 1; i >= Math.max(0, lastEvent.idx - 20); i--) {
      const c = candles[i];
      if (lastEvent.dir === 'up' ? c.close < c.open : c.close > c.open) {
        zone = lastEvent.dir === 'up'
          ? { top: Math.max(c.open, c.close), bottom: c.low, idx: i }
          : { top: c.high, bottom: Math.min(c.open, c.close), idx: i };
        break;
      }
    }
    if (zone) {
      for (let i = lastEvent.idx + 1; i < candles.length; i++) {
        if (lastEvent.dir === 'up' ? candles[i].close < zone.bottom : candles[i].close > zone.top) { zone = null; break; }
      }
    }
  }

  let sig = null, mtfVetoed = false, mtfAligned = false;
  if (lastEvent && zone) {
    const dir = lastEvent.dir === 'up' ? 'long' : 'short';
    const tol = atr * 0.25;
    const inZone = price >= zone.bottom - tol && price <= zone.top + tol;
    if (inZone && hasRejectionCandle(candles, zone.top, zone.bottom, dir)) {
      const against = htfBias && htfBias.verdict !== 'WAIT' && ((dir === 'long') !== (htfBias.verdict === 'BUY'));
      if (against) mtfVetoed = true;
      else {
        mtfAligned = !!(htfBias && htfBias.verdict !== 'WAIT');
        let sl = dir === 'long' ? zone.bottom - atr * 0.2 : zone.top + atr * 0.2;
        const minRisk = Math.max(price * 0.0008, atr * 0.4);
        const maxRisk = atr * 1.5;
        if (Math.abs(price - sl) < minRisk) sl = dir === 'long' ? price - minRisk : price + minRisk;
        if (Math.abs(price - sl) > maxRisk) sl = dir === 'long' ? price - maxRisk : price + maxRisk;
        const risk = Math.abs(price - sl);
        const targets = dir === 'long'
          ? highs.map(h => h.price).filter(v => v > price + risk * 1.5).sort((a, b) => a - b)
          : lows.map(l => l.price).filter(v => v < price - risk * 1.5).sort((a, b) => b - a);
        const tp = targets[0] ?? (dir === 'long' ? price + risk * 1.5 : price - risk * 1.5);
        const base = lastEvent.type === 'CHOCH' ? 74 : 68;
        sig = {
          dir, setup: `${lastEvent.type} MITIGATION`, conf: Math.min(90, base + (mtfAligned ? 6 : 0)),
          reason: `${lastEvent.type === 'CHOCH' ? 'Change of character' : 'Break of structure'} ${lastEvent.dir} — mitigating the origin zone with rejection${mtfAligned ? ' · HTF aligned' : ''}`,
          entry: price, sl, tp,
          tp1: dir === 'long' ? price + risk * ICT_TP1_R : price - risk * ICT_TP1_R,
          rr: (Math.abs(tp - price) / risk).toFixed(1),
        };
      }
    }
  }

  const regime = regimeOf(candles, 20), volState = volatilityState(candles, 20);
  if (sig) { sig.regime = regime; sig.volState = volState; }
  return {
    trend, events: events.slice(-4), lastEvent, zone, sig, mtfVetoed, mtfAligned, regime, volState,
    structureHighs: highs.slice(-3).map(h => h.price),
    structureLows:  lows.slice(-3).map(l => l.price),
  };
}

// Yahoo symbol → TradingView symbol for the embedded advanced chart
const TV_SYMBOLS = {
  'EURUSD=X': 'FX:EURUSD', 'GBPUSD=X': 'FX:GBPUSD', 'USDJPY=X': 'FX:USDJPY',
  'AUDUSD=X': 'FX:AUDUSD',
  'NZDUSD=X': 'FX:NZDUSD', 'GBPJPY=X': 'FX:GBPJPY',
  'XAUUSD': 'OANDA:XAUUSD', 'XAGUSD': 'OANDA:XAGUSD',
};

// Shared ICT candle chart — used by both the ICT (daily) and Scalp (intraday)
// tabs. Draws every confluence on the price: OB/FVG zones, equilibrium, BSL/SSL
// liquidity, ▼/▲ markers on the candles where liquidity sweeps happened, and
// entry/TP/SL when a signal is live.
function ICTCandleChart({ candles, zones = [], eq, bsl = [], ssl = [], sig, sym, tfLabel, bars = 72 }) {
  if (!candles || candles.length < 12) return null;
  const data   = candles.slice(-bars);
  const offset = candles.length - data.length;

  const W = 320, H = 128, labelW = 46;
  const plotW = W - labelW;
  let lo = Math.min(...data.map(c => c.low));
  let hi = Math.max(...data.map(c => c.high));
  if (sig) { lo = Math.min(lo, sig.sl, sig.tp); hi = Math.max(hi, sig.sl, sig.tp); }
  const vpad = (hi - lo) * 0.07 || hi * 0.001;
  lo -= vpad; hi += vpad;
  const y  = v => ((hi - v) / (hi - lo)) * (H - 10) + 5;
  const x  = i => 2 + (i / data.length) * (plotW - 4);
  const cw = Math.max(1.2, ((plotW - 4) / data.length) * 0.62);
  const inRange = v => v != null && v >= lo && v <= hi;
  const fp = p => sym?.startsWith('XAUUSD') ? p.toFixed(2) : sym?.startsWith('XAGUSD') ? p.toFixed(3) : p >= 100 ? p.toFixed(2) : p.toFixed(4);
  const dc = sig ? (sig.dir === 'long' ? '#10b981' : '#ef4444') : '#6b7280';

  // Liquidity sweeps within the visible window: a wick through a BSL/SSL level
  // with the close back on the other side. Marked on the exact candle.
  const sweeps = [];
  data.forEach((c, i) => {
    if (bsl.some(lv => c.high > lv && c.close < lv)) sweeps.push({ i, type: 'BSL', yv: c.high });
    if (ssl.some(lv => c.low < lv && c.close > lv))  sweeps.push({ i, type: 'SSL', yv: c.low });
  });
  const sweepMarks = sweeps.slice(-6);
  const lastSweep  = sweepMarks[sweepMarks.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: 'rgba(0,0,0,0.3)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.05)' }}>
      {/* OB / FVG confluence zones */}
      {zones.filter(z => z && (inRange(z.bottom) || inRange(z.top))).map((z, i) => {
        const xs = x(Math.max(0, (z.idx ?? 0) - offset));
        const yt = y(Math.min(hi, z.top)), yb = y(Math.max(lo, z.bottom));
        return <rect key={`z${i}`} x={xs} y={yt} width={Math.max(0, plotW - xs)} height={Math.max(1, yb - yt)} fill={z.fill} />;
      })}

      {/* equilibrium + liquidity pools */}
      {inRange(eq) && <line x1={0} x2={plotW} y1={y(eq)} y2={y(eq)} stroke="#6b7280" strokeWidth="0.6" strokeDasharray="2 3" />}
      {inRange(eq) && <text x={2} y={y(eq) - 1.5} fontSize="5.5" fill="#6b7280">EQ</text>}
      {bsl.filter(inRange).map((lv, i) => (
        <g key={`b${i}`}>
          <line x1={0} x2={plotW} y1={y(lv)} y2={y(lv)} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.7" />
          {i === 0 && <text x={2} y={y(lv) - 1.5} fontSize="5.5" fill="#f59e0b">BSL</text>}
        </g>
      ))}
      {ssl.filter(inRange).map((lv, i) => (
        <g key={`s${i}`}>
          <line x1={0} x2={plotW} y1={y(lv)} y2={y(lv)} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.7" />
          {i === 0 && <text x={2} y={y(lv) + 5.5} fontSize="5.5" fill="#f59e0b">SSL</text>}
        </g>
      ))}

      {/* candles */}
      {data.map((c, i) => {
        const up = c.close >= c.open;
        const col = up ? '#10b981' : '#ef4444';
        const cx = x(i) + cw / 2;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth="0.6" opacity="0.9" />
            <rect x={x(i)} y={y(Math.max(c.open, c.close))} width={cw} height={Math.max(0.8, Math.abs(y(c.open) - y(c.close)))} fill={col} />
          </g>
        );
      })}

      {/* liquidity sweep markers on the candles where they happened */}
      {sweepMarks.map((s, k) => (
        <text key={`sw${k}`} x={x(s.i) + cw / 2} textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#f59e0b"
          y={s.type === 'BSL' ? Math.max(7, y(s.yv) - 3) : Math.min(H - 2, y(s.yv) + 9)}>
          {s.type === 'BSL' ? '▼' : '▲'}
        </text>
      ))}
      {lastSweep && (
        <text x={x(lastSweep.i) + cw / 2} textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#f59e0b"
          y={lastSweep.type === 'BSL' ? Math.max(14, y(lastSweep.yv) + 4) : Math.min(H - 9, y(lastSweep.yv) - 4)}>
          {lastSweep.type} SWEEP
        </text>
      )}

      {/* entry / TP1 / TP2 / SL with price labels */}
      {sig && [['E', sig.entry, '#a5b4fc', null], ...(sig.tp1 != null ? [['T1', sig.tp1, '#6ee7b7', '2 3']] : []), ['TP', sig.tp, '#10b981', '4 3'], ['SL', sig.sl, '#ef4444', '4 3']].map(([lbl, v, col, dash]) => inRange(v) && (
        <g key={lbl}>
          <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke={col} strokeWidth="0.9" strokeDasharray={dash || undefined} />
          <text x={W - 2} y={y(v) + 2.5} textAnchor="end" fontSize="7" fontFamily="monospace" fontWeight="700" fill={col}>{lbl} {fp(v)}</text>
        </g>
      ))}

      {/* alert marker at the live candle */}
      {sig && inRange(sig.entry) && (
        <g>
          <circle cx={x(data.length - 1) + cw / 2} cy={y(sig.entry)} r="2.6" fill={dc} stroke="#080b12" strokeWidth="0.8" />
          <text x={5} y={22} fontSize="8.5" fontWeight="800" fill={dc}>{sig.dir === 'long' ? '▲' : '▼'} {sig.setup} — alert entry</text>
        </g>
      )}

      <text x={5} y={11} fontSize="7" fontWeight="800" fill="#4b5563" letterSpacing="0.08em">{tfLabel}</text>
      {!sig && <text x={5} y={22} fontSize="7.5" fill="#374151">no active entry — EQ, liquidity & sweeps shown</text>}
    </svg>
  );
}

function SignalsPanel({ scanResults, scanning, scanProgress, watchlist, onRescan, vixVal, sectorData, onTrade, commodities, forexData }) {
  const now = useNow(60000);
  const [filter, setFilter] = useState('all');

  const allEdgeTickers = watchlist.filter(sym => scanResults[sym]?.hasEdge);
  const longCount = allEdgeTickers.filter(sym => scanResults[sym].showLong).length;
  const shortCount = allEdgeTickers.length - longCount;

  const filteredTickers = allEdgeTickers
    .filter(sym => {
      const r = scanResults[sym];
      if (filter === 'long') return r.showLong;
      if (filter === 'short') return !r.showLong;
      if (filter === 'strong') return (r.setupProb ?? 0) >= 65;
      return true;
    })
    .sort((a, b) => (scanResults[b].setupProb ?? 0) - (scanResults[a].setupProb ?? 0));

  const noEdgeTickers = watchlist.filter(sym => scanResults[sym] && !scanResults[sym].hasEdge);
  const pendingTickers = watchlist.filter(sym => !scanResults[sym]);
  const allDone = !scanning && pendingTickers.length === 0;

  const strongCount = allEdgeTickers.filter(sym => (scanResults[sym].setupProb ?? 0) >= 65).length;

  const scannedCount = watchlist.filter(sym => scanResults[sym]).length;
  const avgConf = allEdgeTickers.length
    ? Math.round(allEdgeTickers.reduce((s, sym) => s + (scanResults[sym].setupProb ?? 0), 0) / allEdgeTickers.length)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* VIX warning */}
      {vixVal != null && vixVal > 25 && (
        <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11 }}>⚠</span>
          <span style={{ fontSize: 11, color: '#fca5a5', fontWeight: 600 }}>
            VIX at {vixVal.toFixed(1)} — elevated volatility. Reduce position size, widen stops.
          </span>
        </div>
      )}

      {/* Sector rotation grid */}
      {sectorData?.length > 0 && <SectorGrid sectorData={sectorData} />}

      {/* Macro calendar */}
      <EconomicCalendar />

      {/* Commodity signals */}
      {commodities?.length > 0 && (() => {
        const scored = commodities.map(d => ({ d, sig: scoreCommoditySignal(d) })).filter(x => x.sig);
        if (!scored.length) return null;
        const typeColor = { RESIST: '#ef4444', SUPPORT: '#10b981', MOM: '#3b82f6', BREAK: '#f59e0b' };
        const fmtPx = v => v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toFixed(2);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>OIL SIGNALS</div>
            {scored.map(({ d, sig }) => {
              const dirColor = sig.dir === 'long' ? '#10b981' : '#ef4444';
              const tc = typeColor[sig.type] || '#9ca3af';
              const name = d.shortName || d.symbol;
              return (
                <div key={d.symbol} style={{ padding: '9px 11px', borderRadius: 9, background: `${dirColor}07`, border: `1px solid ${dirColor}25`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{name}</span>
                      <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${dirColor}20`, color: dirColor }}>{sig.dir === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
                      <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${tc}18`, color: tc }}>{sig.type}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: sig.conf >= 65 ? '#10b981' : '#f59e0b' }}>{sig.conf}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>{sig.reason}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                    {[['Entry', `$${fmtPx(sig.entry)}`, '#e5e7eb'], ['TP', `$${fmtPx(sig.tp)}`, '#10b981'], ['SL', `$${fmtPx(sig.sl)}`, '#ef4444'], ['RR', `${sig.rr}×`, '#a5b4fc']].map(([label, val, color]) => (
                      <div key={label} style={{ padding: '3px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }}>{label}</div>
                        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[
                      [`${sig.chgPct >= 0 ? '▲' : '▼'} ${Math.abs(sig.chgPct).toFixed(2)}% 24h`, sig.chgPct >= 0 ? '#10b981' : '#ef4444'],
                      [`52W pos: ${(sig.pos * 100).toFixed(0)}%`, '#6b7280'],
                    ].map(([text, color]) => (
                      <span key={text} style={{ fontSize: 9, fontFamily: 'monospace', color, background: `${color}12`, padding: '1px 5px', borderRadius: 3 }}>{text}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Forex signals */}
      {forexData?.length > 0 && (() => {
        const scored = forexData.map(d => ({ d, sig: scoreForexSignal(d) })).filter(x => x.sig);
        if (!scored.length) return null;
        const typeColor = { RESIST: '#ef4444', SUPPORT: '#10b981', TREND: '#3b82f6', BREAK: '#f59e0b' };
        const fmtFx = p => p >= 100 ? p.toFixed(2) : p >= 10 ? p.toFixed(3) : p.toFixed(4);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>FOREX SIGNALS</div>
            {scored.map(({ d, sig }) => {
              const dirColor = sig.dir === 'long' ? '#10b981' : '#ef4444';
              const tc = typeColor[sig.type] || '#9ca3af';
              return (
                <div key={d.symbol} style={{ padding: '9px 11px', borderRadius: 9, background: `${dirColor}07`, border: `1px solid ${dirColor}25`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{sig.name}</span>
                      <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${dirColor}20`, color: dirColor }}>{sig.dir === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
                      <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 800, background: `${tc}18`, color: tc }}>{sig.type}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: sig.conf >= 65 ? '#10b981' : '#f59e0b' }}>{sig.conf}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>{sig.reason}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                    {[['Entry', fmtFx(sig.entry), '#e5e7eb'], ['TP', fmtFx(sig.tp), '#10b981'], ['SL', fmtFx(sig.sl), '#ef4444'], ['RR', `${sig.rr}×`, '#a5b4fc']].map(([label, val, color]) => (
                      <div key={label} style={{ padding: '3px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }}>{label}</div>
                        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[
                      [`${sig.chgPct >= 0 ? '▲' : '▼'} ${Math.abs(sig.chgPct).toFixed(2)}% 24h`, sig.chgPct >= 0 ? '#10b981' : '#ef4444'],
                      [`52W pos: ${(sig.pos * 100).toFixed(0)}%`, '#6b7280'],
                    ].map(([text, color]) => (
                      <span key={text} style={{ fontSize: 9, fontFamily: 'monospace', color, background: `${color}12`, padding: '1px 5px', borderRadius: 3 }}>{text}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            GEX Signals
          </span>
          {scannedCount > 0 && (
            <span style={{ fontSize: 9, color: '#374151', fontFamily: 'monospace' }}>
              {longCount > 0 && <span style={{ color: '#10b981' }}>{longCount}▲ </span>}
              {shortCount > 0 && <span style={{ color: '#ef4444' }}>{shortCount}▼ </span>}
              {avgConf != null && <span style={{ color: '#4b5563' }}>· {avgConf}% avg</span>}
            </span>
          )}
        </div>
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

      {allEdgeTickers.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `All (${allEdgeTickers.length})` },
            { key: 'long', label: `▲ Long (${longCount})`, color: '#10b981' },
            { key: 'short', label: `▼ Short (${shortCount})`, color: '#ef4444' },
            { key: 'strong', label: `★ High Conf (${strongCount})`, color: '#a5b4fc' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '3px 9px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              border: 'none', cursor: 'pointer',
              background: filter === f.key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
              color: filter === f.key ? (f.color || '#a5b4fc') : '#4b5563',
            }}>{f.label}</button>
          ))}
        </div>
      )}

      {filteredTickers.map((sym, i) => (
        <SignalCard key={sym} symbol={sym} signal={scanResults[sym]} index={i} now={now} onTrade={onTrade} />
      ))}

      {allDone && allEdgeTickers.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>No clear edge in watchlist</div>
          <div style={{ fontSize: 10, color: "#374151" }}>GEX bias and P/C flow must agree on direction for a signal to appear</div>
        </div>
      )}

      {allDone && allEdgeTickers.length > 0 && filteredTickers.length === 0 && (
        <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: "#4b5563" }}>
          No signals match this filter
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

      <SignalHistory />
    </div>
  );
}

const FOMC_DATES = [
  '2025-01-29','2025-03-19','2025-05-07','2025-06-18','2025-07-30',
  '2025-09-17','2025-10-29','2025-12-10',
  '2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29',
  '2026-09-16','2026-10-28','2026-12-09',
  '2027-01-27','2027-03-17','2027-04-28','2027-06-16','2027-07-28',
  '2027-09-15','2027-10-27','2027-12-08',
];

const CPI_DATES = [
  '2025-01-15','2025-02-12','2025-03-12','2025-04-10','2025-05-13',
  '2025-06-11','2025-07-15','2025-08-12','2025-09-10','2025-10-15',
  '2025-11-12','2025-12-10',
  '2026-01-14','2026-02-11','2026-03-11','2026-04-08','2026-05-13',
  '2026-06-10','2026-07-15','2026-08-12','2026-09-10','2026-10-14',
  '2026-11-11','2026-12-09',
  '2027-01-13','2027-02-10','2027-03-10','2027-04-14','2027-05-12',
  '2027-06-09','2027-07-14','2027-08-11',
];

function getThirdFriday(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 14);
  return new Date(d);
}

function getFirstFriday(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return new Date(d);
}

function EconomicCalendar() {
  const now = new Date();
  const tod = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const fomcEvts = FOMC_DATES.map(s => ({ date: new Date(s), label: 'FOMC', type: 'fomc' }));
  const cpiEvts  = CPI_DATES.map(s =>  ({ date: new Date(s), label: 'CPI',  type: 'cpi'  }));

  const opexEvts = [], nfpEvts = [];
  for (let m = 0; m <= 5; m++) {
    const yr = now.getFullYear() + Math.floor((now.getMonth() + m) / 12);
    const mo = (now.getMonth() + m) % 12;
    const isQ = [2, 5, 8, 11].includes(mo);
    opexEvts.push({ date: getThirdFriday(yr, mo), label: isQ ? 'Q-OpEx' : 'OpEx', type: isQ ? 'quarterly' : 'opex' });
    nfpEvts.push({ date: getFirstFriday(yr, mo), label: 'NFP', type: 'nfp' });
  }

  const all = [...fomcEvts, ...cpiEvts, ...opexEvts, ...nfpEvts]
    .filter(e => e.date >= tod)
    .sort((a, b) => a.date - b.date)
    .slice(0, 8);

  if (!all.length) return null;

  const fmtDate = d => { const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${M[d.getMonth()]} ${d.getDate()}`; };
  const daysUntil = d => Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - tod) / 86400000);
  const TC = { fomc: '#ef4444', cpi: '#f59e0b', nfp: '#6366f1', opex: '#10b981', quarterly: '#a855f7' };

  return (
    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8 }}>MACRO CALENDAR</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {all.map((e, i) => {
          const days = daysUntil(e.date);
          const dStr = days === 0 ? 'TODAY' : days === 1 ? 'TMRW' : `${days}d`;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: TC[e.type], flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: TC[e.type], minWidth: 52 }}>{e.label}</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7280', flex: 1 }}>{fmtDate(e.date)}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 800, color: days <= 1 ? '#ef4444' : days <= 5 ? '#f59e0b' : '#374151', minWidth: 34, textAlign: 'right' }}>
                {dStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalHistory() {
  const [history] = useState(() => { try { return JSON.parse(localStorage.getItem('fe_signal_history') || '[]'); } catch { return []; } });
  if (!history.length) return null;
  const fmtAge = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m/60)}h` : `${Math.floor(m/1440)}d`; };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 6 }}>SIGNAL HISTORY · {Math.min(history.length, 12)} RECENT</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {history.slice(0, 12).map(h => {
          const c = h.direction === 'long' ? '#10b981' : '#ef4444';
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: c }}>{h.direction === 'long' ? '▲' : '▼'}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#f9fafb', width: 44 }}>{h.symbol}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#4b5563' }}>${h.entry?.toFixed(2)}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', flex: 1 }}>→ ${h.tp?.toFixed(2)}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#a5b4fc' }}>{h.setupProb}%</span>
              <span style={{ fontSize: 8, color: '#374151', minWidth: 28, textAlign: 'right' }}>{fmtAge(h.firedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function scorePerpSignal(a) {
  const { fundingAnn, changePct, oiUsd } = a;
  if (oiUsd < 5e6) return null;
  const atr = Math.max(Math.abs(changePct), 2);
  let dir = null, type = '', conf = 0, reason = '';

  if      (fundingAnn > 100) { dir = 'short'; type = 'FADE';   conf = 85; reason = 'Extreme long crowding — funding >100% ann'; }
  else if (fundingAnn > 50)  { dir = 'short'; type = 'FADE';   conf = 72; reason = 'Crowded longs — high-funding squeeze risk'; }
  else if (fundingAnn < -50) { dir = 'long';  type = 'FADE';   conf = 80; reason = 'Extreme short crowding — negative funding'; }
  else if (fundingAnn < -20) { dir = 'long';  type = 'FADE';   conf = 65; reason = 'Shorts paying — negative funding fade'; }
  else if (changePct > 5  && fundingAnn > 5  && fundingAnn < 40) { dir = 'long';  type = 'MOM';   conf = 60; reason = 'Trending up, funding confirms but not extreme'; }
  else if (changePct < -5 && fundingAnn > -15 && fundingAnn < 15) { dir = 'short'; type = 'MOM';   conf = 58; reason = 'Sell momentum, funding not crowded short'; }
  else if (fundingAnn > 20 && fundingAnn <= 50 && Math.abs(changePct) < 3) { dir = 'long'; type = 'CARRY'; conf = 52; reason = 'Stable price — collect high positive funding'; }

  if (!dir) return null;

  if      (oiUsd > 2e9)   conf = Math.min(92, conf + 8);
  else if (oiUsd > 500e6) conf = Math.min(90, conf + 5);
  else if (oiUsd < 50e6)  conf = Math.max(30, conf - 10);

  const slPct = (atr * 1.5) / 100;
  const tpPct = (atr * 3.0) / 100;
  const entry = a.markPx;
  return {
    dir, type, conf, reason, entry,
    sl: dir === 'long' ? entry * (1 - slPct) : entry * (1 + slPct),
    tp: dir === 'long' ? entry * (1 + tpPct) : entry * (1 - tpPct),
    rr: (tpPct / slPct).toFixed(1),
  };
}

function HyperliquidPanel() {
  const [assets, setAssets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('oi');
  const [refreshIn, setRefreshIn] = useState(120);
  const [view, setView] = useState('signals');
  const [minConf, setMinConf] = useState(0);
  const [liveMids, setLiveMids] = useState({});
  const [wsStatus, setWsStatus] = useState('connecting');
  const wsRef = useRef(null);
  const sigFirstSeenRef = useRef({});

  const fetchHL = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/hyperliquid');
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setAssets(d.assets);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHL(); }, [fetchHL]);

  // Slow poll for funding/OI refresh (every 2 min) — prices come from WS
  useEffect(() => {
    setRefreshIn(120);
    const t = setInterval(() => setRefreshIn(prev => {
      if (prev <= 1) { fetchHL(); return 120; }
      return prev - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [fetchHL]);

  // WebSocket for live mark prices
  const connectWS = useCallback(() => {
    try {
      const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
      wsRef.current = ws;
      ws.onopen = () => {
        setWsStatus('live');
        ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel === 'allMids' && msg.data?.mids) setLiveMids(msg.data.mids);
        } catch {}
      };
      ws.onclose = () => { setWsStatus('reconnecting'); setTimeout(connectWS, 3000); };
      ws.onerror  = () => ws.close();
    } catch { setWsStatus('polling'); }
  }, []);

  useEffect(() => {
    connectWS();
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, [connectWS]);

  // Merge live WS prices into asset list
  const mergedAssets = useMemo(() => {
    if (!assets) return null;
    if (!Object.keys(liveMids).length) return assets;
    return assets.map(a => {
      const midStr = liveMids[a.name];
      if (!midStr) return a;
      const newMark = parseFloat(midStr);
      if (!newMark || isNaN(newMark)) return a;
      const prevPx = a.prevDayPx || newMark;
      return { ...a, markPx: newMark, changePct: prevPx ? ((newMark - prevPx) / prevPx) * 100 : a.changePct, oiUsd: a.openInterest * newMark };
    });
  }, [assets, liveMids]);

  const sorted = useMemo(() => {
    if (!mergedAssets) return [];
    let list = search ? mergedAssets.filter(a => a.name.toUpperCase().includes(search)) : [...mergedAssets];
    if (sortBy === 'oi')      list.sort((a, b) => b.oiUsd - a.oiUsd);
    if (sortBy === 'funding') list.sort((a, b) => Math.abs(b.fundingAnn) - Math.abs(a.fundingAnn));
    if (sortBy === 'volume')  list.sort((a, b) => b.dayVolume - a.dayVolume);
    if (sortBy === 'change')  list.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return list.slice(0, 60);
  }, [mergedAssets, search, sortBy]);

  const signals = useMemo(() => {
    if (!mergedAssets) return [];
    const now = Date.now();
    return mergedAssets
      .map(a => {
        const sig = scorePerpSignal(a);
        if (!sig || sig.conf < minConf) return null;
        const key = `${a.name}:${sig.dir}`;
        if (!sigFirstSeenRef.current[key]) sigFirstSeenRef.current[key] = now;
        const ageMs = now - sigFirstSeenRef.current[key];
        return { asset: a, sig, ageMs, isStale: ageMs > 30 * 60 * 1000 };
      })
      .filter(Boolean)
      .sort((a, b) => b.sig.conf - a.sig.conf);
  }, [mergedAssets, minConf]);

  const fColor = (ann) => ann > 50 ? '#ef4444' : ann > 20 ? '#f59e0b' : ann > 0 ? '#10b981' : ann > -20 ? '#6366f1' : '#a855f7';
  const fmtPx  = (p) => p >= 10000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  const fmtOI  = (v) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;

  const extremes = mergedAssets
    ? [...mergedAssets].sort((a, b) => Math.abs(b.fundingAnn) - Math.abs(a.fundingAnn)).slice(0, 4)
    : [];

  const typeColor  = { FADE: '#f59e0b', MOM: '#3b82f6', CARRY: '#10b981' };
  const typeLabel  = { FADE: 'FADE', MOM: 'MOMENTUM', CARRY: 'CARRY' };
  const wsColor = wsStatus === 'live' ? '#10b981' : wsStatus === 'reconnecting' ? '#f59e0b' : '#6b7280';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {[['signals', `Signals${signals.length ? ` (${signals.length})` : ''}`], ['market', 'Market']].map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: view === key ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
              color: view === key ? '#a5b4fc' : '#6b7280',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: wsColor }}>● {wsStatus === 'live' ? 'LIVE' : wsStatus === 'reconnecting' ? 'RECONNECTING' : 'POLLING'}</span>
          <button onClick={() => { fetchHL(); setRefreshIn(120); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px', color: '#6b7280', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
            {loading ? '…' : `↻ ${refreshIn}s`}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 11, padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.08)' }}>{error}</div>}
      {loading && !assets && <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, padding: 20 }}>Loading Hyperliquid…</div>}

      {/* ── SIGNALS VIEW ─────────────────────────────────────────── */}
      {view === 'signals' && (
        <>
          <div style={{ padding: '6px 10px', borderRadius: 7, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)', fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
            <strong style={{ color: '#a5b4fc' }}>Perp Signals</strong> — <span style={{ color: '#f59e0b' }}>FADE</span> = fade crowded funding; <span style={{ color: '#3b82f6' }}>MOM</span> = trend w/ healthy funding; <span style={{ color: '#10b981' }}>CARRY</span> = collect funding yield. Signals dim after 30 min.
          </div>

          {/* Confidence filter */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#374151', fontWeight: 700, marginRight: 2 }}>MIN CONF</span>
            {[[0,'All'], [60,'60%+'], [70,'70%+'], [80,'80%+']].map(([v, label]) => (
              <button key={v} onClick={() => setMinConf(v)} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: minConf === v ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                color: minConf === v ? '#a5b4fc' : '#4b5563',
              }}>{label}</button>
            ))}
          </div>

          {signals.length === 0 && mergedAssets && (
            <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 11, padding: 24 }}>No signals at current thresholds.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {signals.map(({ asset: a, sig, isStale, ageMs }) => {
              const isLong  = sig.dir === 'long';
              const dirColor = isLong ? '#10b981' : '#ef4444';
              const tc = typeColor[sig.type] || '#9ca3af';
              const confPct = sig.conf;
              const confColor = confPct >= 80 ? '#10b981' : confPct >= 65 ? '#f59e0b' : '#6b7280';
              const ageMin = Math.floor(ageMs / 60000);
              return (
                <div key={a.name} style={{
                  padding: '10px 12px', borderRadius: 9,
                  background: `${dirColor}07`,
                  border: `1px solid ${dirColor}25`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  opacity: isStale ? 0.45 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontWeight: 900, fontSize: 13, color: '#f9fafb', letterSpacing: '-0.01em' }}>{a.name}</span>
                      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: `${dirColor}20`, color: dirColor, letterSpacing: '0.06em' }}>
                        {isLong ? '▲ LONG' : '▼ SHORT'}
                      </span>
                      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 800, background: `${tc}18`, color: tc, letterSpacing: '0.06em' }}>
                        {typeLabel[sig.type]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {isStale && <span style={{ fontSize: 7, fontWeight: 800, color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>STALE {ageMin}m</span>}
                      <span style={{ fontSize: 11, fontWeight: 800, color: confColor, fontFamily: 'monospace' }}>{confPct}%</span>
                    </div>
                  </div>

                  {/* Reason */}
                  <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>{sig.reason}</div>

                  {/* Entry / TP / SL / RR */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                    {[
                      ['Entry', `$${fmtPx(sig.entry)}`, '#e5e7eb'],
                      ['TP', `$${fmtPx(sig.tp)}`, '#10b981'],
                      ['SL', `$${fmtPx(sig.sl)}`, '#ef4444'],
                      ['RR', `${sig.rr}×`, '#a5b4fc'],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ padding: '4px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Meta chips */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      [`⚡ ${a.fundingAnn >= 0 ? '+' : ''}${a.fundingAnn.toFixed(0)}% ann`, fColor(a.fundingAnn)],
                      [`◎ OI ${fmtOI(a.oiUsd)}`, '#6b7280'],
                      [`${a.changePct >= 0 ? '▲' : '▼'} ${Math.abs(a.changePct).toFixed(2)}% 24h`, a.changePct >= 0 ? '#10b981' : '#ef4444'],
                    ].map(([text, color]) => (
                      <span key={text} style={{ fontSize: 9, fontFamily: 'monospace', color, background: `${color}12`, padding: '1px 6px', borderRadius: 4 }}>{text}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── MARKET VIEW ──────────────────────────────────────────── */}
      {view === 'market' && (
        <>
          <div style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 10, color: '#6b7280', lineHeight: 1.65 }}>
            <strong style={{ color: '#a5b4fc' }}>Hyperliquid Perpetuals</strong> — Funding &amp; open interest. High positive = crowded longs (squeeze risk). Negative = shorts dominant (squeeze potential).
          </div>

          {extremes.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 7 }}>EXTREME FUNDING</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {extremes.map(a => {
                  const c = fColor(a.fundingAnn);
                  const label = a.fundingAnn > 100 ? 'EXTREME LONG' : a.fundingAnn > 50 ? 'CROWDED LONG' : a.fundingAnn > 20 ? 'ELEVATED' : a.fundingAnn < -50 ? 'EXTREME SHORT' : a.fundingAnn < -20 ? 'CROWDED SHORT' : 'NEGATIVE';
                  return (
                    <div key={a.name} style={{ padding: '6px 8px', borderRadius: 6, background: `${c}0d`, border: `1px solid ${c}22` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontWeight: 800, fontSize: 12, color: '#f9fafb' }}>{a.name}</span>
                        <span style={{ fontSize: 8, fontWeight: 800, color: c, letterSpacing: '0.05em' }}>{label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: c }}>{a.fundingAnn >= 0 ? '+' : ''}{a.fundingAnn.toFixed(0)}% ann</span>
                        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>{a.changePct >= 0 ? '+' : ''}{a.changePct.toFixed(2)}% 24h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', color: '#f9fafb', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {[['oi','OI'],['funding','Funding'],['volume','Volume'],['change','Change']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: sortBy === key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                color: sortBy === key ? '#a5b4fc' : '#4b5563',
              }}>{label}</button>
            ))}
          </div>

          {sorted.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 62px 90px 70px', gap: 4, padding: '3px 8px', fontSize: 8, color: '#374151', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>ASSET</span><span style={{ textAlign: 'right' }}>MARK</span><span style={{ textAlign: 'right' }}>24H</span><span style={{ textAlign: 'right' }}>FUNDING 8H / ANN</span><span style={{ textAlign: 'right' }}>OI</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 460, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sorted.map(a => {
                  const c = fColor(a.fundingAnn);
                  const up = a.changePct >= 0;
                  const annAbs = Math.abs(a.fundingAnn);
                  const hasSig = signals.find(x => x.asset.name === a.name);
                  return (
                    <div key={a.name} style={{
                      display: 'grid', gridTemplateColumns: '52px 1fr 62px 90px 70px', gap: 4,
                      padding: '4px 8px', borderRadius: 5, alignItems: 'center',
                      background: annAbs > 50 ? `${c}08` : 'rgba(255,255,255,0.015)',
                      border: annAbs > 50 ? `1px solid ${c}22` : '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: 10, color: '#f9fafb' }}>{a.name}</span>
                        {hasSig && <span style={{ fontSize: 7, fontWeight: 800, color: hasSig.sig.dir === 'long' ? '#10b981' : '#ef4444' }}>{hasSig.sig.dir === 'long' ? '▲' : '▼'}</span>}
                      </div>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#e5e7eb', textAlign: 'right' }}>${fmtPx(a.markPx)}</span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: up ? '#10b981' : '#ef4444', textAlign: 'right' }}>{up ? '+' : ''}{a.changePct.toFixed(2)}%</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: c }}>{a.funding >= 0 ? '+' : ''}{(a.funding * 100).toFixed(4)}%</div>
                        <div style={{ fontSize: 8, color: c, opacity: 0.75 }}>{a.fundingAnn >= 0 ? '+' : ''}{a.fundingAnn.toFixed(0)}% ann</div>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', textAlign: 'right' }}>{fmtOI(a.oiUsd)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 8, fontFamily: 'monospace', paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: '#ef4444' }}>■ &gt;50% ann (crowded long)</span>
                <span style={{ color: '#f59e0b' }}>■ &gt;20% ann (elevated)</span>
                <span style={{ color: '#6366f1' }}>■ Negative (shorts pay)</span>
                <span style={{ color: '#a855f7' }}>■ Extreme short</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ScreenerPanel() {
  const [assets, setAssets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [minOI, setMinOI] = useState(0);
  const [fundDir, setFundDir] = useState('any');
  const [minChange, setMinChange] = useState(0);
  const [sigType, setSigType] = useState('any');
  const [sortBy, setSortBy] = useState('oi');

  useEffect(() => {
    setLoading(true);
    fetch('/api/hyperliquid').then(r => r.json()).then(d => { setAssets(d.assets || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const fColor = (ann) => ann > 50 ? '#ef4444' : ann > 20 ? '#f59e0b' : ann > 0 ? '#10b981' : ann > -20 ? '#6366f1' : '#a855f7';
  const fmtPx  = (p) => p >= 10000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  const fmtOI  = (v) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${(v/1e3).toFixed(0)}K`;

  const results = useMemo(() => {
    if (!assets) return [];
    let list = assets.filter(a => {
      if (a.oiUsd < minOI) return false;
      if (fundDir === 'pos'    && a.fundingAnn <= 0)  return false;
      if (fundDir === 'high'   && a.fundingAnn < 20)  return false;
      if (fundDir === 'xhigh'  && a.fundingAnn < 50)  return false;
      if (fundDir === 'neg'    && a.fundingAnn >= 0)  return false;
      if (fundDir === 'xneg'   && a.fundingAnn > -20) return false;
      if (Math.abs(a.changePct) < minChange) return false;
      if (sigType !== 'any') { const s = scorePerpSignal(a); if (!s || s.type !== sigType) return false; }
      return true;
    });
    if (sortBy === 'oi')      list.sort((a, b) => b.oiUsd - a.oiUsd);
    if (sortBy === 'funding') list.sort((a, b) => Math.abs(b.fundingAnn) - Math.abs(a.fundingAnn));
    if (sortBy === 'change')  list.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    if (sortBy === 'volume')  list.sort((a, b) => b.dayVolume - a.dayVolume);
    return list;
  }, [assets, minOI, fundDir, minChange, sigType, sortBy]);

  const BtnRow = ({ label, opts, val, set }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, marginBottom: 4, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {opts.map(([v, lbl]) => (
          <button key={v} onClick={() => set(v)} style={{
            padding: '2px 9px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: val === v ? 'rgba(99,102,241,0.28)' : 'rgba(255,255,255,0.05)',
            color: val === v ? '#a5b4fc' : '#4b5563',
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>PERP SCREENER — {assets ? `${results.length} / ${assets.length} assets` : '…'}</div>

      <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <BtnRow label="MIN OPEN INTEREST" opts={[[0,'Any'],[100e6,'$100M+'],[500e6,'$500M+'],[1e9,'$1B+'],[5e9,'$5B+']]} val={minOI} set={setMinOI} />
        <BtnRow label="FUNDING"  opts={[['any','Any'],['pos','Positive'],['high','>20%'],['xhigh','>50%'],['neg','Negative'],['xneg','<-20%']]} val={fundDir} set={setFundDir} />
        <BtnRow label="MIN |24H Δ|" opts={[[0,'Any'],[2,'2%+'],[5,'5%+'],[10,'10%+']]} val={minChange} set={setMinChange} />
        <BtnRow label="SIGNAL TYPE" opts={[['any','Any'],['FADE','Fade'],['MOM','Momentum'],['CARRY','Carry']]} val={sigType} set={setSigType} />
        <BtnRow label="SORT BY" opts={[['oi','OI'],['funding','Funding'],['change','Change'],['volume','Volume']]} val={sortBy} set={setSortBy} />
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, padding: 20 }}>Loading…</div>}

      {results.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 58px 80px 60px 52px', gap: 4, padding: '3px 8px', fontSize: 8, color: '#374151', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span>ASSET</span><span style={{ textAlign: 'right' }}>MARK</span><span style={{ textAlign: 'right' }}>24H</span><span style={{ textAlign: 'right' }}>FUND ANN</span><span style={{ textAlign: 'right' }}>OI</span><span style={{ textAlign: 'right' }}>SIG</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 500, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.map(a => {
              const c = fColor(a.fundingAnn);
              const up = a.changePct >= 0;
              const sig = scorePerpSignal(a);
              return (
                <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 58px 80px 60px 52px', gap: 4, padding: '4px 8px', borderRadius: 5, alignItems: 'center', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontWeight: 800, fontSize: 10, color: '#f9fafb' }}>{a.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#e5e7eb', textAlign: 'right' }}>${fmtPx(a.markPx)}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: up ? '#10b981' : '#ef4444', textAlign: 'right' }}>{up ? '+' : ''}{a.changePct.toFixed(2)}%</span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: c, textAlign: 'right' }}>{a.fundingAnn >= 0 ? '+' : ''}{a.fundingAnn.toFixed(0)}%</span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', textAlign: 'right' }}>{fmtOI(a.oiUsd)}</span>
                  <div style={{ textAlign: 'right' }}>
                    {sig && <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 4px', borderRadius: 3, background: sig.dir === 'long' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: sig.dir === 'long' ? '#10b981' : '#ef4444' }}>{sig.dir === 'long' ? '▲' : '▼'} {sig.type}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {assets && results.length === 0 && (
        <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 11, padding: 24 }}>No assets match current filters.</div>
      )}
    </div>
  );
}

function NewsPanel({ watchlist }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSym, setSelectedSym] = useState('all');

  const topSyms = watchlist.slice(0, 8);

  useEffect(() => {
    setLoading(true); setError(false);
    const syms = topSyms.join(',');
    fetch(`/api/news?symbols=${syms}`)
      .then(r => r.json())
      .then(d => { setNews(d.news || []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [watchlist.slice(0, 8).join(',')]);

  const fmtAge = ts => {
    const m = Math.floor((Date.now() / 1000 - ts) / 60);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  };

  const filtered = selectedSym === 'all' ? news : news.filter(n => n.querySym === selectedSym);
  const symCounts = {};
  news.forEach(n => { symCounts[n.querySym] = (symCounts[n.querySym] || 0) + 1; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>MARKET NEWS</div>
        {!loading && !error && news.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setSelectedSym('all')} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 700, border: 'none', cursor: 'pointer', background: selectedSym === 'all' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)', color: selectedSym === 'all' ? '#a5b4fc' : '#4b5563' }}>All</button>
            {Object.entries(symCounts).map(([sym, cnt]) => (
              <button key={sym} onClick={() => setSelectedSym(sym)} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 700, border: 'none', cursor: 'pointer', background: selectedSym === sym ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)', color: selectedSym === sym ? '#a5b4fc' : '#4b5563' }}>
                {sym} {cnt > 1 ? `(${cnt})` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>Loading news…</div>
      )}
      {error && (
        <div style={{ padding: 16, textAlign: 'center', color: '#4b5563', fontSize: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          Unable to load news right now. Try again later.
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: '#4b5563', fontSize: 12 }}>No news found.</div>
      )}

      {filtered.map((n, i) => (
        <a key={n.uuid || i} href={n.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', flexShrink: 0 }}>{n.querySym}</span>
              <span style={{ fontSize: 9, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{n.publisher}</span>
              <span style={{ fontSize: 9, color: '#374151', fontFamily: 'monospace', flexShrink: 0 }}>{fmtAge(n.providerPublishTime)}</span>
            </div>
            <div style={{ fontSize: 12, color: '#e5e7eb', fontWeight: 500, lineHeight: 1.45 }}>{n.title}</div>
          </div>
        </a>
      ))}

      {!loading && !error && news.length > 0 && (
        <div style={{ fontSize: 10, color: '#374151', textAlign: 'center', padding: '4px 0' }}>
          Powered by Yahoo Finance · {topSyms.length} tickers tracked
        </div>
      )}
    </div>
  );
}

// Shared signal card body used by the ORB and SMC panels
function StratSigCard({ sig, fp, extraTags = [], sym }) {
  const dc = sig.dir === 'long' ? '#10b981' : '#ef4444';
  const ps = positionSize(sig.entry, sig.sl, sym);
  const condTags = [
    sig.regime && [sig.regime.toUpperCase(), sig.regime === 'trending' ? '#10b981' : sig.regime === 'ranging' ? '#f59e0b' : '#6b7280'],
    sig.volState && sig.volState !== 'normal' && [sig.volState.toUpperCase(), sig.volState === 'expansion' ? '#a855f7' : '#6b7280'],
  ].filter(Boolean);
  return (
    <div style={{ padding: '7px 9px', borderRadius: 7, background: `${dc}07`, border: `1px solid ${dc}22`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 8, fontWeight: 900, color: '#10b981', background: 'rgba(16,185,129,0.14)', padding: '1px 5px', borderRadius: 3 }}>● ACTIVE</span>
          <span style={{ fontSize: 8, fontWeight: 800, color: dc }}>{sig.dir === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
          <span style={{ fontSize: 8, color: '#6b7280', fontWeight: 700 }}>{sig.setup}</span>
          {condTags.map(([t, c]) => <span key={t} style={{ fontSize: 7, fontWeight: 700, color: c, background: `${c}14`, padding: '1px 5px', borderRadius: 3 }}>{t}</span>)}
          {extraTags.map(([t, c]) => <span key={t} style={{ fontSize: 7, fontWeight: 800, color: c, background: `${c}16`, padding: '1px 5px', borderRadius: 3 }}>{t}</span>)}
        </div>
        <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 800, color: sig.conf >= 70 ? '#10b981' : '#f59e0b' }}>{sig.conf}%</span>
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic' }}>{sig.reason}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3 }}>
        {[['Entry', fp(sig.entry), '#e5e7eb'], ['TP1 ½', fp(sig.tp1), '#6ee7b7'], ['TP2', fp(sig.tp), '#10b981'], ['SL', fp(sig.sl), '#ef4444'], ['RR', sig.rr ? `${sig.rr}×` : '—', '#a5b4fc']].map(([lbl, val, color]) => (
          <div key={lbl} style={{ padding: '3px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }}>{lbl}</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>
      {ps && (
        <div style={{ fontSize: 8, color: '#6b7280' }}>
          Risk ${ps.riskDollars.toFixed(0)} ({ps.riskPct}% of ${ps.acctSize.toLocaleString()}) → ~{ps.units < 10 ? ps.units.toFixed(2) : Math.round(ps.units).toLocaleString()} units{!ps.exact ? ' (approx — non-USD quote)' : ''}
        </div>
      )}
      <div style={{ fontSize: 8, color: '#4b5563' }}>Bank half at TP1, move stop to breakeven, run the rest to TP2</div>
    </div>
  );
}

const stratFmtPx = (sym, p) => p == null ? '—' : sym?.startsWith('XAUUSD') ? p.toFixed(2) : sym?.startsWith('XAGUSD') ? p.toFixed(3) : p >= 100 ? p.toFixed(3) : p.toFixed(4);

// Position sizing from the account's fixed risk % (set in Account tab) and a
// signal's entry/stop distance. riskDollars = acctSize * riskPct is exact;
// units = riskDollars / |entry-sl| is exact for USD-quoted instruments (metals,
// XXX/USD pairs) and a reasonable approximation otherwise — flagged as such.
function positionSize(entry, sl, sym) {
  if (entry == null || sl == null || entry === sl) return null;
  let acctSize = 25000, riskPct = 1;
  try { acctSize = parseInt(localStorage.getItem('fe_account_size') || '25000') || 25000; } catch {}
  try { riskPct  = parseFloat(localStorage.getItem('fe_risk_pct') || '1') || 1; } catch {}
  const riskDollars = acctSize * (riskPct / 100);
  const dist = Math.abs(entry - sl);
  const units = riskDollars / dist;
  const usdQuoted = sym?.endsWith('USD=X') || sym?.startsWith('XAUUSD') || sym?.startsWith('XAGUSD');
  return { riskDollars, units, riskPct, acctSize, exact: !!usdQuoted };
}

function ORBPanel({ onChart, livePrices }) {
  const [pairData, setPairData] = useState({});
  const inflightRef  = useRef({});
  const prevAlertRef = useRef({});
  const dailyRef     = useRef({});

  const fetchPair = useCallback(async (sym) => {
    if (inflightRef.current[sym]) return;
    inflightRef.current[sym] = true;
    try {
      const needDaily = !dailyRef.current[sym] || Date.now() - dailyRef.current[sym].time > 60000;
      const reqs = [fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=5m&range=5d`)];
      if (needDaily) reqs.push(fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=1d&range=90d`));
      const [d5, d1d] = await Promise.all((await Promise.all(reqs)).map(r => r.json()));
      const c5 = d5.candles || [];
      const price = d5.meta?.regularMarketPrice || c5[c5.length - 1]?.close;
      if (needDaily && d1d) {
        const c1 = d1d.candles || [];
        const dPrice = d1d.meta?.regularMarketPrice || c1[c1.length - 1]?.close;
        dailyRef.current[sym] = { htf: dPrice ? ictHtfBias(ictAnalyze(c1, dPrice)) : null, time: Date.now() };
      }
      if (!price) { inflightRef.current[sym] = false; return; }
      const a = orbAnalyze(c5, price, dailyRef.current[sym]?.htf || null);
      setPairData(prev => ({ ...prev, [sym]: { price, a, c5 } }));
      const sig = a?.sig;
      const refKey = `${sym}|ORB`;
      const key = sig ? `${sig.dir}|${sig.setup}` : null;
      const prev = prevAlertRef.current[refKey];
      const name = ICT_PAIRS.find(p => p.symbol === sym)?.name || sym;
      if (key && prev !== key && isHighQualitySignal('ORB', sig.conf, sig.rr, name, sig.setup, sig.regime)) {
        const isNew = logSignalAlert({ source: 'ORB', symbol: sym, name, dir: sig.dir, type: sig.setup, conf: sig.conf, reason: sig.reason, price: sig.entry, sl: sig.sl, tp: sig.tp, regime: sig.regime, volState: sig.volState });
        if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`FlowEdge ORB — ${name}`, { body: `${sig.dir.toUpperCase()} ${sig.setup} · ${sig.conf}%\n${sig.reason}`, icon: '/favicon.ico' });
        }
      }
      if (key) prevAlertRef.current[refKey] = key;
    } catch {}
    inflightRef.current[sym] = false;
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    ICT_PAIRS.forEach(p => fetchPair(p.symbol));
    const iv = setInterval(() => ICT_PAIRS.forEach(p => fetchPair(p.symbol)), 1000);
    return () => clearInterval(iv);
  }, [fetchPair]);

  const loaded = Object.keys(pairData).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Opening Range Breakout</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>First 30m of London (3:00 ET) & NY (9:30 ET) opens · first close beyond the range trades the break · measured-move target</div>
        </div>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#4b5563' }}>{loaded}/{ICT_PAIRS.length} pairs</div>
      </div>

      {ICT_PAIRS.map(pair => {
        const d = pairData[pair.symbol];
        const fp = p => stratFmtPx(pair.symbol, p);
        const a = d?.a;
        const dispSess = a?.sessions?.find(s => a.sig && s.key === a.sig.session) || a?.sessions?.[a.sessions.length - 1];
        return (
          <div key={pair.symbol} style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{pair.name}</span>
                {onChart && <button onClick={() => onChart(TV_SYMBOLS[pair.symbol] || pair.symbol)} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4, padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>📈 TV</button>}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#e5e7eb' }}>{d ? fp(livePrices?.[pair.symbol] ?? d.price) : '…'}</span>
            </div>
            {d ? (
              <>
                <ICTCandleChart candles={d.c5} sym={pair.symbol} tfLabel="5M · ORB" bars={84}
                  zones={dispSess ? [{ top: dispSess.orHigh, bottom: dispSess.orLow, idx: dispSess.startIdx, fill: 'rgba(245,158,11,0.10)' }] : []}
                  bsl={dispSess ? [dispSess.orHigh] : []} ssl={dispSess ? [dispSess.orLow] : []}
                  sig={a?.sig || null} />
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(a?.sessions || []).map(s => {
                    const stc = s.state === 'long' ? '#10b981' : s.state === 'short' ? '#ef4444' : s.state === 'forming' ? '#f59e0b' : '#6b7280';
                    return (
                      <span key={s.key} style={{ fontSize: 8.5, fontFamily: 'monospace', fontWeight: 700, color: stc, background: `${stc}10`, border: `1px solid ${stc}25`, padding: '2px 7px', borderRadius: 4 }}>
                        {s.key}: {fp(s.orLow)}–{fp(s.orHigh)} · {s.state === 'forming' ? 'RANGE FORMING' : s.state === 'set' ? 'WAITING FOR BREAK' : s.state === 'long' ? 'BROKE ▲' : 'BROKE ▼'}
                      </span>
                    );
                  })}
                  {!a?.sessions?.length && <span style={{ fontSize: 9, color: '#374151' }}>No session range in the current data window</span>}
                </div>
                {a?.sig && <StratSigCard sig={a.sig} fp={fp} sym={pair.symbol} />}
              </>
            ) : <div style={{ fontSize: 9, color: '#374151' }}>Loading 5m candles…</div>}
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', paddingTop: 4 }}>
        ORB — stop at the range midpoint (floored/capped) · target = measured move, min 1.5:1 · counter-HTF breaks and abnormal ranges skipped · Educational use only
      </div>
    </div>
  );
}

function SMCPanel({ onChart, livePrices }) {
  const [pairData, setPairData] = useState({});
  const inflightRef  = useRef({});
  const prevAlertRef = useRef({});
  const dailyRef     = useRef({});

  const fetchPair = useCallback(async (sym) => {
    if (inflightRef.current[sym]) return;
    inflightRef.current[sym] = true;
    try {
      const needDaily = !dailyRef.current[sym] || Date.now() - dailyRef.current[sym].time > 60000;
      const reqs = [fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=15m&range=5d`)];
      if (needDaily) reqs.push(fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=1d&range=90d`));
      const [d15, d1d] = await Promise.all((await Promise.all(reqs)).map(r => r.json()));
      const c15 = d15.candles || [];
      const price = d15.meta?.regularMarketPrice || c15[c15.length - 1]?.close;
      if (needDaily && d1d) {
        const c1 = d1d.candles || [];
        const dPrice = d1d.meta?.regularMarketPrice || c1[c1.length - 1]?.close;
        dailyRef.current[sym] = { htf: dPrice ? ictHtfBias(ictAnalyze(c1, dPrice)) : null, time: Date.now() };
      }
      if (!price) { inflightRef.current[sym] = false; return; }
      const a = smcAnalyze(c15, price, dailyRef.current[sym]?.htf || null);
      setPairData(prev => ({ ...prev, [sym]: { price, a, c15 } }));
      const sig = a?.sig;
      const refKey = `${sym}|SMC`;
      const key = sig ? `${sig.dir}|${sig.setup}` : null;
      const prev = prevAlertRef.current[refKey];
      const name = ICT_PAIRS.find(p => p.symbol === sym)?.name || sym;
      if (key && prev !== key && isHighQualitySignal('SMC', sig.conf, sig.rr, name, sig.setup, sig.regime)) {
        const isNew = logSignalAlert({ source: 'SMC', symbol: sym, name, dir: sig.dir, type: sig.setup, conf: sig.conf, reason: sig.reason, price: sig.entry, sl: sig.sl, tp: sig.tp, regime: sig.regime, volState: sig.volState });
        if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`FlowEdge SMC — ${name}`, { body: `${sig.dir.toUpperCase()} ${sig.setup} · ${sig.conf}%\n${sig.reason}`, icon: '/favicon.ico' });
        }
      }
      if (key) prevAlertRef.current[refKey] = key;
    } catch {}
    inflightRef.current[sym] = false;
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    ICT_PAIRS.forEach(p => fetchPair(p.symbol));
    const iv = setInterval(() => ICT_PAIRS.forEach(p => fetchPair(p.symbol)), 1000);
    return () => clearInterval(iv);
  }, [fetchPair]);

  const loaded = Object.keys(pairData).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Smart Money Concepts</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>15m market structure · BOS continuation · CHoCH reversal · entries at zone mitigation with rejection</div>
        </div>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#4b5563' }}>{loaded}/{ICT_PAIRS.length} pairs</div>
      </div>

      {ICT_PAIRS.map(pair => {
        const d = pairData[pair.symbol];
        const fp = p => stratFmtPx(pair.symbol, p);
        const a = d?.a;
        const ev = a?.lastEvent;
        const tc = a?.trend === 'up' ? '#10b981' : a?.trend === 'down' ? '#ef4444' : '#6b7280';
        return (
          <div key={pair.symbol} style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{pair.name}</span>
                {a && <span style={{ fontSize: 8, fontWeight: 800, color: tc, background: `${tc}14`, padding: '1px 6px', borderRadius: 3 }}>{a.trend === 'up' ? '▲ UPTREND' : a.trend === 'down' ? '▼ DOWNTREND' : '◦ RANGE'}</span>}
                {ev && <span style={{ fontSize: 8, fontWeight: 800, color: ev.type === 'CHOCH' ? '#f59e0b' : '#3b82f6', background: ev.type === 'CHOCH' ? 'rgba(245,158,11,0.14)' : 'rgba(59,130,246,0.14)', padding: '1px 6px', borderRadius: 3 }}>{ev.type} {ev.dir === 'up' ? '▲' : '▼'} @ {fp(ev.level)}</span>}
                {onChart && <button onClick={() => onChart(TV_SYMBOLS[pair.symbol] || pair.symbol)} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4, padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>📈 TV</button>}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#e5e7eb' }}>{d ? fp(livePrices?.[pair.symbol] ?? d.price) : '…'}</span>
            </div>
            {d ? (
              <>
                <ICTCandleChart candles={d.c15} sym={pair.symbol} tfLabel="15M · SMC" bars={96}
                  zones={a?.zone ? [{ ...a.zone, fill: ev?.dir === 'up' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }] : []}
                  bsl={a?.structureHighs || []} ssl={a?.structureLows || []}
                  sig={a?.sig || null} />
                {a?.sig ? (
                  <StratSigCard sig={a.sig} fp={fp} sym={pair.symbol} extraTags={a.mtfAligned ? [['✓ MTF ALIGNED', '#a5b4fc']] : []} />
                ) : (
                  <div style={{ fontSize: 9, color: '#374151', fontWeight: 700 }}>
                    {a?.mtfVetoed ? 'WAITING — mitigation setup found but it fights the daily bias (MTF veto)'
                      : ev && a?.zone ? `WAITING — ${ev.type} ${ev.dir} confirmed; watching for mitigation of ${fp(a.zone.bottom)}–${fp(a.zone.top)} with a rejection candle`
                      : ev ? `${ev.type} ${ev.dir} confirmed — origin zone already invalidated, waiting for new structure`
                      : 'Building structure…'}
                  </div>
                )}
              </>
            ) : <div style={{ fontSize: 9, color: '#374151' }}>Loading 15m candles…</div>}
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', paddingTop: 4 }}>
        SMC — CHoCH mitigation (74%) ranks above BOS pullback (68%) · rejection candle required · daily bias vetoes counter-trend entries · min 1.5:1, runners to structure · Educational use only
      </div>
    </div>
  );
}

// ─── Order flow ─────────────────────────────────────────────────────────────

// Order-flow proxy — where the money is coming from. Uses real volume when the
// feed provides it (metals futures carry volume on Yahoo); FX pairs report no
// volume, so each candle's close position in its range stands in for aggression
// (buyers in control close candles near their highs). Produces a -100..+100
// pressure score, a cumulative-delta series, and absorption detection (heavy
// volume that moves price nowhere — a big passive player soaking up aggression).
function orderFlowAnalyze(candles) {
  if (!candles || candles.length < 30) return null;
  const recent = candles.slice(-96);
  const hasVol = recent.some(c => (c.volume || 0) > 0);
  let cum = 0;
  const cumSeries = [];
  const deltas = recent.map(c => {
    const range = c.high - c.low;
    const pos = range > 0 ? (c.close - c.low) / range : 0.5;
    const aggression = pos * 2 - 1; // -1 (sellers slammed it) .. +1 (buyers ran it)
    const weight = hasVol ? (c.volume || 0) : range;
    const d = aggression * weight;
    cum += d;
    cumSeries.push(cum);
    return d;
  });
  const norm = deltas.reduce((s, d) => s + Math.abs(d), 0) || 1;
  const score = Math.max(-100, Math.min(100, Math.round((deltas.slice(-24).reduce((s, d) => s + d, 0) / norm) * 400)));
  const recentD = deltas.slice(-12).reduce((s, d) => s + d, 0);
  const priorD  = deltas.slice(-36, -12).reduce((s, d) => s + d, 0) / 2;
  const avgW = recent.reduce((s, c) => s + (hasVol ? (c.volume || 0) : c.high - c.low), 0) / recent.length;
  const absorption = recent.slice(-8).filter(c => {
    const w = hasVol ? (c.volume || 0) : c.high - c.low;
    return w > avgW * 2 && Math.abs(c.close - c.open) < (c.high - c.low) * 0.3;
  }).length;
  return {
    flow: score > 15 ? 'buyers' : score < -15 ? 'sellers' : 'neutral',
    score, cumSeries: cumSeries.slice(-48), hasVol, absorption,
    shifting: recentD !== 0 && priorD !== 0 && Math.sign(recentD) !== Math.sign(priorD),
  };
}

// Cumulative-delta sparkline for the order-flow row
function CumDeltaSpark({ series }) {
  if (!series || series.length < 4) return null;
  const W = 90, H = 22;
  const lo = Math.min(...series), hi = Math.max(...series);
  const y = v => hi > lo ? ((hi - v) / (hi - lo)) * (H - 4) + 2 : H / 2;
  const x = i => (i / (series.length - 1)) * W;
  const up = series[series.length - 1] >= series[0];
  const dPath = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 90, height: 22 }}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 2" />
      <path d={dPath} fill="none" stroke={up ? '#10b981' : '#ef4444'} strokeWidth="1.2" />
    </svg>
  );
}

// ─── Confluence — every engine on one page ──────────────────────────────────

// Live status of the conditions that gate alerts — makes the "blocked, not
// downgraded" filtering visible instead of silent. Refreshes every 10s (news
// blackout and session state only change at minute granularity).
function TradingConditionsBar() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 10000); return () => clearInterval(t); }, []);
  const news = newsBlackoutActive();
  const risk = dailyRiskHalt();
  const sessions = fxSessions();
  const kz = ictKillzones();
  const sessionOk = sessions.includes('LONDON') || sessions.includes('NEW YORK');

  const Chip = ({ label, ok, detail }) => (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, color: ok ? '#10b981' : '#ef4444', background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
      {ok ? '✓' : '✗'} {label}{detail ? ` — ${detail}` : ''}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em' }}>CONDITIONS</span>
      <Chip label="NEWS" ok={!news.active} detail={news.active ? `${news.event} blackout` : null} />
      <Chip label="DAILY RISK" ok={!risk.halted} detail={risk.halted ? risk.reason : risk.netR != null ? `${risk.netR >= 0 ? '+' : ''}${risk.netR}R today` : null} />
      <Chip label="SESSION" ok={sessionOk} detail={sessions.join('/') || 'closed'} />
      {kz.length > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 4 }}>⚡ {kz.join(', ')}</span>}
    </div>
  );
}

function ConfluencePanel({ onChart, livePrices }) {
  const [pairData, setPairData] = useState({});
  const inflightRef  = useRef({});
  const prevAlertRef = useRef({});

  const fetchPair = useCallback(async (sym) => {
    if (inflightRef.current[sym]) return;
    inflightRef.current[sym] = true;
    try {
      const [d5, d15, d1] = await Promise.all([
        fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=5m&range=5d`).then(r => r.json()),
        fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=15m&range=5d`).then(r => r.json()),
        fetch(`/api/ohlcv?symbol=${encodeURIComponent(sym)}&interval=1d&range=90d`).then(r => r.json()),
      ]);
      const c5 = d5.candles || [], c15 = d15.candles || [], c1 = d1.candles || [];
      const price = d5.meta?.regularMarketPrice || c5[c5.length - 1]?.close;
      if (!price || c1.length < 25) { inflightRef.current[sym] = false; return; }

      const daily    = ictAnalyze(c1, d1.meta?.regularMarketPrice || c1[c1.length - 1].close);
      const dailyHtf = ictHtfBias(daily);
      const intra = ictIntradayAnalyze(c15, price, 'intra', dailyHtf);
      const orb   = orbAnalyze(c5, price, dailyHtf);
      const smc   = smcAnalyze(c15, price, dailyHtf);
      const flow  = orderFlowAnalyze(c5);

      const dailySig = daily?.signal ? { dir: daily.signal, setup: daily.signalType.replace('_', ' '), conf: daily.confidence, reason: daily.reason, entry: daily.entry, sl: daily.sl, tp: daily.tp, tp1: daily.tp1, rr: daily.rr, regime: daily.regime, volState: daily.volState } : null;
      const reads = [
        { key: 'DAILY ICT', dir: daily?.bias?.verdict === 'BUY' ? 'long' : daily?.bias?.verdict === 'SELL' ? 'short' : null, sig: dailySig },
        { key: '15M ICT',   dir: intra?.sig?.dir || null, sig: intra?.sig || null },
        { key: 'ORB',       dir: orb?.sig?.dir || null,   sig: orb?.sig || null },
        { key: 'SMC',       dir: smc?.sig?.dir || (smc?.trend === 'up' ? 'long' : smc?.trend === 'down' ? 'short' : null), sig: smc?.sig || null },
        { key: 'ORDER FLOW', dir: flow?.flow === 'buyers' ? 'long' : flow?.flow === 'sellers' ? 'short' : null, sig: null },
      ];
      const longs  = reads.filter(r => r.dir === 'long').length;
      const shorts = reads.filter(r => r.dir === 'short').length;
      const dir    = longs > shorts ? 'long' : shorts > longs ? 'short' : null;
      const agree  = Math.max(longs, shorts);
      const activeAligned = reads.filter(r => r.sig && r.sig.dir === dir);
      const flowAgrees = (dir === 'long' && flow?.flow === 'buyers') || (dir === 'short' && flow?.flow === 'sellers');
      const grade =
        dir && agree >= 4 && activeAligned.length >= 1 && flowAgrees ? 'IMPECCABLE'
        : dir && agree >= 3 && activeAligned.length >= 1 ? 'STRONG'
        : dir && agree >= 3 ? 'LEANING'
        : 'MIXED';
      let combo = null;
      if ((grade === 'IMPECCABLE' || grade === 'STRONG') && activeAligned.length) {
        const best = [...activeAligned].sort((a, b) => (b.sig.conf || 0) - (a.sig.conf || 0))[0].sig;
        combo = {
          ...best,
          setup: `${grade} · ${agree}/5 ENGINES`,
          conf: Math.min(95, 58 + agree * 7 + (flowAgrees ? 5 : 0)),
          reason: `${agree}/5 engines agree ${dir === 'long' ? 'LONG' : 'SHORT'} (${reads.filter(r => r.dir === dir).map(r => r.key).join(', ')}) — levels from the highest-conviction entry (${best.setup})`,
        };
      }
      setPairData(prev => ({ ...prev, [sym]: { price, reads, dir, agree, grade, flow, combo, c15, smc } }));

      // Alert only on the top grade — this is the "impeccable trade" signal
      const refKey = `${sym}|CONFLUENCE`;
      const key = combo && grade === 'IMPECCABLE' ? `${combo.dir}|${grade}` : null;
      const prev = prevAlertRef.current[refKey];
      const name = ICT_PAIRS.find(p => p.symbol === sym)?.name || sym;
      if (key && prev !== key && isHighQualitySignal('CONFLUENCE', combo.conf, combo.rr, name, combo.setup, combo.regime)) {
        const isNew = logSignalAlert({ source: 'CONFLUENCE', symbol: sym, name, dir: combo.dir, type: combo.setup, conf: combo.conf, reason: combo.reason, price: combo.entry, sl: combo.sl, tp: combo.tp, regime: combo.regime, volState: combo.volState });
        if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`FlowEdge ★ CONFLUENCE — ${name}`, { body: `${combo.dir.toUpperCase()} ${combo.setup} · ${combo.conf}%\n${combo.reason}`, icon: '/favicon.ico' });
        }
      }
      if (key) prevAlertRef.current[refKey] = key;
    } catch {}
    inflightRef.current[sym] = false;
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    ICT_PAIRS.forEach(p => fetchPair(p.symbol));
    const iv = setInterval(() => ICT_PAIRS.forEach(p => fetchPair(p.symbol)), 1000);
    return () => clearInterval(iv);
  }, [fetchPair]);

  const GRADE_STYLE = {
    IMPECCABLE: { c: '#fbbf24', label: '★ IMPECCABLE' },
    STRONG:     { c: '#10b981', label: '● STRONG' },
    LEANING:    { c: '#a5b4fc', label: '◐ LEANING' },
    MIXED:      { c: '#4b5563', label: '◦ MIXED' },
  };
  const gradeRank = { IMPECCABLE: 0, STRONG: 1, LEANING: 2, MIXED: 3 };
  const rows = ICT_PAIRS.map(p => ({ p, d: pairData[p.symbol] }))
    .sort((a, b) => (gradeRank[a.d?.grade] ?? 9) - (gradeRank[b.d?.grade] ?? 9) || (b.d?.agree ?? 0) - (a.d?.agree ?? 0));
  const loaded = Object.keys(pairData).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Confluence — All Engines</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Daily ICT · 15m ICT · ORB · SMC · Order Flow — one verdict per pair, ★ when they stack</div>
        </div>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#4b5563' }}>{loaded}/{ICT_PAIRS.length} pairs</div>
      </div>

      <TradingConditionsBar />

      {rows.map(({ p: pair, d }) => {
        const fp = px => stratFmtPx(pair.symbol, px);
        const gs = GRADE_STYLE[d?.grade] || GRADE_STYLE.MIXED;
        return (
          <div key={pair.symbol} style={{ padding: '10px 12px', borderRadius: 9, background: d?.grade === 'IMPECCABLE' ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${d?.grade === 'IMPECCABLE' ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#f9fafb' }}>{pair.name}</span>
                <span style={{ fontSize: 9, fontWeight: 900, color: gs.c, background: `${gs.c}18`, padding: '2px 8px', borderRadius: 4 }}>{gs.label}{d?.dir ? ` — ${d.dir === 'long' ? 'LONG' : 'SHORT'} ${d.agree}/5` : ''}</span>
                {onChart && <button onClick={() => onChart(TV_SYMBOLS[pair.symbol] || pair.symbol)} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 4, padding: '1px 6px', color: '#a5b4fc', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>📈 TV</button>}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#e5e7eb' }}>{d ? fp(livePrices?.[pair.symbol] ?? d.price) : '…'}</span>
            </div>
            {d ? (
              <>
                {/* Engine votes */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.reads.map(r => {
                    const rc = r.dir === 'long' ? '#10b981' : r.dir === 'short' ? '#ef4444' : '#374151';
                    return (
                      <span key={r.key} style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 800, color: rc, background: `${rc}10`, border: `1px solid ${r.sig ? rc + '55' : rc + '20'}`, padding: '2px 6px', borderRadius: 4 }}>
                        {r.key} {r.dir === 'long' ? '▲' : r.dir === 'short' ? '▼' : '—'}{r.sig ? ' ●' : ''}
                      </span>
                    );
                  })}
                </div>
                {/* Order flow meter */}
                {d.flow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 7, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em' }}>MONEY FLOW</span>
                    <div style={{ flex: 1, minWidth: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)' }} />
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: d.flow.score >= 0 ? '50%' : `${50 + d.flow.score / 2}%`, width: `${Math.abs(d.flow.score) / 2}%`, background: d.flow.score >= 0 ? '#10b981' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 800, color: d.flow.flow === 'buyers' ? '#10b981' : d.flow.flow === 'sellers' ? '#ef4444' : '#6b7280' }}>
                      {d.flow.flow.toUpperCase()} {d.flow.score > 0 ? '+' : ''}{d.flow.score}
                    </span>
                    <CumDeltaSpark series={d.flow.cumSeries} />
                    <span style={{ fontSize: 7.5, color: '#4b5563' }}>
                      {d.flow.hasVol ? 'real volume Δ' : 'aggression proxy'}{d.flow.absorption > 0 ? ` · ${d.flow.absorption} absorption bar${d.flow.absorption > 1 ? 's' : ''}` : ''}{d.flow.shifting ? ' · flow shifting' : ''}
                    </span>
                  </div>
                )}
                {/* Combined trade when engines stack */}
                {d.combo ? (
                  <StratSigCard sig={d.combo} fp={fp} sym={pair.symbol} extraTags={d.grade === 'IMPECCABLE' ? [['★ ALL SYSTEMS ALIGNED', '#fbbf24']] : []} />
                ) : (
                  <div style={{ fontSize: 9, color: '#374151', fontWeight: 700 }}>
                    {d.grade === 'LEANING' ? `Leaning ${d.dir} (${d.agree}/6) — no live entry from an aligned engine yet` : 'Engines disagree — no confluence trade'}
                  </div>
                )}
                {d.grade === 'IMPECCABLE' && d.c15 && (
                  <ICTCandleChart candles={d.c15} sym={pair.symbol} tfLabel="15M · CONFLUENCE" bars={96}
                    zones={d.smc?.zone ? [{ ...d.smc.zone, fill: 'rgba(251,191,36,0.10)' }] : []}
                    bsl={d.smc?.structureHighs || []} ssl={d.smc?.structureLows || []}
                    sig={d.combo} />
                )}
              </>
            ) : <div style={{ fontSize: 9, color: '#374151' }}>Running all engines…</div>}
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', paddingTop: 4 }}>
        ★ IMPECCABLE = 4+ of 5 engines agree + a live entry + order flow confirms · STRONG = 3+ with a live entry · levels come from the highest-conviction engine · Educational use only
      </div>
    </div>
  );
}

// ─── Backtest & live performance ────────────────────────────────────────────

function summarizeTrades(trades) {
  const wins    = trades.filter(t => t.result === 'win').length;
  const losses  = trades.filter(t => t.result === 'loss').length;
  const totalR  = +trades.reduce((s, t) => s + t.r, 0).toFixed(1);
  const grossW  = trades.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0);
  const grossL  = Math.abs(trades.filter(t => t.r < 0).reduce((s, t) => s + t.r, 0));
  return {
    n: trades.length, wins, losses, timeouts: trades.length - wins - losses,
    wr: wins + losses ? +((wins / (wins + losses)) * 100).toFixed(0) : null,
    totalR,
    expectancy: trades.length ? +(totalR / trades.length).toFixed(2) : null,
    pf: grossL > 0 ? +(grossW / grossL).toFixed(2) : null,
  };
}

// Walk-forward backtest with scale-out management, mirroring the live playbook:
// enter at bar close when a signal fires; bank half the position at TP1
// and move the stop to breakeven; run the rest to TP2. A trade that reaches TP1
// is a WIN (profit banked, worst case +0.25R); full stop before TP1 is a -1R
// loss. SL/BE checked before targets on both-touched bars (conservative).
function backtestSeries(candles, mode, htfAt) {
  const isScalp = mode === 'scalp';
  const warm = isScalp ? 60 : 80;
  const win  = isScalp ? 288 : 480;
  const maxHold = isScalp ? 48 : 96;
  const trades = [];
  let open = null;
  for (let i = warm; i < candles.length; i++) {
    const c = candles[i];
    if (open) {
      const L = open.dir === 'long';
      if (!open.t1) {
        const hitSL = L ? c.low <= open.sl : c.high >= open.sl;
        const hitT1 = L ? c.high >= open.tp1 : c.low <= open.tp1;
        if (hitSL) { trades.push({ ...open, result: 'loss', r: -1 }); open = null; }
        else if (hitT1) {
          open.t1 = true; open.sl = open.entry; // half banked at TP1, stop to breakeven
          const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
          if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        } else if (i - open.i >= maxHold) {
          const r = (L ? c.close - open.entry : open.entry - c.close) / open.risk;
          trades.push({ ...open, result: 'timeout', r: +r.toFixed(2) }); open = null;
        }
      } else {
        const hitBE = L ? c.low <= open.entry : c.high >= open.entry;
        const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
        if (hitBE)      { trades.push({ ...open, result: 'win', r: 0.5 * ICT_TP1_R }); open = null; } // runner scratched at BE, TP1 half banked
        else if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        else if (i - open.i >= maxHold) {
          const r = 0.5 * ICT_TP1_R + 0.5 * ((L ? c.close - open.entry : open.entry - c.close) / open.risk);
          trades.push({ ...open, result: 'win', r: +r.toFixed(2) }); open = null; // TP1 already banked
        }
      }
      continue;
    }
    const a = ictIntradayAnalyze(candles.slice(Math.max(0, i - win), i + 1), c.close, mode, htfAt ? htfAt(c.time) : null);
    const sig = a?.sig;
    if (sig && sig.rr) {
      const risk = Math.abs(sig.entry - sig.sl);
      if (risk > 0) open = {
        i, time: c.time, dir: sig.dir, setup: sig.setup, conf: sig.conf,
        entry: sig.entry, sl: sig.sl, tp: sig.tp, rr: +sig.rr, risk,
        tp1: sig.tp1 ?? (sig.dir === 'long' ? sig.entry + risk * ICT_TP1_R : sig.entry - risk * ICT_TP1_R),
        regime: sig.regime,
      };
    }
  }
  return trades;
}

// Walk-forward CONFLUENCE backtest — at each 15m bar, poll the engines the
// Confluence tab uses (daily bias, 15m ICT, SMC structure, order flow; ORB is
// omitted since it needs 5m data) and only enter when 3+ of the 4 agree AND an
// aligned engine has a live entry. Same scale-out management as backtestSeries.
// This measures the multi-engine-agreement edge itself, not any single engine.
function backtestConfluenceSeries(candles, htfAt) {
  const warm = 120, win = 480, maxHold = 96;
  const trades = [];
  let open = null;
  for (let i = warm; i < candles.length; i++) {
    const c = candles[i];
    if (open) {
      const L = open.dir === 'long';
      if (!open.t1) {
        const hitSL = L ? c.low <= open.sl : c.high >= open.sl;
        const hitT1 = L ? c.high >= open.tp1 : c.low <= open.tp1;
        if (hitSL) { trades.push({ ...open, result: 'loss', r: -1 }); open = null; }
        else if (hitT1) {
          open.t1 = true; open.sl = open.entry;
          const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
          if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        } else if (i - open.i >= maxHold) {
          const r = (L ? c.close - open.entry : open.entry - c.close) / open.risk;
          trades.push({ ...open, result: 'timeout', r: +r.toFixed(2) }); open = null;
        }
      } else {
        const hitBE = L ? c.low <= open.entry : c.high >= open.entry;
        const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
        if (hitBE)      { trades.push({ ...open, result: 'win', r: 0.5 * ICT_TP1_R }); open = null; }
        else if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        else if (i - open.i >= maxHold) {
          const r = 0.5 * ICT_TP1_R + 0.5 * ((L ? c.close - open.entry : open.entry - c.close) / open.risk);
          trades.push({ ...open, result: 'win', r: +r.toFixed(2) }); open = null;
        }
      }
      continue;
    }
    const slice = candles.slice(Math.max(0, i - win), i + 1);
    const htf   = htfAt ? htfAt(c.time) : null;
    const intra = ictIntradayAnalyze(slice, c.close, 'intra', htf);
    const smc   = smcAnalyze(slice, c.close, htf);
    const flow  = orderFlowAnalyze(slice);
    const votes = [
      htf && htf.verdict !== 'WAIT' ? (htf.verdict === 'BUY' ? 'long' : 'short') : null,
      intra?.sig?.dir || null,
      smc?.sig?.dir || (smc?.trend === 'up' ? 'long' : smc?.trend === 'down' ? 'short' : null),
      flow?.flow === 'buyers' ? 'long' : flow?.flow === 'sellers' ? 'short' : null,
    ];
    const longs  = votes.filter(v => v === 'long').length;
    const shorts = votes.filter(v => v === 'short').length;
    const dir    = longs > shorts ? 'long' : shorts > longs ? 'short' : null;
    const agree  = Math.max(longs, shorts);
    if (dir && agree >= 3) {
      const sigs = [intra?.sig, smc?.sig].filter(s => s && s.dir === dir && s.rr);
      if (sigs.length) {
        const best = sigs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
        const risk = Math.abs(best.entry - best.sl);
        if (risk > 0) open = {
          i, time: c.time, dir, setup: `CONF ${agree}/4`, conf: 60 + agree * 7,
          entry: best.entry, sl: best.sl, tp: best.tp, rr: +best.rr, risk,
          tp1: best.tp1 ?? (dir === 'long' ? best.entry + risk * ICT_TP1_R : best.entry - risk * ICT_TP1_R),
        };
      }
    }
  }
  return trades;
}

// Walk-forward SWING backtest — the daily ICT engine (structure, FVGs,
// liquidity sweeps) held for days instead of hours. Same scale-out management
// as the intraday engines (TP1 bank-half/breakeven, run to TP2), but with a
// ~1-month max hold since swing entries need room to develop. Larger, cleaner
// sample than 15m: 5 years of daily bars vs. ~84 days of intraday history.
function backtestDailySwing(daily) {
  const warm = 60, maxHold = 20;
  const trades = [];
  let open = null;
  for (let i = warm; i < daily.length; i++) {
    const c = daily[i];
    if (open) {
      const L = open.dir === 'long';
      if (!open.t1) {
        const hitSL = L ? c.low <= open.sl : c.high >= open.sl;
        const hitT1 = L ? c.high >= open.tp1 : c.low <= open.tp1;
        if (hitSL) { trades.push({ ...open, result: 'loss', r: -1 }); open = null; }
        else if (hitT1) {
          open.t1 = true; open.sl = open.entry;
          const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
          if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        } else if (i - open.i >= maxHold) {
          const r = (L ? c.close - open.entry : open.entry - c.close) / open.risk;
          trades.push({ ...open, result: 'timeout', r: +r.toFixed(2) }); open = null;
        }
      } else {
        const hitBE = L ? c.low <= open.entry : c.high >= open.entry;
        const hitT2 = L ? c.high >= open.tp : c.low <= open.tp;
        if (hitBE)      { trades.push({ ...open, result: 'win', r: 0.5 * ICT_TP1_R }); open = null; }
        else if (hitT2) { trades.push({ ...open, result: 'win', r: +(0.5 * ICT_TP1_R + 0.5 * open.rr).toFixed(2) }); open = null; }
        else if (i - open.i >= maxHold) {
          const r = 0.5 * ICT_TP1_R + 0.5 * ((L ? c.close - open.entry : open.entry - c.close) / open.risk);
          trades.push({ ...open, result: 'win', r: +r.toFixed(2) }); open = null;
        }
      }
      continue;
    }
    const a = ictAnalyze(daily.slice(0, i + 1), c.close);
    if (a?.signal && a.sl != null && a.rr) {
      const risk = Math.abs(a.entry - a.sl);
      if (risk > 0) open = {
        i, time: c.time, dir: a.signal, setup: a.signalType.replace('_', ' '), conf: a.confidence,
        entry: a.entry, sl: a.sl, tp: a.tp, rr: +a.rr, risk,
        tp1: a.tp1 ?? (a.signal === 'long' ? a.entry + risk * ICT_TP1_R : a.entry - risk * ICT_TP1_R),
        regime: a.regime,
      };
    }
  }
  return trades;
}

// Daily bias per point in time, computed walk-forward (no lookahead): the bias
// applied to an intraday bar only uses daily candles that had already closed.
function buildDailyBiasAt(daily) {
  const timeline = [];
  for (let j = 25; j < daily.length; j++) {
    const slice = daily.slice(0, j + 1);
    const a = ictAnalyze(slice, slice[slice.length - 1].close);
    if (a) timeline.push({ time: daily[j].time, htf: ictHtfBias(a) });
  }
  return t => {
    let h = null;
    for (const e of timeline) { if (e.time < t) h = e.htf; else break; }
    return h;
  };
}

function StatsPanel() {
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState('');
  const [bt, setBt] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fe_backtest') || 'null'); } catch { return null; }
  });
  const [feed, setFeed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    const t = setInterval(() => {
      try { setFeed(JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]')); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Out-of-sample split: the edge filter (which pairs/setups are allowed to
  // alert live) is derived ONLY from the in-sample slice — the first 70% of
  // each pair's history. The held-out final 30% never informs the filter; it
  // just measures whether that filter's edge survives on data it never saw.
  // A filter that looks great in-sample but collapses out-of-sample was fit
  // to noise, not a real edge — this is how you catch that before it costs you.
  const OOS_SPLIT = 0.7;

  const run = async () => {
    if (running) return;
    setRunning(true);
    const rowsIS = [], rowsOOS = [], allIS = [], allOOS = [], confIS = [], confOOS = [], swingIS = [], swingOOS = [], swingRowsIS = [], swingRowsOOS = [];
    try {
      for (const p of ICT_PAIRS) {
        setProg(`${p.name} — fetching candles…`);
        await new Promise(r => setTimeout(r, 20));
        const [d1, d15] = await Promise.all([
          fetch(`/api/ohlcv?symbol=${encodeURIComponent(p.symbol)}&interval=1d&range=5y`).then(r => r.json()),
          fetch(`/api/ohlcv?symbol=${encodeURIComponent(p.symbol)}&interval=15m&range=60d`).then(r => r.json()),
        ]);
        const daily = d1.candles || [], c15 = d15.candles || [];
        const htfAt = daily.length > 30 ? buildDailyBiasAt(daily) : null;
        setProg(`${p.name} — simulating 15m…`);
        await new Promise(r => setTimeout(r, 20));
        const t15 = c15.length > 200 ? backtestSeries(c15, 'intra', htfAt) : [];
        const splitTime = c15.length > 200 ? c15[Math.floor(c15.length * OOS_SPLIT)].time : Infinity;
        const tIS  = t15.filter(t => t.time <  splitTime).map(t => ({ ...t, pair: p.name, mode: 'INTRADAY' }));
        const tOOS = t15.filter(t => t.time >= splitTime).map(t => ({ ...t, pair: p.name, mode: 'INTRADAY' }));
        allIS.push(...tIS); allOOS.push(...tOOS);
        rowsIS.push({ pair: p.name, intra: summarizeTrades(tIS) });
        rowsOOS.push({ pair: p.name, intra: summarizeTrades(tOOS) });
        setProg(`${p.name} — simulating confluence (multi-engine)…`);
        await new Promise(r => setTimeout(r, 20));
        const tc = c15.length > 200 ? backtestConfluenceSeries(c15, htfAt) : [];
        confIS.push(...tc.filter(t => t.time < splitTime).map(t => ({ ...t, pair: p.name })));
        confOOS.push(...tc.filter(t => t.time >= splitTime).map(t => ({ ...t, pair: p.name })));
        setProg(`${p.name} — simulating daily swing…`);
        await new Promise(r => setTimeout(r, 20));
        const tswing = daily.length > 200 ? backtestDailySwing(daily) : [];
        const swingSplitTime = daily.length > 200 ? daily[Math.floor(daily.length * OOS_SPLIT)].time : Infinity;
        const swIS  = tswing.filter(t => t.time <  swingSplitTime).map(t => ({ ...t, pair: p.name }));
        const swOOS = tswing.filter(t => t.time >= swingSplitTime).map(t => ({ ...t, pair: p.name }));
        swingIS.push(...swIS); swingOOS.push(...swOOS);
        swingRowsIS.push({ pair: p.name, swing: summarizeTrades(swIS) });
        swingRowsOOS.push({ pair: p.name, swing: summarizeTrades(swOOS) });
      }
      // Filter rules derived from IN-SAMPLE data only.
      // Setups are graded PER PAIR — a setup only gets blocked on pairs where it
      // actually loses, not because it loses pooled across unrelated pairs.
      const pairSetupIS = {};
      allIS.forEach(t => { (pairSetupIS[`${t.pair}|${t.setup}`] = pairSetupIS[`${t.pair}|${t.setup}`] || []).push(t); });
      const pairSetups = Object.fromEntries(Object.entries(pairSetupIS).map(([k, v]) => [k, summarizeTrades(v)]));
      const passesFilter = (t) => {
        if (t.conf < 70) return false;
        const row = rowsIS.find(r => r.pair === t.pair);
        if (row?.intra && row.intra.n >= 10 && row.intra.totalR <= 0) return false;
        const ps = pairSetups[`${t.pair}|${t.setup}`];
        if (ps && ps.n >= 8 && ps.totalR <= 0) return false;
        return true;
      };
      const edge    = summarizeTrades(allIS.filter(passesFilter));
      // The critical check: apply the IS-derived filter to data it never saw
      const edgeOOS = summarizeTrades(allOOS.filter(passesFilter));
      const conf    = summarizeTrades(confIS);
      const confOOSum = summarizeTrades(confOOS);

      // Swing filter — same per-pair-setup discipline as the intraday engine
      const swingPairSetupIS = {};
      swingIS.forEach(t => { (swingPairSetupIS[`${t.pair}|${t.setup}`] = swingPairSetupIS[`${t.pair}|${t.setup}`] || []).push(t); });
      const swingPairSetups = Object.fromEntries(Object.entries(swingPairSetupIS).map(([k, v]) => [k, summarizeTrades(v)]));
      const passesSwingFilter = (t) => {
        if (t.conf < 70) return false; // matches the live gate in isHighQualitySignal
        const row = swingRowsIS.find(r => r.pair === t.pair);
        if (row?.swing && row.swing.n >= 5 && row.swing.totalR <= 0) return false;
        const ps = swingPairSetups[`${t.pair}|${t.setup}`];
        if (ps && ps.n >= 5 && ps.totalR <= 0) return false;
        return true;
      };
      const swingEdge    = summarizeTrades(swingIS.filter(passesSwingFilter));
      const swingEdgeOOS = summarizeTrades(swingOOS.filter(passesSwingFilter));

      const bySetupIS = {}, bySetupOOS = {};
      allIS.forEach(t => { (bySetupIS[t.setup] = bySetupIS[t.setup] || []).push(t); });
      allOOS.forEach(t => { (bySetupOOS[t.setup] = bySetupOOS[t.setup] || []).push(t); });

      // Out-of-sample verdicts — these gate live alerts (see edgeFilterOk):
      // held only when expectancy is positive in BOTH windows (a strategy that
      // loses in-sample or on unseen data is not an edge, whatever the other
      // window says); null = sample too small to judge. Swing needs a lower bar
      // (fewer trades possible even over 5 years of daily bars).
      const verdict = (is, oos, minN = 15) => (oos?.n ?? 0) < minN ? null
        : ((is?.expectancy ?? 0) > 0 && (oos?.expectancy ?? 0) > 0);

      // Regime hypothesis check — do trades taken in their hypothesized regime
      // (SETUP_REGIME) actually outperform trades taken outside it, on the
      // IN-SAMPLE data only? Pooled across INTRADAY + SWING since both engines
      // share the same setup vocabulary (LIQ SWEEP, STRUCTURE, FVG, etc).
      const regimeable = [...allIS, ...swingIS].filter(t => t.regime && SETUP_REGIME[t.setup]);
      const regimeMatched    = summarizeTrades(regimeable.filter(t => regimeMatches(t.setup, t.regime)));
      const regimeMismatched = summarizeTrades(regimeable.filter(t => !regimeMatches(t.setup, t.regime)));
      const regimeHelps = regimeMatched.n >= 20 && regimeMismatched.n >= 10
        ? (regimeMatched.expectancy ?? -Infinity) > (regimeMismatched.expectancy ?? Infinity) && (regimeMatched.expectancy ?? 0) > 0
        : null;

      const validation = {
        intradayOOS:   verdict(edge, edgeOOS),
        confluenceOOS: verdict(conf, confOOSum),
        swingOOS:      verdict(swingEdge, swingEdgeOOS, 8),
        regimeHelps,
      };

      const allTrades = [...allIS, ...allOOS];
      const result = {
        generatedAt: Date.now(),
        window: `~${Math.round(84 * OOS_SPLIT)}d in-sample / ~${Math.round(84 * (1 - OOS_SPLIT))}d out-of-sample of 15m + confluence · ~${Math.round(1826 * OOS_SPLIT)}d in-sample / ~${Math.round(1826 * (1 - OOS_SPLIT))}d out-of-sample of daily swing`,
        rows: rowsIS, rowsOOS, pairSetups, validation,
        regimeMatched, regimeMismatched,
        swingRows: swingRowsIS, swingRowsOOS, swingPairSetups, swingEdge, swingEdgeOOS,
        total: summarizeTrades(allTrades),
        intraTotal: summarizeTrades(allTrades.filter(t => t.mode === 'INTRADAY')),
        aplus: summarizeTrades(allTrades.filter(t => t.conf >= 70 && t.rr >= 1.5)),
        edge, edgeOOS,
        conf, confOOS: confOOSum,
        setups: Object.entries(bySetupIS).map(([k, v]) => ({ setup: k, ...summarizeTrades(v) })).sort((a, b) => b.n - a.n),
        setupsOOS: Object.entries(bySetupOOS).map(([k, v]) => ({ setup: k, ...summarizeTrades(v) })).sort((a, b) => b.n - a.n),
      };
      localStorage.setItem('fe_backtest', JSON.stringify(result));
      setBt(result);
      setProg('');
    } catch (e) { setProg(`Error: ${e.message}`); }
    setRunning(false);
  };

  // Live record from tracked signal outcomes
  const closed  = feed.filter(f => f.outcome === 'WIN' || f.outcome === 'LOSS');
  const expired = feed.filter(f => f.outcome === 'EXPIRED');
  const openSig = feed.filter(f => !f.outcome && f.sl != null && f.tp != null);
  const liveWins = closed.filter(f => f.outcome === 'WIN').length;
  const liveWr = closed.length ? Math.round(liveWins / closed.length * 100) : null;
  const liveR  = +[...closed, ...expired].reduce((s, f) => s + (f.rMult ?? 0), 0).toFixed(1);

  const StatCell = ({ s }) => s?.n ? (
    <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
      <span style={{ color: '#e5e7eb' }}>{s.n}t</span>{' '}
      <span style={{ color: (s.wr ?? 0) >= 50 ? '#10b981' : '#f59e0b' }}>{s.wr != null ? `${s.wr}%` : '—'}</span>{' '}
      <span style={{ color: s.totalR >= 0 ? '#10b981' : '#ef4444' }}>{s.totalR >= 0 ? '+' : ''}{s.totalR}R</span>
    </span>
  ) : <span style={{ fontSize: 10, color: '#374151' }}>—</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Performance & Backtest</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Historical simulation of the 15m, confluence, and daily swing engines + live signal track record</div>
        </div>
        <button onClick={run} disabled={running} style={{
          background: running ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '6px 12px',
          color: running ? '#4b5563' : '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: running ? 'default' : 'pointer',
        }}>{running ? 'Running…' : bt ? '↻ Re-run backtest' : '▶ Run backtest'}</button>
      </div>

      {running && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 11, color: '#a5b4fc', fontFamily: 'monospace' }}>
          {prog || 'Starting…'} <span style={{ color: '#4b5563' }}>— simulating 15m, confluence, and 5yr daily swing across all pairs, split in/out of sample</span>
        </div>
      )}
      {!running && prog && <div style={{ fontSize: 10, color: '#ef4444' }}>{prog}</div>}

      {/* Live track record */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>LIVE TRACK RECORD — ALERTED SIGNALS, SCORED AGAINST REAL PRICES</div>
        <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[
            ['CLOSED', String(closed.length), '#e5e7eb'],
            ['WIN RATE', liveWr != null ? `${liveWr}%` : '—', liveWr != null ? (liveWr >= 50 ? '#10b981' : '#f59e0b') : '#374151'],
            ['NET R', `${liveR >= 0 ? '+' : ''}${liveR}R`, liveR >= 0 ? '#10b981' : '#ef4444'],
            ['OPEN', String(openSig.length), '#a5b4fc'],
            ['EXPIRED', String(expired.length), '#6b7280'],
          ].map(([l, v, c]) => (
            <div key={l}>
              <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em' }}>{l}</div>
              <div style={{ fontSize: 16, fontFamily: "'Space Mono', monospace", fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {closed.length === 0 && (
          <div style={{ fontSize: 10, color: '#4b5563' }}>
            No closed signals yet — outcomes are recorded automatically as alerted trades hit their TP or SL. Keep the app open and the record builds itself.
          </div>
        )}
        {openSig.slice(0, 6).map(f => (
          <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, fontFamily: 'monospace', padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ color: '#a5b4fc', fontWeight: 800, fontSize: 8 }}>{f.source}</span>
            <span style={{ color: '#f9fafb', fontWeight: 800 }}>{f.name}</span>
            <span style={{ color: f.dir === 'long' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{f.dir === 'long' ? '▲' : '▼'} {f.type}</span>
            <span style={{ color: '#6b7280' }}>entry {f.price?.toFixed(f.price >= 100 ? 2 : 4)} · SL {f.sl?.toFixed(f.sl >= 100 ? 2 : 4)} · TP {f.tp?.toFixed(f.tp >= 100 ? 2 : 4)}</span>
            <span style={{ marginLeft: 'auto', color: '#4b5563' }}>OPEN</span>
          </div>
        ))}
      </div>

      {/* Backtest results */}
      {bt && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 800, letterSpacing: '0.1em' }}>
            BACKTEST — {bt.window} · ran {new Date(bt.generatedAt).toLocaleString()}
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {[
              ['TRADES', String(bt.total.n), '#e5e7eb'],
              ['WIN RATE', bt.total.wr != null ? `${bt.total.wr}%` : '—', (bt.total.wr ?? 0) >= 50 ? '#10b981' : '#f59e0b'],
              ['NET R', `${bt.total.totalR >= 0 ? '+' : ''}${bt.total.totalR}R`, bt.total.totalR >= 0 ? '#10b981' : '#ef4444'],
              ['EXPECTANCY', bt.total.expectancy != null ? `${bt.total.expectancy}R/trade` : '—', (bt.total.expectancy ?? 0) >= 0 ? '#10b981' : '#ef4444'],
              ['PROFIT FACTOR', bt.total.pf != null ? String(bt.total.pf) : '—', (bt.total.pf ?? 0) >= 1 ? '#10b981' : '#ef4444'],
            ].map(([l, v, c]) => (
              <div key={l}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em' }}>{l}</div>
                <div style={{ fontSize: 16, fontFamily: "'Space Mono', monospace", fontWeight: 800, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
            {[['INTRADAY (15m)', bt.intraTotal], ['A+ ONLY (conf ≥70)', bt.aplus]].map(([l, s]) => (
              <div key={l} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 3 }}>{l}</div>
                <StatCell s={s} />
                <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>{s.n ? `PF ${s.pf ?? '—'} · ${s.expectancy ?? '—'}R/trade` : 'no trades'}</div>
              </div>
            ))}
          </div>

          {/* Out-of-sample validation — the honest numbers that gate live alerts */}
          {bt.edge && bt.edgeOOS && (() => {
            const strategies = [
              ['15M INTRADAY (edge-filtered)', bt.edge, bt.edgeOOS, 'INTRADAY alerts', 15],
              ...(bt.conf ? [['★ CONFLUENCE (3+/4 engines agree)', bt.conf, bt.confOOS, 'CONFLUENCE alerts', 15]] : []),
              ...(bt.swingEdge ? [['📈 DAILY SWING (held ~days-weeks, 5yr sample)', bt.swingEdge, bt.swingEdgeOOS, 'ICT (daily) alerts', 8]] : []),
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em' }}>OUT-OF-SAMPLE VALIDATION — WHAT SURVIVES ON DATA THE FILTER NEVER SAW GATES LIVE ALERTS</div>
                {strategies.map(([label, is, oos, gates, minN]) => {
                  const held = (oos?.n ?? 0) < minN ? null : ((is?.expectancy ?? 0) > 0 && (oos.expectancy ?? 0) > 0);
                  return (
                    <div key={label} style={{ padding: '10px 12px', borderRadius: 9, background: held === false ? 'rgba(239,68,68,0.05)' : held === true ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${held === false ? 'rgba(239,68,68,0.25)' : held === true ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#e5e7eb' }}>{label}</span>
                        <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 7px', borderRadius: 3, color: held === true ? '#10b981' : held === false ? '#ef4444' : '#6b7280', background: held === true ? 'rgba(16,185,129,0.14)' : held === false ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.05)' }}>
                          {held === true ? '✓ EDGE HELD — alerts on' : held === false ? `✗ FAILED — ${gates} muted` : '? SAMPLE TOO SMALL'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 8, color: '#a5b4fc', fontWeight: 800 }}>IN-SAMPLE (tunes the filter)</div>
                          <StatCell s={is} />
                          <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>{is?.n ? `PF ${is.pf ?? '—'} · ${is.expectancy ?? '—'}R/trade` : 'no trades'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 8, color: '#fbbf24', fontWeight: 800 }}>OUT-OF-SAMPLE (never seen)</div>
                          <StatCell s={oos} />
                          <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>{oos?.n ? `PF ${oos.pf ?? '—'} · ${oos.expectancy ?? '—'}R/trade` : 'no trades'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Regime hypothesis check — do trend-setups-in-trends / reversal-
              setups-in-ranges actually outperform mismatched trades? */}
          {bt.regimeMatched && (() => {
            const helps = bt.validation?.regimeHelps;
            return (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: helps === true ? 'rgba(16,185,129,0.05)' : helps === false ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${helps === true ? 'rgba(16,185,129,0.25)' : helps === false ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: '#e5e7eb' }}>REGIME HYPOTHESIS — reversal setups in ranges, trend setups in trends</span>
                  <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 7px', borderRadius: 3, color: helps === true ? '#10b981' : helps === false ? '#ef4444' : '#6b7280', background: helps === true ? 'rgba(16,185,129,0.14)' : helps === false ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.05)' }}>
                    {helps === true ? '✓ CONFIRMED — gating live' : helps === false ? '✗ NOT CONFIRMED — tag only' : '? SAMPLE TOO SMALL'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 8, color: '#10b981', fontWeight: 800 }}>REGIME-MATCHED</div>
                    <StatCell s={bt.regimeMatched} />
                    <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>{bt.regimeMatched.n ? `${bt.regimeMatched.expectancy ?? '—'}R/trade` : 'no trades'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: '#ef4444', fontWeight: 800 }}>MISMATCHED</div>
                    <StatCell s={bt.regimeMismatched} />
                    <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>{bt.regimeMismatched?.n ? `${bt.regimeMismatched.expectancy ?? '—'}R/trade` : 'no trades'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 8, color: '#374151', marginTop: 5 }}>
                  In-sample only. Only blocks live signals once matched-regime trades demonstrably beat mismatched ones with enough samples — until then every signal still carries its regime/volatility tag for your own read.
                </div>
              </div>
            );
          })()}

          {/* Per-setup */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 4 }}>
              <span>SETUP</span><span>IN-SAMPLE</span><span>OUT-OF-SAMPLE</span>
            </div>
            {bt.setups.map(s => {
              const oos = (bt.setupsOOS || []).find(x => x.setup === s.setup);
              return (
                <div key={s.setup} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 10, fontFamily: 'monospace', padding: '2px 0', alignItems: 'center' }}>
                  <span style={{ color: '#9ca3af', fontWeight: 700 }}>{s.setup}</span>
                  <StatCell s={s} />
                  <StatCell s={oos} />
                </div>
              );
            })}
          </div>

          {/* Setup Rankings — every pair+setup combo (15m + daily swing) sorted
              by in-sample expectancy, bottom 20% flagged as weekly-review cut
              candidates, matching the "cut the worst 20% of setups" review habit */}
          {(() => {
            const combos = [
              ...Object.entries(bt.pairSetups || {}).map(([k, v]) => ({ combo: k, tf: '15m', ...v })),
              ...Object.entries(bt.swingPairSetups || {}).map(([k, v]) => ({ combo: k, tf: 'daily', ...v })),
            ].filter(c => c.n >= 5).sort((a, b) => (b.expectancy ?? -99) - (a.expectancy ?? -99));
            if (!combos.length) return null;
            const cutoff = Math.max(1, Math.ceil(combos.length * 0.2));
            return (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 5 }}>SETUP RANKINGS — PAIR × SETUP, BY EXPECTANCY (n≥5) · BOTTOM 20% = WEEKLY CUT CANDIDATES</div>
                {combos.map((c, i) => {
                  const isBottom = i >= combos.length - cutoff;
                  return (
                    <div key={c.combo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, fontFamily: 'monospace', padding: '2px 4px', borderRadius: 3, background: isBottom ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                      <span style={{ color: isBottom ? '#fca5a5' : '#9ca3af', fontWeight: 700 }}>
                        {isBottom && '✂ '}{c.combo} <span style={{ color: '#4b5563' }}>[{c.tf}]</span>
                      </span>
                      <span style={{ color: '#e5e7eb' }}>{c.n}t <span style={{ color: (c.wr ?? 0) >= 50 ? '#10b981' : '#f59e0b' }}>{c.wr}%</span> <span style={{ color: (c.expectancy ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>{(c.expectancy ?? 0) >= 0 ? '+' : ''}{c.expectancy}R</span></span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Per-pair */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 4 }}>
              <span>PAIR</span><span>IN-SAMPLE</span><span>OUT-OF-SAMPLE</span>
            </div>
            {bt.rows.map(r => {
              const oosRow = (bt.rowsOOS || []).find(x => x.pair === r.pair);
              return (
                <div key={r.pair} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '2px 0', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#e5e7eb' }}>{r.pair}</span>
                  <StatCell s={r.intra} />
                  <StatCell s={oosRow?.intra} />
                </div>
              );
            })}
          </div>
          {bt.swingRows?.length > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 4 }}>
                <span>PAIR — DAILY SWING</span><span>IN-SAMPLE</span><span>OUT-OF-SAMPLE</span>
              </div>
              {bt.swingRows.map(r => {
                const oosRow = (bt.swingRowsOOS || []).find(x => x.pair === r.pair);
                return (
                  <div key={r.pair} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '2px 0', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#e5e7eb' }}>{r.pair}</span>
                    <StatCell s={r.swing} />
                    <StatCell s={oosRow?.swing} />
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#374151' }}>
            Method: walk-forward (no lookahead), entries at bar close. Management: bank half at TP1 (+0.5R), stop to breakeven, run the rest to TP2 — a trade counts as a WIN once TP1 is banked (worst case +0.25R). SL/BE checked before targets on bars touching both (conservative), timeouts marked to market. Data is split chronologically {Math.round(OOS_SPLIT * 100)}/{Math.round((1 - OOS_SPLIT) * 100)} — the edge filter that gates live alerts is derived ONLY from the in-sample slice; the out-of-sample slice is held out and never informs the filter, so its numbers are the honest test of whether the edge is real. Daily swing uses 5 years of daily bars (held ~days to a month per trade) instead of the 15m window, for a much larger and less noisy sample. Excludes spread/slippage. Past performance does not guarantee future results.
          </div>
        </div>
      )}

      {!bt && !running && (
        <div style={{ padding: 20, textAlign: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>No backtest yet</div>
          <div style={{ fontSize: 10, color: '#374151' }}>Run the simulation to see win rate, expectancy, and profit factor per pair, per timeframe, and per setup</div>
        </div>
      )}
    </div>
  );
}

// ─── Order Book ─────────────────────────────────────────────────────────────

const OB_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX', 'LINK', 'SUI', 'HYPE', 'ARB'];
const obFmtSz  = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n >= 1 ? n.toFixed(2) : n.toFixed(4);
const obFmtUsd = n => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

function OrderBookPanel() {
  const [coin, setCoin] = useState('BTC');
  const [book, setBook] = useState(null);
  const [err, setErr]   = useState('');
  const inflight = useRef(false);

  const load = useCallback(async (c) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const d = await fetch(`/api/orderbook?coin=${encodeURIComponent(c)}`).then(r => r.json());
      if (d.error) setErr(d.error); else { setErr(''); setBook(d); }
    } catch (e) { setErr(e.message); }
    inflight.current = false;
  }, []);

  useEffect(() => {
    setBook(null);
    load(coin);
    const t = setInterval(() => load(coin), 1000);
    return () => clearInterval(t);
  }, [coin, load]);

  const fmtPx = p => p == null ? '—' : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : p >= 1 ? p.toFixed(3) : p.toFixed(5);

  // Ladder rows are scaled against the single largest resting size on either
  // side, so bid and ask depth bars stay directly comparable
  const maxSz = book ? Math.max(...book.bids.map(b => b.sz), ...book.asks.map(a => a.sz), 1) : 1;
  const imb = book?.imbalance ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Order Book</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Live L2 depth from Hyperliquid · updates every second</div>
        </div>
        {book && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 15, fontFamily: "'Space Mono', monospace", fontWeight: 800, color: '#f9fafb' }}>{fmtPx(book.mid)}</span>
            <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>spread {book.spreadBps.toFixed(2)}bps</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {OB_COINS.map(c => (
          <button key={c} onClick={() => setCoin(c)} style={{
            padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer',
            background: coin === c ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
            color: coin === c ? '#a5b4fc' : '#4b5563',
          }}>{c}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 10, color: '#fca5a5', padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{err}</div>}
      {!book && !err && <div style={{ fontSize: 11, color: '#4b5563', padding: 16, textAlign: 'center' }}>Loading book…</div>}

      {book && (
        <>
          {/* Depth imbalance */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', marginBottom: 5 }}>
              <span style={{ color: '#10b981' }}>BIDS {obFmtUsd(book.bidNotional)}</span>
              <span style={{ color: '#4b5563' }}>DEPTH IMBALANCE {imb >= 0 ? '+' : ''}{imb.toFixed(1)}%</span>
              <span style={{ color: '#ef4444' }}>{obFmtUsd(book.askNotional)} ASKS</span>
            </div>
            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ width: `${50 + imb / 2}%`, background: '#10b981' }} />
              <div style={{ width: `${50 - imb / 2}%`, background: '#ef4444' }} />
            </div>
            <div style={{ fontSize: 8, color: '#374151', marginTop: 4 }}>
              {Math.abs(imb) < 10 ? 'Balanced book — no resting-size edge either way'
                : imb > 0 ? 'More size resting on the bid — sellers must absorb it to push price down'
                : 'More size resting on the offer — buyers must absorb it to push price up'}
            </div>
          </div>

          {/* Ladder */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[['BIDS', book.bids, '#10b981', true], ['ASKS', book.asks, '#ef4444', false]].map(([label, rows, col, isBid]) => (
              <div key={label} style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.5fr', fontSize: 7.5, color: '#4b5563', fontWeight: 800, letterSpacing: '0.06em', marginBottom: 3 }}>
                  <span>{label}</span><span style={{ textAlign: 'right' }}>SIZE</span><span style={{ textAlign: 'right' }}>ORD</span>
                </div>
                {rows.slice(0, 14).map((l, i) => (
                  <div key={i} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.5fr', fontSize: 9, fontFamily: 'monospace', padding: '1.5px 0' }}>
                    {/* depth bar behind the row, anchored to the price side */}
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, [isBid ? 'left' : 'right']: 0,
                      width: `${(l.sz / maxSz) * 100}%`, background: col, opacity: 0.14, borderRadius: 2,
                    }} />
                    <span style={{ color: col, fontWeight: 700, zIndex: 1 }}>{fmtPx(l.px)}</span>
                    <span style={{ color: '#9ca3af', textAlign: 'right', zIndex: 1 }}>{obFmtSz(l.sz)}</span>
                    <span style={{ color: '#4b5563', textAlign: 'right', zIndex: 1 }}>{l.orders}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Walls */}
          {(book.bidWalls.length > 0 || book.askWalls.length > 0) && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 5 }}>
                WALLS — SINGLE LEVELS HOLDING 12%+ OF THEIR SIDE'S DEPTH
              </div>
              {[...book.bidWalls.map(w => ({ ...w, side: 'BID' })), ...book.askWalls.map(w => ({ ...w, side: 'ASK' }))]
                .sort((a, b) => b.sz - a.sz).map((w, i) => {
                  const c = w.side === 'BID' ? '#10b981' : '#ef4444';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontFamily: 'monospace', padding: '1px 0' }}>
                      <span style={{ color: c, fontWeight: 800 }}>{w.side} {fmtPx(w.px)}<span style={{ color: '#4b5563', fontWeight: 600 }}> · {w.distPct >= 0 ? '+' : ''}{w.distPct.toFixed(2)}%</span></span>
                      <span style={{ color: '#9ca3af' }}>{obFmtSz(w.sz)} · {obFmtUsd(w.notional)} · {w.share.toFixed(0)}%</span>
                    </div>
                  );
                })}
            </div>
          )}

          <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>
            Real Level-2 depth, not a proxy. Crypto perps are the one asset class here where a live book is obtainable without a paid feed — equity depth needs a Level 2 subscription and FX has no central book at all, which is why this tab is perps-only. Resting orders can be pulled at any moment, so treat walls as intent, not commitment.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Options Flow ───────────────────────────────────────────────────────────

const OF_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN'];

function OptionsFlowPanel() {
  const [symbol, setSymbol] = useState('SPY');
  const [data, setData] = useState(null);
  const [view, setView] = useState('unusual');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (s) => {
    setLoading(true); setErr('');
    try {
      const d = await fetch(`/api/optionsflow?symbol=${encodeURIComponent(s)}`).then(r => r.json());
      if (d.error) setErr(d.error); else setData(d);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(symbol);
    const t = setInterval(() => load(symbol), 60000);
    return () => clearInterval(t);
  }, [symbol, load]);

  const t = data?.totals;
  const rows = view === 'unusual' ? (data?.unusual || []) : (data?.flows || []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Options Flow</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Volume vs open interest — where today's contracts are NEW positioning</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data?.spot && <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: '#e5e7eb' }}>${data.spot.toFixed(2)}</span>}
          <button onClick={() => load(symbol)} disabled={loading} style={{
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6,
            padding: '4px 10px', color: loading ? '#4b5563' : '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {OF_SYMBOLS.map(s => (
          <button key={s} onClick={() => setSymbol(s)} style={{
            padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer',
            background: symbol === s ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
            color: symbol === s ? '#a5b4fc' : '#4b5563',
          }}>{s}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 10, color: '#fca5a5', padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{err}</div>}

      {t && (
        <>
          {/* Premium split — the directional read that contract counts miss */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>PREMIUM COMMITTED TODAY</div>
            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ width: `${t.callPremiumShare ?? 50}%`, background: '#10b981' }} />
              <div style={{ width: `${100 - (t.callPremiumShare ?? 50)}%`, background: '#ef4444' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace' }}>
              <span style={{ color: '#6ee7b7' }}>CALLS {obFmtUsd(t.callNotional)} · {t.callPremiumShare}%</span>
              <span style={{ color: '#fca5a5' }}>PUTS {obFmtUsd(t.putNotional)}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280', flexWrap: 'wrap' }}>
              <span>P/C volume <span style={{ color: (t.pcVolume ?? 1) > 1 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{t.pcVolume ?? '—'}</span></span>
              <span>P/C OI <span style={{ color: (t.pcOI ?? 1) > 1 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{t.pcOI ?? '—'}</span></span>
              <span>{data.contractsScanned} contracts</span>
            </div>
            {/* Puts leading by contract count while calls lead by dollars (or the
                reverse) means the size is not where the count says it is */}
            {t.pcVolume != null && t.callPremiumShare != null && (t.pcVolume > 1) === (t.callPremiumShare > 50) && (
              <div style={{ fontSize: 8, color: '#fbbf24', marginTop: 4 }}>
                Contract count and premium disagree — more {t.pcVolume > 1 ? 'puts' : 'calls'} by count but more {t.callPremiumShare > 50 ? 'call' : 'put'} dollars. Size sits on the smaller count.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {[['unusual', `★ Unusual (${data.unusual.length})`], ['all', `Top by premium (${data.flows.length})`]].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 9, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: view === k ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                color: view === k ? '#a5b4fc' : '#4b5563',
              }}>{label}</button>
            ))}
          </div>

          <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.7fr 0.8fr 0.6fr 0.8fr', fontSize: 7.5, color: '#4b5563', fontWeight: 800, letterSpacing: '0.05em', marginBottom: 4 }}>
              <span>TYPE</span><span>STRIKE</span><span>EXP</span><span style={{ textAlign: 'right' }}>VOL</span><span style={{ textAlign: 'right' }}>V/OI</span><span style={{ textAlign: 'right' }}>PREMIUM</span>
            </div>
            {rows.length === 0 && <div style={{ fontSize: 9, color: '#374151', padding: '6px 0' }}>No contracts match</div>}
            {rows.slice(0, 22).map((f, i) => {
              const c = f.type === 'CALL' ? '#10b981' : '#ef4444';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.7fr 0.8fr 0.6fr 0.8fr', fontSize: 9, fontFamily: 'monospace', padding: '2px 0', alignItems: 'center', borderTop: i ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <span style={{ color: c, fontWeight: 800 }}>{f.type}</span>
                  <span style={{ color: '#e5e7eb' }}>{f.strike}{f.moneyness != null && <span style={{ color: '#4b5563', fontSize: 7.5 }}> {f.moneyness >= 0 ? '+' : ''}{f.moneyness.toFixed(1)}%</span>}</span>
                  <span style={{ color: '#6b7280' }}>{f.expiry}</span>
                  <span style={{ color: '#9ca3af', textAlign: 'right' }}>{f.volume.toLocaleString()}</span>
                  <span style={{ color: f.newPositioning ? '#fbbf24' : '#4b5563', textAlign: 'right', fontWeight: f.newPositioning ? 800 : 400 }}>{f.volOI == null ? '∞' : f.volOI}</span>
                  <span style={{ color: '#c4b5fd', textAlign: 'right', fontWeight: 700 }}>{obFmtUsd(f.notional)}</span>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>
            Volume above open interest (V/OI ≥ 1, highlighted) means today's trading exceeds every contract already outstanding — the activity is new positioning, not inventory being shuffled. Honest scope: this is a chain snapshot, not the options tape. Classifying each print as a sweep or block, or as hitting the bid vs the ask, needs a paid OPRA feed — so direction here is inferred from strike and type, not from an aggressor flag.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Independent GEX ────────────────────────────────────────────────────────

function GexIndependentPanel() {
  const [symbol, setSymbol] = useState('SPY');
  const [yh, setYh] = useState(null);   // Yahoo-derived
  const [nq, setNq] = useState(null);   // NASDAQ-derived (existing engine)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (s) => {
    setLoading(true); setErr('');
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/gex2?symbol=${encodeURIComponent(s)}&expiries=4`).then(r => r.json()).catch(() => null),
        fetch(`/api/gamma?symbol=${encodeURIComponent(s)}`).then(r => r.json()).catch(() => null),
      ]);
      if (a?.error && b?.error) setErr(a.error);
      setYh(a?.error ? null : a);
      setNq(b?.error ? null : b);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  const fmtB = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${(n / 1e9).toFixed(2)}B`;
  const fmtL = v => v == null ? '—' : Number(v).toFixed(2);

  // Two independent estimates only mean something when compared. Agreement
  // within ~0.5% of spot is treated as confirming the level.
  const spot = yh?.spot || nq?.spot;
  const agree = (a, b) => {
    if (a == null || b == null || !spot) return null;
    return Math.abs(a - b) / spot <= 0.005;
  };

  const levels = [
    ['Gamma wall', yh?.gammaWall, nq?.gammaWall],
    ['Call wall',  yh?.callWall,  nq?.callWall],
    ['Put wall',   yh?.putWall,   nq?.putWall],
    ['Gamma flip', yh?.flipLevel, nq?.flipLevel],
  ];
  const confirmed = levels.filter(([, a, b]) => agree(a, b) === true).length;
  const comparable = levels.filter(([, a, b]) => agree(a, b) !== null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f9fafb' }}>Independent GEX</div>
          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Yahoo chain vs NASDAQ chain — two separate sources, same gamma math</div>
        </div>
        <button onClick={() => load(symbol)} disabled={loading} style={{
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6,
          padding: '4px 10px', color: loading ? '#4b5563' : '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
        }}>{loading ? '…' : '↻'}</button>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {OF_SYMBOLS.map(s => (
          <button key={s} onClick={() => setSymbol(s)} style={{
            padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer',
            background: symbol === s ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
            color: symbol === s ? '#a5b4fc' : '#4b5563',
          }}>{s}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 10, color: '#fca5a5', padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{err}</div>}
      {loading && !yh && !nq && <div style={{ fontSize: 11, color: '#4b5563', padding: 16, textAlign: 'center' }}>Pulling both chains…</div>}

      {(yh || nq) && (
        <>
          {/* Cross-source verdict */}
          {comparable > 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 9,
              background: confirmed === comparable ? 'rgba(16,185,129,0.05)' : confirmed === 0 ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
              border: `1px solid ${confirmed === comparable ? 'rgba(16,185,129,0.25)' : confirmed === 0 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: confirmed === comparable ? '#6ee7b7' : confirmed === 0 ? '#fca5a5' : '#fbbf24' }}>
                {confirmed}/{comparable} LEVELS CONFIRMED BY BOTH SOURCES
              </div>
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>
                {confirmed === comparable ? 'Both chains independently land on the same levels — the strongest read you can get from this data.'
                  : confirmed === 0 ? 'The two sources disagree on every level. Treat all of them as soft until they converge.'
                  : 'Partial agreement. Lean on the confirmed levels; treat the rest as provisional.'}
              </div>
            </div>
          )}

          {/* Side-by-side levels */}
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 0.9fr 0.5fr', fontSize: 7.5, color: '#4b5563', fontWeight: 800, letterSpacing: '0.05em', marginBottom: 4 }}>
              <span>LEVEL</span><span style={{ textAlign: 'right' }}>YAHOO</span><span style={{ textAlign: 'right' }}>NASDAQ</span><span style={{ textAlign: 'right' }}>AGREE</span>
            </div>
            {levels.map(([name, a, b], i) => {
              const ok = agree(a, b);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 0.9fr 0.5fr', fontSize: 9.5, fontFamily: 'monospace', padding: '2px 0', alignItems: 'center' }}>
                  <span style={{ color: '#9ca3af', fontWeight: 700 }}>{name}</span>
                  <span style={{ color: '#c4b5fd', textAlign: 'right' }}>{fmtL(a)}</span>
                  <span style={{ color: '#93c5fd', textAlign: 'right' }}>{fmtL(b)}</span>
                  <span style={{ textAlign: 'right', color: ok == null ? '#374151' : ok ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                    {ok == null ? '—' : ok ? '✓' : '✗'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Source detail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[['YAHOO CHAIN', yh, '#c4b5fd', 'per-contract IV'], ['NASDAQ CHAIN', nq, '#93c5fd', 'historical-vol sigma']].map(([label, d, col, note]) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: col, fontWeight: 800, letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                {d ? (
                  <>
                    <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 800, color: (d.netGex ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>{fmtB(d.netGex)}</div>
                    <div style={{ fontSize: 8, color: '#4b5563', marginTop: 2 }}>net GEX · {note}</div>
                    <div style={{ fontSize: 8, color: '#374151', marginTop: 2 }}>
                      {d.contracts ? `${d.contracts} contracts` : ''}{d.expiriesUsed ? ` · ${d.expiriesUsed} expiries` : ''}
                      {d.impliedVol ? ` · IV ${d.impliedVol}%` : ''}
                    </div>
                  </>
                ) : <div style={{ fontSize: 9, color: '#374151' }}>unavailable</div>}
              </div>
            ))}
          </div>

          {/* Regime agreement */}
          {yh && nq && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 8, color: '#4b5563', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 4 }}>GAMMA REGIME</div>
              {(() => {
                const sy = Math.sign(yh.netGex || 0), sn = Math.sign(nq.netGex || 0);
                const same = sy === sn && sy !== 0;
                const txt = sy > 0 ? 'POSITIVE — dealers dampen moves' : 'NEGATIVE — dealers amplify moves';
                return (
                  <div style={{ fontSize: 10, fontWeight: 800, color: !same ? '#fbbf24' : sy > 0 ? '#10b981' : '#ef4444' }}>
                    {same ? `Both sources agree: ${txt}`
                      : `Sources disagree on sign — Yahoo ${fmtB(yh.netGex)}, NASDAQ ${fmtB(nq.netGex)}. Net GEX is near zero, so the regime call is unreliable right now.`}
                  </div>
                );
              })()}
            </div>
          )}

          <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>
            Both estimates use identical Black-Scholes gamma math, so any divergence comes from the option data itself, not the model. Yahoo supplies per-contract implied volatility — each strike prices with its own IV, which handles skew better than applying one historical-vol estimate across the chain. Neither is a paid dealer-positioning feed: open interest shows contracts outstanding, not which side dealers hold, so the long/short-gamma read is the standard assumption that dealers are short customer options, not observed fact.
          </div>
        </>
      )}
    </div>
  );
}

const TABS = ["Signals", "Confluence", "ICT", "ORB", "SMC", "Order Book", "Options Flow", "GEX", "Dark Pool", "Stats", "News", "Journal", "Portfolio", "Alerts", "Gamma", "Perps", "Account"];

export default function App() {
  const isMobile = useIsMobile();
  const { isSignedIn, user, getToken, clerkAvailable } = useContext(AuthContext);

  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fe_watchlist")) || DEFAULT_WATCHLIST; }
    catch { return DEFAULT_WATCHLIST; }
  });
  const [addInput, setAddInput] = useState("");
  const [stocks, setStocks] = useState([]);
  const priceHistoryRef = useRef({});
  const fetchStocksInflightRef = useRef(false);
  const firstLoadRef = useRef(true);
  const lastHistPushRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [tab, setTab] = useState("Watch");
  const [chartSymbol, setChartSymbol] = useState(null);
  const [tradeTarget, setTradeTarget] = useState(null);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [marketContext, setMarketContext] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [forexData, setForexData] = useState([]);
  const [watchlistSort, setWatchlistSort] = useState('default');
  const [watchlistView, setWatchlistView] = useState('cards');
  const [watchlistFilter, setWatchlistFilter] = useState('all');
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
            // Persist new/flipped edge signals to history before updating ref
            if (scored.hasEdge) {
              const prev = scanResultsRef.current[sym];
              if (!prev?.hasEdge || prev.showLong !== scored.showLong) {
                try {
                  const hist = JSON.parse(localStorage.getItem('fe_signal_history') || '[]');
                  hist.unshift({ id: now + i, symbol: sym, direction: scored.showLong ? 'long' : 'short', setupProb: scored.setupProb, entry: scored.spot, tp: scored.activeTP, sl: scored.activeSL, rr: scored.rrCheck, firedAt: now });
                  if (hist.length > 50) hist.pop();
                  localStorage.setItem('fe_signal_history', JSON.stringify(hist));
                } catch {}
              }
            }
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
    if (fetchStocksInflightRef.current) return; // 1s loop — never stack requests
    fetchStocksInflightRef.current = true;
    if (firstLoadRef.current) setLoading(true); // only flash LOADING on the very first fetch
    setError("");
    try {
      const res = await fetch(`/api/quotes?symbols=${watchlist.join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const results = data?.quoteResponse?.result || [];
      if (!results.length) throw new Error("No data returned");
      // Sparklines sample once a minute so they keep showing ~30 min of history,
      // even though prices themselves now update every second
      const pushHist = Date.now() - lastHistPushRef.current >= 60000;
      if (pushHist) lastHistPushRef.current = Date.now();
      const withHistory = results.map(q => {
        const h = priceHistoryRef.current[q.symbol] ? [...priceHistoryRef.current[q.symbol]] : [];
        if (q.regularMarketPrice && (pushHist || !h.length)) h.push(q.regularMarketPrice);
        if (h.length > 30) h.shift();
        priceHistoryRef.current[q.symbol] = h;
        return { ...q, priceHistory: h };
      });
      setStocks(withHistory);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      firstLoadRef.current = false;
      fetchStocksInflightRef.current = false;
      setLoading(false);
    }
  }, [watchlist]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  // Market context (SPY/QQQ/IWM/VIX) — fetched separately, auto-refresh
  const fetchMarketContext = useCallback(async () => {
    try {
      const [ctxRes, secRes, fxRes] = await Promise.all([
        fetch('/api/quotes?symbols=SPY,QQQ,IWM,%5EVIX,BZ%3DF,CL%3DF,BTC-USD,%5ETNX,EURUSD%3DX,GBPUSD%3DX,USDJPY%3DX'),
        fetch('/api/quotes?symbols=XLK,XLF,XLV,XLC,XLY,XLP,XLE,XLI,XLB,XLRE,XLU'),
        fetch('/api/quotes?symbols=EURUSD%3DX,GBPUSD%3DX,USDJPY%3DX,AUDUSD%3DX,NZDUSD%3DX,GBPJPY%3DX,GC%3DF,SI%3DF'),
      ]);
      const [ctxData, secData, fxData] = await Promise.all([ctxRes.json(), secRes.json(), fxRes.json()]);
      setMarketContext(ctxData?.quoteResponse?.result || []);
      setSectorData(secData?.quoteResponse?.result || []);
      setForexData(fxData?.quoteResponse?.result || []);
    } catch {}
  }, []);

  // Live 1s price map for the ICT/Scalp/Metals tabs — overrides the slower
  // candle-derived prices (the OHLCV edge cache is 30-300s)
  const livePrices = useMemo(() => {
    const map = {};
    forexData.forEach(d => {
      if (d?.regularMarketPrice == null) return;
      const key = d.symbol === 'GC=F' ? 'XAUUSD' : d.symbol === 'SI=F' ? 'XAGUSD' : d.symbol;
      map[key] = d.regularMarketPrice;
    });
    return map;
  }, [forexData]);
  const livePricesRef = useRef({});
  useEffect(() => { livePricesRef.current = livePrices; }, [livePrices]);

  // Signal outcome tracker — every alerted signal is scored against live prices:
  // WIN when TP is reached, LOSS when SL is hit, EXPIRED (marked-to-market in R)
  // past its holding window. This builds the verifiable live track record.
  useEffect(() => {
    const MAX_AGE = { SCALP: 12 * 3600e3, INTRADAY: 48 * 3600e3, ORB: 12 * 3600e3, SMC: 48 * 3600e3, CONFLUENCE: 48 * 3600e3, ICT: 14 * 86400e3, FOREX: 14 * 86400e3 };
    const t = setInterval(() => {
      try {
        const log = JSON.parse(localStorage.getItem('fe_signal_alerts') || '[]');
        let changed = false;
        log.forEach(e => {
          if (e.outcome || e.sl == null || e.tp == null || e.price == null) return;
          const px = livePricesRef.current[e.symbol];
          if (px == null) return;
          const long = e.dir === 'long';
          const risk = Math.abs(e.price - e.sl);
          if (!(risk > 0)) return;
          const rr  = Math.abs(e.tp - e.price) / risk;
          const tp1 = long ? e.price + risk * ICT_TP1_R : e.price - risk * ICT_TP1_R;
          const expired = Date.now() - e.time > (MAX_AGE[e.source] || 48 * 3600e3);
          if (!e.t1Hit) {
            // Phase 1: full position, stop at SL, first target TP1
            if (long ? px <= e.sl : px >= e.sl) {
              e.outcome = 'LOSS'; e.rMult = -1; e.closedAt = Date.now(); changed = true;
            } else if (long ? px >= tp1 : px <= tp1) {
              e.t1Hit = true; changed = true; // half banked, stop to breakeven
            } else if (expired) {
              e.outcome = 'EXPIRED'; e.rMult = +(((long ? px - e.price : e.price - px)) / risk).toFixed(1); e.closedAt = Date.now(); changed = true;
            }
          } else {
            // Phase 2: runner with breakeven stop — every exit banks profit
            if (long ? px <= e.price : px >= e.price) {
              e.outcome = 'WIN'; e.rMult = +(0.5 * ICT_TP1_R).toFixed(2); e.closedAt = Date.now(); changed = true;
            } else if (long ? px >= e.tp : px <= e.tp) {
              e.outcome = 'WIN'; e.rMult = +(0.5 * ICT_TP1_R + 0.5 * rr).toFixed(1); e.closedAt = Date.now(); changed = true;
            } else if (expired) {
              e.outcome = 'WIN'; e.rMult = +(0.5 * ICT_TP1_R + 0.5 * ((long ? px - e.price : e.price - px) / risk)).toFixed(1); e.closedAt = Date.now(); changed = true;
            }
          }
        });
        if (changed) localStorage.setItem('fe_signal_alerts', JSON.stringify(log));
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { fetchMarketContext(); }, [fetchMarketContext]);
  useEffect(() => {
    const t = setInterval(fetchMarketContext, 1000);
    return () => clearInterval(t);
  }, [fetchMarketContext]);

  // Forex signal auto-alerts — fires on new/changed signals no matter which tab is open
  const fxAlertRef = useRef({});
  useEffect(() => {
    if (!forexData.length) return;
    forexData.forEach(d => {
      const sig = scoreForexSignal(d);
      if (!sig) return;
      const key = `${sig.dir}|${sig.type}`;
      const prev = fxAlertRef.current[d.symbol];
      if (prev === key) return;
      fxAlertRef.current[d.symbol] = key;
      if (!isHighQualitySignal('FOREX', sig.conf, sig.rr, sig.name, sig.type)) return;
      const trackSym = d.symbol === 'GC=F' ? 'XAUUSD' : d.symbol === 'SI=F' ? 'XAGUSD' : d.symbol;
      const isNew = logSignalAlert({ source: 'FOREX', symbol: trackSym, name: sig.name, dir: sig.dir, type: sig.type, conf: sig.conf, reason: sig.reason, price: sig.entry, sl: sig.sl, tp: sig.tp });
      // Skip the browser popup on first observation (page load) — only notify on changes
      if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`FlowEdge Forex — ${sig.name}`, {
          body: `${sig.dir.toUpperCase()} ${sig.type} · ${sig.conf}%\n${sig.reason}`,
          icon: '/favicon.ico',
        });
      }
    });
  }, [forexData]);

  // Background strategy watcher — INTRADAY, ICT, ORB, SMC alerts fire even when
  // the relevant tab is closed. 30s cadence matches the intraday edge cache;
  // logSignalAlert dedupes against each panel's own faster loop when open.
  const scalpWatchRef = useRef({});
  useEffect(() => {
    const scan = () => {
      ICT_PAIRS.forEach(async p => {
        try {
          const [r5, r15, r1d] = await Promise.all([
            fetch(`/api/ohlcv?symbol=${encodeURIComponent(p.symbol)}&interval=5m&range=5d`),
            fetch(`/api/ohlcv?symbol=${encodeURIComponent(p.symbol)}&interval=15m&range=5d`),
            fetch(`/api/ohlcv?symbol=${encodeURIComponent(p.symbol)}&interval=1d&range=90d`),
          ]);
          const [d5, d15, d1d] = await Promise.all([r5.json(), r15.json(), r1d.json()]);
          const c5 = d5.candles || [], c15 = d15.candles || [], c1d = d1d.candles || [];
          const price = d5.meta?.regularMarketPrice || c5[c5.length - 1]?.close || c15[c15.length - 1]?.close;
          if (!price) return;
          // Daily ICT buy/sell entries alert here too, not only while the ICT tab is open
          const dailyPrice = d1d.meta?.regularMarketPrice || c1d[c1d.length - 1]?.close;
          const an = dailyPrice ? ictAnalyze(c1d, dailyPrice) : null;
          const ictSig = an?.signal ? { dir: an.signal, setup: an.signalType.replace('_', ' '), conf: an.confidence, reason: an.reason, entry: an.entry, rr: an.rr, sl: an.sl, tp: an.tp, regime: an.regime, volState: an.volState } : null;
          // Higher timeframe sets direction: daily → 15m intraday
          const dailyHtf = ictHtfBias(an);
          const intra = ictIntradayAnalyze(c15, price, 'intra', dailyHtf);
          const orb = orbAnalyze(c5, price, dailyHtf);
          const smc = smcAnalyze(c15, price, dailyHtf);
          [['INTRADAY', intra?.sig], ['ICT', ictSig], ['ORB', orb?.sig], ['SMC', smc?.sig]].forEach(([mode, sig]) => {
            const refKey = `${p.symbol}|${mode}`;
            const key = sig ? `${sig.dir}|${sig.setup}` : null;
            const prev = scalpWatchRef.current[refKey];
            if (key && prev !== key && isHighQualitySignal(mode, sig.conf, sig.rr, p.name, sig.setup, sig.regime)) {
              const isNew = logSignalAlert({ source: mode, symbol: p.symbol, name: p.name, dir: sig.dir, type: sig.setup, conf: sig.conf, reason: sig.reason, price: sig.entry, sl: sig.sl, tp: sig.tp, regime: sig.regime, volState: sig.volState });
              if (isNew && prev !== undefined && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(`FlowEdge ${mode} — ${p.name}`, {
                  body: `${sig.dir.toUpperCase()} ${sig.setup} · ${sig.conf}%\n${sig.reason}`,
                  icon: '/favicon.ico',
                });
              }
            }
            if (key) scalpWatchRef.current[refKey] = key;
          });
        } catch {}
      });
    };
    scan();
    const t = setInterval(scan, 30000);
    return () => clearInterval(t);
  }, []);

  // Live prices — refresh every second (in-flight guard inside fetchStocks
  // prevents stacking; the 1s edge cache on /api/quotes absorbs the polling)
  useEffect(() => {
    const t = setInterval(fetchStocks, 1000);
    return () => clearInterval(t);
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

  // Keyboard shortcuts — r=refresh, 1-7=tabs, /=focus search
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'r' || e.key === 'R') { fetchStocks(); }
      if (e.key === '/' ) { e.preventDefault(); document.querySelector('input[placeholder*="ticker"]')?.focus(); }
      const tabList = isMobile ? ["Watch", ...TABS] : TABS;
      const n = parseInt(e.key);
      if (n >= 1 && n <= tabList.length) setTab(tabList[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchStocks, isMobile]);

  const vixVal = marketContext.find(d => String(d.symbol).includes('VIX'))?.regularMarketPrice ?? null;
  const spyChange = marketContext.find(d => d.symbol === 'SPY')?.regularMarketChangePercent
    ?? stocks.find(s => s.symbol === 'SPY')?.regularMarketChangePercent
    ?? null;
  const commodities = marketContext.filter(d => ['BZ=F', 'CL=F'].includes(d.symbol));
  const bullCount = stocks.filter(s => s.regularMarketChangePercent >= 0).length;
  const sortedStocks = useMemo(() => {
    if (watchlistSort === 'change') return [...stocks].sort((a, b) => (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0));
    if (watchlistSort === 'volume') return [...stocks].sort((a, b) => (b.regularMarketVolume ?? 0) - (a.regularMarketVolume ?? 0));
    if (watchlistSort === 'name') return [...stocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return stocks;
  }, [stocks, watchlistSort]);
  const filteredStocks = useMemo(() => {
    if (watchlistFilter === 'gainers') return sortedStocks.filter(s => (s.regularMarketChangePercent ?? 0) > 0);
    if (watchlistFilter === 'losers') return sortedStocks.filter(s => (s.regularMarketChangePercent ?? 0) < 0);
    if (watchlistFilter === 'rvol') return sortedStocks.filter(s => {
      const avg = s.averageDailyVolume3Month || s.averageDailyVolume10Day;
      return avg && s.regularMarketVolume && (s.regularMarketVolume / avg) >= 1.5;
    });
    if (watchlistFilter === 'signals') return sortedStocks.filter(s => scanResults[s.symbol]?.hasEdge);
    return sortedStocks;
  }, [sortedStocks, watchlistFilter, scanResults]);
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
              {loading ? "LOADING..." : error ? "ERROR" : `LIVE · ${lastUpdate} · 1s`}
            </span>
          </div>
          <button onClick={() => { fetchStocks(); }} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "6px 14px", color: "#9ca3af", fontSize: 11,
            cursor: "pointer", fontWeight: 600,
          }}>{isMobile ? "↻" : "↻ Refresh"}</button>
          {clerkAvailable && <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />}
        </div>
      </div>

      <MarketContextBar contextData={marketContext} />
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 32 }}>⬡</div>
          <div style={{ color: "#4b5563", fontSize: 13 }}>Loading live market data...</div>
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 12 }}>
          <div style={{ fontSize: 32 }}>⚠</div>
          <div style={{ color: "#ef4444", fontWeight: 700 }}>{error}</div>
          <button onClick={() => { fetchStocks(); }} style={{
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
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                      {[['all','All'],['gainers','▲'],['losers','▼'],['rvol','Vol'],['signals','✦']].map(([key, label]) => (
                        <button key={key} onClick={() => setWatchlistFilter(key)} style={{
                          padding: '3px 9px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                          background: watchlistFilter === key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                          color: watchlistFilter === key ? '#a5b4fc' : '#4b5563',
                        }}>{label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {filteredStocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} signalData={scanResults[s.symbol]} spyChange={spyChange} onRemove={() => removeFromWatchlist(s.symbol)} onChart={() => setChartSymbol(s.symbol)} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />)}
                    </div>
                  </div>
                )}
                {tab === "Signals" && <SignalsPanel scanResults={scanResults} scanning={scanning} scanProgress={scanProgress} watchlist={watchlist} onRescan={() => { scanResultsRef.current = {}; setScanResults({}); triggerScan(true); }} vixVal={vixVal} sectorData={sectorData} commodities={commodities} forexData={forexData} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />}
                {tab === "Confluence" && <ConfluencePanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                {tab === "ICT" && <ICTPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                {tab === "ORB" && <ORBPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                {tab === "SMC" && <SMCPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                {tab === "Order Book" && <OrderBookPanel />}
                {tab === "Options Flow" && <OptionsFlowPanel />}
                {tab === "GEX" && <ProGate><GexIndependentPanel /></ProGate>}
                {tab === "Dark Pool" && <DarkPoolPanel onChart={sym => setChartSymbol(sym)} />}
                {tab === "Stats" && <StatsPanel />}
                {tab === "News" && <NewsPanel watchlist={watchlist} />}
                {tab === "Journal" && <JournalPanel />}
                {tab === "Portfolio" && <PortfolioPanel stocks={stocks} />}
                {tab === "Alerts" && <AlertsPanel stocks={stocks} />}
                {tab === "Gamma" && <ProGate><GammaPanel stocks={stocks} /></ProGate>}
                {tab === "Perps" && <HyperliquidPanel />}
                {tab === "Account" && (clerkAvailable ? <AccountPanel /> : <div style={{ fontSize: 12, color: '#6b7280', padding: 16 }}>Sign in to access account settings.</div>)}
              </div>
            </>
          ) : (
            /* ── Desktop: two-column layout ── */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", minHeight: "calc(100vh - 190px)" }}>
              <div style={{ padding: 16, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingLeft: 4 }}>
                  <span style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Live Prices · {watchlist.length} tickers
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 2px' }} />
                    {[['cards', '▦'], ['heat', '⬛']].map(([key, label]) => (
                      <button key={key} title={key === 'cards' ? 'Card view' : 'Heat map'} onClick={() => setWatchlistView(key)} style={{
                        padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: watchlistView === key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                        color: watchlistView === key ? '#a5b4fc' : '#4b5563',
                      }}>{label}</button>
                    ))}
                    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.07)', margin: '0 2px' }} />
                    {watchlistView === 'cards' && [['default', 'Default'], ['change', 'Chg %'], ['volume', 'Vol'], ['name', 'A–Z']].map(([key, label]) => (
                      <button key={key} onClick={() => setWatchlistSort(key)} style={{
                        padding: '2px 7px', borderRadius: 4, fontSize: 8, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: watchlistSort === key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                        color: watchlistSort === key ? '#a5b4fc' : '#4b5563',
                      }}>{label}</button>
                    ))}
                  </div>
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
                <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    ['all', 'All', sortedStocks.length],
                    ['gainers', '▲ Up', sortedStocks.filter(s => (s.regularMarketChangePercent ?? 0) > 0).length],
                    ['losers', '▼ Down', sortedStocks.filter(s => (s.regularMarketChangePercent ?? 0) < 0).length],
                    ['rvol', 'High Vol', sortedStocks.filter(s => { const avg = s.averageDailyVolume3Month || s.averageDailyVolume10Day; return avg && s.regularMarketVolume && (s.regularMarketVolume / avg) >= 1.5; }).length],
                    ['signals', '✦ Signals', sortedStocks.filter(s => scanResults[s.symbol]?.hasEdge).length],
                  ].map(([key, label, count]) => (
                    <button key={key} onClick={() => setWatchlistFilter(key)} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                      background: watchlistFilter === key ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                      color: watchlistFilter === key ? '#a5b4fc' : '#4b5563',
                    }}>
                      {label}{key !== 'all' && count > 0 ? ` (${count})` : ''}
                    </button>
                  ))}
                </div>
                {watchlistView === 'heat' ? (
                  <WatchlistHeatmap stocks={filteredStocks} scanResults={scanResults} onChart={sym => setChartSymbol(sym)} />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {filteredStocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} signalData={scanResults[s.symbol]} spyChange={spyChange} onRemove={() => removeFromWatchlist(s.symbol)} onChart={() => setChartSymbol(s.symbol)} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />)}
                  </div>
                )}
              </div>

              <div style={{ padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
                  {TABS.map((t, i) => {
                    const edgeCount = t === 'Signals' ? Object.values(scanResults).filter(r => r?.hasEdge).length : 0;
                    return (
                      <button key={t} onClick={() => setTab(t)} style={{
                        flexShrink: 0, minWidth: 64, padding: "8px 10px", fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", border: "none",
                        background: tab === t ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.02)",
                        color: tab === t ? "#a5b4fc" : "#4b5563",
                        borderRight: i < TABS.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                        transition: "all 0.2s", whiteSpace: "nowrap", display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
                      }}>
                        {t}
                        {edgeCount > 0 && (
                          <span style={{ background: '#6366f1', color: '#fff', borderRadius: 8, fontSize: 8, padding: '1px 5px', fontWeight: 900, lineHeight: 1.3 }}>{edgeCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {tab === "Signals" && <SignalsPanel scanResults={scanResults} scanning={scanning} scanProgress={scanProgress} watchlist={watchlist} onRescan={() => { scanResultsRef.current = {}; setScanResults({}); triggerScan(true); }} vixVal={vixVal} sectorData={sectorData} commodities={commodities} forexData={forexData} onTrade={brokerConnected ? (sym, price, side) => setTradeTarget({ symbol: sym, price, side }) : null} />}
                  {tab === "Confluence" && <ConfluencePanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                {tab === "ICT" && <ICTPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                  {tab === "ORB" && <ORBPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                  {tab === "SMC" && <SMCPanel onChart={sym => setChartSymbol(sym)} livePrices={livePrices} />}
                  {tab === "Order Book" && <OrderBookPanel />}
                  {tab === "Options Flow" && <OptionsFlowPanel />}
                  {tab === "GEX" && <ProGate><GexIndependentPanel /></ProGate>}
                  {tab === "Dark Pool" && <DarkPoolPanel onChart={sym => setChartSymbol(sym)} />}
                  {tab === "Stats" && <StatsPanel />}
                  {tab === "News" && <NewsPanel watchlist={watchlist} />}
                  {tab === "Journal" && <JournalPanel />}
                  {tab === "Portfolio" && <PortfolioPanel stocks={stocks} />}
                  {tab === "Alerts" && <AlertsPanel stocks={stocks} />}
                  {tab === "Gamma" && <ProGate><GammaPanel stocks={stocks} /></ProGate>}
                  {tab === "Perps" && <HyperliquidPanel />}
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

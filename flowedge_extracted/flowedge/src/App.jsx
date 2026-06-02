import { useState, useEffect, useCallback } from "react";

const TICKERS = ["NVDA", "AAPL", "TSLA", "SPY", "QQQ", "META", "MSFT", "AMD"];

const fmt = (n) => {
  if (!n) return "$0";
  return n >= 1e12 ? `$${(n/1e12).toFixed(2)}T`
    : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B`
    : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M`
    : `$${n.toFixed(2)}`;
};

const pct = (n) => n != null ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%` : "—";

function StatBox({ label, value, color = "#a5b4fc", sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 20, fontFamily: "'Space Mono', monospace", fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "#6b7280" }}>{sub}</span>}
    </div>
  );
}

function StockCard({ data, index }) {
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
          <div style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb" }}>{data.symbol}</div>
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

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  useEffect(() => {
    const p = setInterval(() => setPulse(x => !x), 1000);
    return () => clearInterval(p);
  }, []);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes?symbols=${TICKERS.join(",")}`);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const results = data?.quoteResponse?.result || [];
      if (!results.length) throw new Error("No data returned");
      setStocks(results);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Could not load market data. " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
          }}>⬡</div>
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
              <div style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, paddingLeft: 4 }}>
                Live Prices
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {stocks.map((s, i) => <StockCard key={s.symbol} data={s} index={i} />)}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
                AI Signal Engine
              </div>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { SignInButton, SignUpButton } from '@clerk/clerk-react';

const FEATURES = [
  {
    icon: '📡',
    title: 'Live Signals',
    desc: 'Real-time momentum signals across 50+ tickers. Color-coded strength scores so you know exactly where energy is building.',
  },
  {
    icon: '⚡',
    title: 'Gamma Intelligence',
    desc: 'Options flow heatmaps and gamma exposure by strike. Get precise entry, take-profit, and stop-loss levels — no guessing.',
  },
  {
    icon: '🔔',
    title: 'Smart Alerts',
    desc: 'Set price and momentum alerts on any ticker. Get notified the moment your setup triggers.',
  },
];

const FREE_FEATURES = ['Live momentum signals', 'Unlimited watchlist', 'Basic price alerts'];
const PRO_FEATURES = [
  'Everything in Free',
  'Gamma intelligence tab',
  'Options flow heatmap',
  'Precise entry · TP · SL levels',
  'Put / call pressure scoring',
  'King node directional targets',
];

const signUpBtn = {
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  border: 'none',
  borderRadius: 10,
  padding: '13px 36px',
  color: '#fff',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 4px 24px rgba(99,102,241,0.35)',
};

export default function LandingPage() {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/icons/logo.png" alt="FlowEdge" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FlowEdge</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SignInButton mode="modal">
            <button style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 16px', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 7, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Start Free →
            </button>
          </SignUpButton>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '72px 24px 56px', textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 100, padding: '5px 14px', fontSize: 11, color: '#a5b4fc', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 28 }}>
          7-DAY FREE TRIAL · NO CREDIT CARD REQUIRED
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-1.5px', margin: '0 0 18px', color: '#f9fafb' }}>
          Know what the market<br />is doing before everyone else
        </h1>
        <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.65, margin: '0 0 36px' }}>
          Real-time options flow, gamma exposure, and momentum signals — all in one terminal. Built for serious traders.
        </p>
        <SignUpButton mode="modal">
          <button style={signUpBtn}>Start Free Trial →</button>
        </SignUpButton>
        <p style={{ fontSize: 12, color: '#374151', margin: '14px 0 0' }}>Then $19.99 / month · Cancel anytime</p>
      </section>

      {/* Stats bar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 48, padding: '24px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {[['50+', 'Tickers tracked'], ['Real-time', 'Market data'], ['$0', 'To get started']].map(([val, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{val}</div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <section style={{ padding: '60px 24px', maxWidth: 860, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>
          Everything you need to trade with edge
        </h2>
        <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 14, marginBottom: 36 }}>
          Built for options traders who want precision, not noise.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px 20px' }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '16px 24px 60px', maxWidth: 680, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>Simple pricing</h2>
        <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 14, marginBottom: 36 }}>Start free. Upgrade when you're ready.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Free */}
          <div style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '24px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#4b5563', letterSpacing: '0.08em', marginBottom: 10 }}>FREE</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 20 }}>$0</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 24 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#9ca3af', alignItems: 'flex-start' }}>
                  <span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
            <SignUpButton mode="modal">
              <button style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 0', color: '#9ca3af', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Get Started
              </button>
            </SignUpButton>
          </div>

          {/* Pro */}
          <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 12, padding: '24px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -11, right: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 100, padding: '3px 11px', fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>POPULAR</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#a5b4fc', letterSpacing: '0.08em', marginBottom: 10 }}>PRO</div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 900 }}>$19.99</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>/mo</span>
            </div>
            <div style={{ fontSize: 11, color: '#10b981', marginBottom: 20, fontWeight: 600 }}>7-day free trial</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 24 }}>
              {PRO_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#9ca3af', alignItems: 'flex-start' }}>
                  <span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
            <SignUpButton mode="modal">
              <button style={{ width: '100%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 8, padding: '10px 0', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Start Free Trial →
              </button>
            </SignUpButton>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: '48px 24px 72px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12, letterSpacing: '-0.5px' }}>Ready to trade smarter?</h2>
        <p style={{ color: '#4b5563', fontSize: 14, marginBottom: 28 }}>
          Join traders using FlowEdge to find setups before the crowd.
        </p>
        <SignUpButton mode="modal">
          <button style={{ ...signUpBtn, padding: '14px 44px' }}>Start Free 7-Day Trial →</button>
        </SignUpButton>
        <p style={{ fontSize: 12, color: '#374151', marginTop: 12 }}>No credit card required · Cancel anytime</p>
      </section>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icons/logo.png" alt="FlowEdge" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 900, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FlowEdge</span>
        </div>
        <div style={{ fontSize: 12, color: '#1f2937' }}>© 2026 FlowEdge</div>
      </div>

    </div>
  );
}

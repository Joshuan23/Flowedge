import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider, useUser } from '@clerk/clerk-react'
import App from './App'
import LandingPage from './LandingPage'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function AppRouter() {
  const { isSignedIn, isLoaded } = useUser()
  const [inApp, setInApp] = React.useState(() => {
    const fromStripe = new URLSearchParams(window.location.search).get('upgraded') === '1'
    return fromStripe || window.location.pathname !== '/'
  })

  React.useEffect(() => {
    if (isLoaded && isSignedIn) setInApp(true)
  }, [isLoaded, isSignedIn])

  if (!inApp && !isLoaded) {
    return <div style={{ background: '#0a0a0f', height: '100vh' }} />
  }

  if (inApp || isSignedIn) return <App />
  return <LandingPage />
}

class ClerkErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ minHeight: '100vh', background: '#080b12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
          <img src="/icons/logo.png" alt="FlowEdge" style={{ width: 48, height: 48, borderRadius: 10 }} />
          <div style={{ color: '#f9fafb', fontSize: 17, fontWeight: 800 }}>FlowEdge</div>
          <div style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
            Authentication service failed to load. This is usually a temporary network issue.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#6366f1', border: 'none', borderRadius: 8, padding: '10px 28px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkErrorBoundary>
      {PUBLISHABLE_KEY ? (
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignInUrl="/" afterSignUpUrl="/">
          <AppRouter />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </ClerkErrorBoundary>
  </React.StrictMode>,
)

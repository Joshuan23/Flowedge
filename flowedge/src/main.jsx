import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider, useUser, useAuth } from '@clerk/clerk-react'
import App, { AuthContext } from './App'
import LandingPage from './LandingPage'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Reads from Clerk and feeds AuthContext so App never calls Clerk hooks directly
function ClerkAuthProvider({ children }) {
  const { isSignedIn, user, isLoaded } = useUser()
  const { getToken } = useAuth()
  return (
    <AuthContext.Provider value={{ isSignedIn, user, isLoaded, getToken, clerkAvailable: true }}>
      {children}
    </AuthContext.Provider>
  )
}

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

  if (inApp || isSignedIn) return <ClerkAuthProvider><App /></ClerkAuthProvider>
  return <LandingPage />
}

// Null auth context — used when Clerk fails so App still renders with market data
const NULL_AUTH = { isSignedIn: false, user: null, isLoaded: true, getToken: async () => null, clerkAvailable: false }

class ClerkErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      // Clerk failed — render App in read-only mode (market data still works)
      return (
        <AuthContext.Provider value={NULL_AUTH}>
          <App />
        </AuthContext.Provider>
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

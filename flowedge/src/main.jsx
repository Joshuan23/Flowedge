import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider, useUser } from '@clerk/clerk-react'
import App from './App'
import LandingPage from './LandingPage'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Rendered inside ClerkProvider — safe to call useUser here
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignInUrl="/" afterSignUpUrl="/">
        <AppRouter />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)

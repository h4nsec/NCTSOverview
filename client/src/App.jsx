import { useState, useCallback } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import Dashboard from './components/Dashboard.jsx'

export default function App() {
  const [token, setToken] = useState(null)
  const [credentials, setCredentials] = useState(null)

  const handleLogin = useCallback((tok, creds) => {
    setToken(tok)
    setCredentials(creds)
  }, [])

  const handleLogout = useCallback(() => {
    setToken(null)
    setCredentials(null)
  }, [])

  return token
    ? <Dashboard token={token} credentials={credentials} onLogout={handleLogout} />
    : <LoginScreen onLogin={handleLogin} />
}

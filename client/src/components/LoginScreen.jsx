import { useState } from 'react'

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    opacity: 0.4,
  },
  glow: {
    position: 'absolute',
    width: 600, height: 600,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,212,170,0.06) 0%, transparent 70%)',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    width: 460,
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: 2,
    padding: '48px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(0,212,170,0.08)',
    border: '1px solid rgba(0,212,170,0.2)',
    borderRadius: 2,
    padding: '4px 10px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'pulse 2s infinite',
  },
  heading: {
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    marginBottom: 8,
    color: 'var(--text)',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text2)',
    marginBottom: 36,
    lineHeight: 1.6,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    display: 'block',
    width: '100%',
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    borderRadius: 2,
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 0.2s',
    marginBottom: 16,
  },
  btn: {
    width: '100%',
    padding: '12px',
    background: 'var(--accent)',
    color: '#000',
    border: 'none',
    borderRadius: 2,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    transition: 'opacity 0.2s, transform 0.1s',
    marginTop: 8,
  },
  error: {
    marginTop: 16,
    padding: '10px 14px',
    background: 'rgba(255,77,109,0.1)',
    border: '1px solid rgba(255,77,109,0.3)',
    borderRadius: 2,
    color: 'var(--red)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
  },
  hint: {
    marginTop: 20,
    padding: '12px 14px',
    background: 'rgba(0,136,255,0.05)',
    border: '1px solid rgba(0,136,255,0.15)',
    borderRadius: 2,
    fontSize: 11,
    color: 'var(--text2)',
    lineHeight: 1.7,
  },
  hintLink: {
    color: 'var(--accent2)',
    textDecoration: 'none',
  }
}

export default function LoginScreen({ onLogin }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both Client ID and Client Secret are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Auth failed')
      onLogin(`${data.token_type} ${data.access_token}`, { clientId })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div style={styles.wrap}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input:focus { border-color: var(--accent) !important; }
        .login-btn:hover:not(:disabled) { opacity: 0.85; }
        .login-btn:active { transform: scale(0.99); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
      <div style={styles.grid} />
      <div style={styles.glow} />
      <div style={styles.card}>
        <div style={styles.badge}>
          <div style={styles.dot} />
          ADHA · NCTS
        </div>
        <h1 style={styles.heading}>Artefact<br />Audit</h1>
        <p style={styles.sub}>
          Connect to the National Clinical Terminology Service to audit all published artefacts — CodeSystems, ValueSets, ConceptMaps, NamingSystems, and syndication releases (SCT, AMT, LOINC and more).
        </p>

        <label style={styles.label}>Client ID</label>
        <input
          style={styles.input}
          type="text"
          placeholder="your-client-id"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          onKeyDown={handleKey}
          autoComplete="off"
          spellCheck={false}
        />

        <label style={styles.label}>Client Secret</label>
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...styles.input, paddingRight: 44, marginBottom: 0 }}
            type={showSecret ? 'text' : 'password'}
            placeholder="••••••••••••••••"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            type="button"
            onClick={() => setShowSecret(s => !s)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text2)',
              fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1,
            }}
            tabIndex={-1}
            title={showSecret ? 'Hide secret' : 'Show secret'}
          >{showSecret ? '🙈' : '👁'}</button>
        </div>
        <div style={{ marginBottom: 16 }} />

        <button
          className="login-btn"
          style={styles.btn}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Authenticating…' : 'Connect to NCTS →'}
        </button>

        {error && <div style={styles.error}>⚠ {error}</div>}

        <div style={styles.hint}>
          <strong style={{ color: 'var(--text)' }}>Don't have credentials?</strong><br />
          Log in to the{' '}
          <a href="https://www.healthterminologies.gov.au" target="_blank" rel="noreferrer" style={styles.hintLink}>
            NCTS Portal
          </a>{' '}
          → My Profile → Client Credentials → Add. You'll need an active Australian National Terminology licence.
        </div>
      </div>
    </div>
  )
}

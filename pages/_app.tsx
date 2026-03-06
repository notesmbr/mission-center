import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference, isThemePreference, resolveTheme } from '../lib/theme'

// Optional local gate.
// NOTE: this is not "security" (the PIN is client-visible); it just prevents accidental access.
// Configure with NEXT_PUBLIC_MISSION_CENTER_PIN. If unset/empty, no PIN gate is shown.
const DASHBOARD_PIN = String(process.env.NEXT_PUBLIC_MISSION_CENTER_PIN || '').trim()

const AUTH_KEY = 'mc_authenticated'
const AUTH_TS_KEY = 'mc_auth_ts'
const AUTH_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === DASHBOARD_PIN) {
      localStorage.setItem(AUTH_KEY, 'true')
      localStorage.setItem(AUTH_TS_KEY, Date.now().toString())
      onAuth()
    } else {
      setError('Incorrect PIN')
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 600)
    }
  }

  return (
    <div className="min-h-screen dashboard-bg flex items-center justify-center px-4">
      <div className={`card rounded-2xl p-8 w-full max-w-sm shadow-2xl ${shake ? 'animate-shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-slate-100">Mission Center</h1>
          <p className="text-slate-400 text-sm mt-2">Enter PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              placeholder="••••••"
              className="input-shell w-full rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={pin.length < 1}
            className="btn-primary w-full font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
          >
            Unlock
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out;
        }
      `}</style>
    </div>
  )
}

export default function App({ Component, pageProps }: AppProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null) // null = loading
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(stored)) {
      setThemePreference(stored)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = resolveTheme(themePreference, media.matches)
      const root = document.documentElement
      root.classList.toggle('dark', resolved === 'dark')
      root.dataset.theme = resolved
      setResolvedTheme(resolved)
    }

    applyTheme()
    localStorage.setItem(THEME_STORAGE_KEY, themePreference)

    const onMediaChange = () => {
      if (themePreference === 'system') applyTheme()
    }

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onMediaChange)
      return () => media.removeEventListener('change', onMediaChange)
    }

    media.addListener(onMediaChange)
    return () => media.removeListener(onMediaChange)
  }, [themePreference])

  useEffect(() => {
    // If no PIN is configured, skip the gate entirely.
    if (!DASHBOARD_PIN) {
      setAuthenticated(true)
      return
    }

    const isAuth = localStorage.getItem(AUTH_KEY) === 'true'
    const authTs = parseInt(localStorage.getItem(AUTH_TS_KEY) || '0', 10)
    const expired = Date.now() - authTs > AUTH_EXPIRY_MS

    if (isAuth && !expired) {
      setAuthenticated(true)
    } else {
      localStorage.removeItem(AUTH_KEY)
      localStorage.removeItem(AUTH_TS_KEY)
      setAuthenticated(false)
    }
  }, [])

  // Show nothing during hydration check to avoid flash
  if (authenticated === null) {
    return (
      <div className="min-h-screen dashboard-bg flex items-center justify-center">
        <div className="animate-spin">
          <p className="text-4xl">⚙️</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <PinGate onAuth={() => setAuthenticated(true)} />
  }

  return (
    <Component
      {...pageProps}
      themePreference={themePreference}
      resolvedTheme={resolvedTheme}
      onThemeChange={setThemePreference}
      signOut={() => {
        if (!DASHBOARD_PIN) return
        localStorage.removeItem(AUTH_KEY)
        localStorage.removeItem(AUTH_TS_KEY)
        setAuthenticated(false)
      }}
    />
  )
}

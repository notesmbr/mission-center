import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'

const CORRECT_PIN = '236811'
const AUTH_KEY = 'mc_authenticated'
const AUTH_TS_KEY = 'mc_auth_ts'
const AUTH_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === CORRECT_PIN) {
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl ${shake ? 'animate-shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white">Mission Center</h1>
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
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={pin.length < 1}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-lg transition-colors"
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

  useEffect(() => {
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin">
          <p className="text-4xl">⚙️</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <PinGate onAuth={() => setAuthenticated(true)} />
  }

  return <Component {...pageProps} signOut={() => {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(AUTH_TS_KEY)
    setAuthenticated(false)
  }} />
}

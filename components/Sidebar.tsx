import React from 'react'

export type NavKey =
  | 'overview'
  | 'setup'
  | 'agents'
  | 'usage'
  | 'codex'
  | 'skills'
  | 'automations'
  | 'optimizations'

const NAV: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: '⌁' },
  { key: 'setup', label: 'OpenClaw Setup', icon: '⚙' },
  { key: 'agents', label: 'Agents', icon: '⧉' },
  { key: 'usage', label: 'Usage', icon: '⟟' },
  { key: 'codex', label: 'Codex Limits', icon: '◎' },
  { key: 'skills', label: 'Skills', icon: '✦' },
  { key: 'automations', label: 'Automations', icon: '⏱' },
  { key: 'optimizations', label: 'Optimizations', icon: '⚡' },
]

export default function Sidebar({
  active,
  onChange,
}: {
  active: NavKey
  onChange: (k: NavKey) => void
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-950/60">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-white text-lg font-semibold tracking-wide">Mission Control</div>
        <div className="text-slate-400 text-xs mt-1">OpenClaw • read-only</div>
      </div>

      <nav className="p-3">
        <div className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ' +
                (active === item.key
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-300 hover:bg-slate-900 border border-transparent')
              }
            >
              <span className="w-5 text-slate-400">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="p-4 mt-auto border-t border-slate-800 text-xs text-slate-500">
        <div>v2 (in progress)</div>
      </div>
    </aside>
  )
}

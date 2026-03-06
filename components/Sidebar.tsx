import React from 'react'

export type NavKey = 'overview' | 'trader' | 'projects' | 'tasks' | 'jobs' | 'agents'

const NAV: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: '⌂' },
  { key: 'trader', label: 'Trader', icon: '₿' },
  { key: 'projects', label: 'Projects', icon: '▦' },
  { key: 'tasks', label: 'Tasks', icon: '☰' },
  { key: 'jobs', label: 'Jobs', icon: '⏱' },
  { key: 'agents', label: 'Agents', icon: '⚙' },
]

export default function Sidebar({
  active,
  onChange,
}: {
  active: NavKey
  onChange: (k: NavKey) => void
}) {
  return (
    <aside className="w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-slate-100 text-lg font-semibold tracking-wide">Mission Center</div>
        <div className="text-slate-400 text-xs mt-1">OpenClaw • local-only • task-first</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-chip border-emerald-500/35 bg-emerald-500/10 text-emerald-300">Live view</span>
          <span className="status-chip border-sky-500/35 bg-sky-500/10 text-sky-300">Auto-refresh 10s</span>
        </div>
      </div>

      <nav className="p-3">
        <div className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm border transition-colors ' +
                (active === item.key
                  ? 'bg-slate-800/90 text-slate-100 border-slate-700 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 border-transparent')
              }
            >
              <span className="w-5 text-slate-500">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="p-4 mt-auto border-t border-slate-800 text-xs text-slate-500">
        <div>local-only telemetry</div>
      </div>
    </aside>
  )
}

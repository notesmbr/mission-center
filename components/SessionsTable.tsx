import React from 'react'

type SessionRow = {
  agentId: string
  key: string
  kind: string
  age: number
  model?: string
  percentUsed?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export default function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="text-white font-semibold">Recent Sessions</div>
        <div className="text-xs text-slate-400">from openclaw status --json</div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2 pr-3">Kind</th>
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3">Age (ms)</th>
              <th className="py-2 pr-3">Used</th>
              <th className="py-2 pr-3">Tokens</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {sessions.map((s) => (
              <tr key={s.key} className="border-t border-slate-800/70">
                <td className="py-2 pr-3 whitespace-nowrap">{s.agentId}</td>
                <td className="py-2 pr-3">{s.kind}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{s.model || '—'}</td>
                <td className="py-2 pr-3">{typeof s.age === 'number' ? s.age : '—'}</td>
                <td className="py-2 pr-3">{typeof s.percentUsed === 'number' ? `${s.percentUsed}%` : '—'}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {typeof s.totalTokens === 'number' ? s.totalTokens.toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

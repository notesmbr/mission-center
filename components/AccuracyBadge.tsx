import React from 'react'

export type Accuracy = 'live' | 'derived' | 'hardcoded' | 'unknown'

const STYLES: Record<Accuracy, string> = {
  live: 'bg-emerald-500/10 text-emerald-300 border-emerald-800',
  derived: 'bg-sky-500/10 text-sky-300 border-sky-800',
  hardcoded: 'bg-amber-500/10 text-amber-300 border-amber-800',
  unknown: 'bg-slate-500/10 text-slate-300 border-slate-700',
}

export default function AccuracyBadge({ level }: { level: Accuracy }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border ${STYLES[level]}`}>
      {level.toUpperCase()}
    </span>
  )
}

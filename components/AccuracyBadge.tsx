import React from 'react'

export type Accuracy = 'live' | 'derived' | 'hardcoded' | 'unknown'

const STYLES: Record<Accuracy, string> = {
  live: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35',
  derived: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/35',
  hardcoded: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35',
  unknown: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/35',
}

export default function AccuracyBadge({ level }: { level: Accuracy }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border ${STYLES[level]}`}>
      {level.toUpperCase()}
    </span>
  )
}

import { type ThemePreference } from '../lib/theme'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'system', label: 'System', icon: '◐' },
  { value: 'light', label: 'Light', icon: '☼' },
  { value: 'dark', label: 'Dark', icon: '☾' },
]

export default function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePreference
  onChange: (next: ThemePreference) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/60 p-1">
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            aria-pressed={active}
            aria-label={`Set theme to ${option.label}`}
          >
            <span className="mr-1">{option.icon}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

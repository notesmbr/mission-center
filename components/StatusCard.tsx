interface StatusCardProps {
  label: string
  value: string | number
  status?: 'active' | 'idle' | 'error'
  icon?: string
}

export default function StatusCard({ label, value, status, icon }: StatusCardProps) {
  const statusClass = {
    active: 'text-emerald-500 dark:text-emerald-300',
    idle: 'text-amber-500 dark:text-amber-300',
    error: 'text-rose-500 dark:text-rose-300',
  }[status || 'idle']

  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="text-slate-400 text-sm">{label}</p>
        <p className="text-2xl font-bold mt-2 text-slate-100">{value}</p>
      </div>
      {status && (
        <div className={`text-3xl ${statusClass}`}>
          {status === 'active' && '●'}
          {status === 'idle' && '◯'}
          {status === 'error' && '✕'}
        </div>
      )}
    </div>
  )
}

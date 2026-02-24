interface StatusCardProps {
  label: string
  value: string | number
  status?: 'active' | 'idle' | 'error'
  icon?: string
}

export default function StatusCard({ label, value, status, icon }: StatusCardProps) {
  const statusClass = {
    active: 'text-green-400',
    idle: 'text-yellow-400',
    error: 'text-red-400',
  }[status || 'idle']

  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="text-slate-400 text-sm">{label}</p>
        <p className="text-2xl font-bold mt-2">{value}</p>
      </div>
      {status && (
        <div className={`text-4xl ${statusClass}`}>
          {status === 'active' && '●'}
          {status === 'idle' && '◯'}
          {status === 'error' && '✕'}
        </div>
      )}
    </div>
  )
}

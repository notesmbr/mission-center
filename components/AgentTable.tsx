interface Agent {
  id: string
  name: string
  model: string
  status: 'active' | 'idle' | 'error'
  tasksCompleted: number
}

interface AgentTableProps {
  agents: Agent[]
}

export default function AgentTable({ agents }: AgentTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-emerald-500 dark:text-emerald-300'
      case 'idle':
        return 'text-amber-500 dark:text-amber-300'
      default:
        return 'text-rose-500 dark:text-rose-300'
    }
  }

  return (
    <div className="card overflow-hidden">
      <h2 className="text-xl font-bold mb-4 text-slate-100">Active Agents</h2>
      <div className="overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 text-slate-400">Agent</th>
              <th className="text-left py-3 px-4 text-slate-400">Model</th>
              <th className="text-left py-3 px-4 text-slate-400">Status</th>
              <th className="text-left py-3 px-4 text-slate-400">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-slate-700/30">
                <td className="py-3 px-4 font-medium">{agent.name}</td>
                <td className="py-3 px-4 text-slate-300 text-xs">{agent.model}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block ${getStatusColor(agent.status)}`}>
                    ● {agent.status}
                  </span>
                </td>
                <td className="py-3 px-4">{agent.tasksCompleted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

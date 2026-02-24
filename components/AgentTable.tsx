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
        return 'text-green-400'
      case 'idle':
        return 'text-yellow-400'
      default:
        return 'text-red-400'
    }
  }

  return (
    <div className="card overflow-hidden">
      <h2 className="text-xl font-bold mb-4">Active Agents</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4 text-slate-400">Agent</th>
              <th className="text-left py-3 px-4 text-slate-400">Model</th>
              <th className="text-left py-3 px-4 text-slate-400">Status</th>
              <th className="text-left py-3 px-4 text-slate-400">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-slate-700 hover:bg-slate-700/30">
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

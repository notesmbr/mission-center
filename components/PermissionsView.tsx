interface Authorization {
  status: string
  permissions: string[]
  [key: string]: any
}

interface PermissionsData {
  authorizations: {
    github: Authorization
    cryptoTrading: Authorization
    openRouter: Authorization
  }
  activeProjects: Array<{
    name: string
    status: string
    url?: string
    repo: string
    description: string
    features: string[]
  }>
  agents: Array<{
    name: string
    model: string
    role: string
  }>
  lastUpdated: string
}

export default function PermissionsView({ data }: { data: PermissionsData }) {
  return (
    <div className="space-y-8">
      {/* Authorizations Section */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">🔐 Authorizations & Permissions</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* GitHub */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">GitHub</h3>
                <p className="text-slate-400 text-sm">{data.authorizations.github.username}</p>
              </div>
              <span className="inline-block bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold">
                ✓ Authorized
              </span>
            </div>
            <div className="space-y-2">
              {data.authorizations.github.permissions.map((perm, i) => (
                <p key={i} className="text-slate-300 text-sm flex items-start gap-2">
                  <span className="text-green-400 mt-1">✓</span>
                  {perm}
                </p>
              ))}
            </div>
          </div>

          {/* Crypto Trading */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Crypto Trading</h3>
                <p className="text-slate-400 text-sm">Full Autonomy</p>
              </div>
              <span className="inline-block bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold">
                ✓ Active
              </span>
            </div>
            <div className="space-y-2 mb-4">
              <p className="text-slate-300 text-sm">
                <strong>Capital:</strong> {data.authorizations.cryptoTrading.currentSetup.capital}
              </p>
              <p className="text-slate-300 text-sm">
                <strong>Cycle:</strong> {data.authorizations.cryptoTrading.currentSetup.frequency}
              </p>
              <p className="text-slate-300 text-sm">
                <strong>Strategy:</strong> {data.authorizations.cryptoTrading.currentSetup.strategy}
              </p>
            </div>
          </div>

          {/* OpenRouter */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">OpenRouter</h3>
                <p className="text-slate-400 text-sm">API Access</p>
              </div>
              <span className="inline-block bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold">
                ✓ Active
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-slate-300 text-sm">
                <strong>Budget:</strong> {data.authorizations.openRouter.monthlyBudget}/month
              </p>
              <p className="text-slate-300 text-sm">
                <strong>Models:</strong> Multiple
              </p>
              <p className="text-slate-300 text-sm">
                <strong>Status:</strong> Fully operational
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Projects */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">🚀 Active Projects</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.activeProjects.map((project) => (
            <div key={project.name} className="bg-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{project.name}</h3>
                  <p className="text-slate-400 text-sm mt-1">{project.description}</p>
                </div>
                <span className="inline-block bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-semibold">
                  {project.status}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <p className="text-slate-400 text-xs font-semibold mb-2">Features</p>
                  <div className="flex flex-wrap gap-2">
                    {project.features.map((feature) => (
                      <span key={feature} className="inline-block bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                {project.url && (
                  <p className="text-slate-400">
                    <strong>URL:</strong>{' '}
                    <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      Live
                    </a>
                  </p>
                )}
                <p className="text-slate-400">
                  <strong>Repo:</strong> <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">{project.repo}</code>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">🤖 Active Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.agents.map((agent) => (
            <div key={agent.name} className="bg-slate-900 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-2">{agent.name}</h3>
              <div className="space-y-2">
                <p className="text-slate-400 text-sm">
                  <strong>Model:</strong> {agent.model}
                </p>
                <p className="text-slate-400 text-sm">
                  <strong>Role:</strong> {agent.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-center text-slate-500 text-xs mt-8">
        <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
      </div>
    </div>
  )
}

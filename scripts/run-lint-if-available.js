const { spawnSync } = require('child_process')

let hasEslint = false
try {
  require.resolve('eslint')
  hasEslint = true
} catch {
  hasEslint = false
}

if (!hasEslint) {
  console.log('Skipping lint: eslint is not installed in this repository.')
  process.exit(0)
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['next', 'lint'], { stdio: 'inherit' })
process.exit(typeof result.status === 'number' ? result.status : 1)

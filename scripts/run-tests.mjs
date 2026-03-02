import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function collectTestFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...collectTestFiles(full))
      continue
    }
    if (/\.test\.(m)?ts$/.test(entry)) out.push(full)
  }
  return out
}

const root = process.cwd()
const testsDir = path.join(root, 'tests')
const files = collectTestFiles(testsDir)

if (!files.length) {
  console.error('No test files found under tests/')
  process.exit(1)
}

// Run node's built-in test runner but with TS support.
const args = ['--import', 'tsx', '--test', ...files]
const res = spawnSync(process.execPath, args, { stdio: 'inherit' })
process.exit(res.status ?? 1)

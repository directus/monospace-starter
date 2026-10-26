import { execFileSync } from 'node:child_process'

// Git hooks are set for a whole repo. Inside monospace-starter, monoERP's pre-commit hook would
// run on every commit in that repo, so it's only installed when monoERP is the repo root.
let atRoot = false

try {
  atRoot =
    execFileSync('git', ['rev-parse', '--show-prefix'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === ''
} catch {
  atRoot = false
}

execFileSync('vp', ['config', '--no-agent', ...(atRoot ? [] : ['--no-hooks'])], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

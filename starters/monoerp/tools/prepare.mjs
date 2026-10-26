import { execFileSync } from 'node:child_process'

// Hooks affect the whole Git repo, so only install them when this app is its root.
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

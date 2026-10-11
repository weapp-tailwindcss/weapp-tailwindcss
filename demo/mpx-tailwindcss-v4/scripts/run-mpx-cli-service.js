#!/usr/bin/env node

const { spawn } = require('node:child_process')
const process = require('node:process')

const child = spawn(
  process.execPath,
  [require.resolve('@mpxjs/mpx-cli-service/bin/mpx-cli-service'), ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
)

let stopping = false
function stop(signal) {
  stopping = true
  if (child.exitCode != null || child.killed) {
    process.exit(0)
  }
  child.kill(signal)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

child.on('exit', (code, signal) => {
  process.exit(stopping && signal ? 0 : (code ?? 1))
})

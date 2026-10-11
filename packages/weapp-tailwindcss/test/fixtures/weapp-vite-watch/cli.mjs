import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync, unwatchFile, watchFile, writeFileSync } from 'node:fs'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

function event(kind) {
  appendFileSync('events.jsonl', `${JSON.stringify({ kind, pid: process.pid, args: process.argv.slice(2) })}\n`)
}

function update() {
  writeFileSync('output.txt', readFileSync('input.txt'))
}

function stop() {
  event('closing')
  if (process.env.STOP_MODE === 'kill') {
    process.kill(process.pid, 'SIGKILL')
    return
  }
  setTimeout(() => {
    unwatchFile('input.txt')
    event('closed')
    process.exit(0)
  }, 200)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
event('start')
if (process.env.EXIT_PHASE === 'before') {
  process.exit(Number(process.env.EXIT_CODE))
}

watchFile('input.txt', { interval: 10 }, update)
update()
if (process.env.NO_READY !== '1') {
  const stream = process.env.READY_STREAM === 'stderr' ? process.stderr : process.stdout
  const ready = Buffer.from('开发服务已就绪\n')
  stream.write(ready.subarray(0, 2))
  await delay(10)
  stream.write(ready.subarray(2, 10))
  await delay(10)
  stream.write(ready.subarray(10))
}
if (process.env.EXIT_PHASE === 'after') {
  if (process.env.HOLD_PIPE === '1') {
    spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600)'], { stdio: ['ignore', process.stdout, process.stderr] })
  }
  process.exit(Number(process.env.EXIT_CODE))
}

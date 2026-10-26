import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const [directory, token] = process.argv.slice(2)
const cleanup = path.join(directory, 'cleanup')
writeFileSync(path.join(directory, 'worker.json'), JSON.stringify({ pid: process.pid, token }))
let count = 0
const started = Date.now()
setInterval(() => {
  if (existsSync(cleanup) && readFileSync(cleanup, 'utf8') === token) {
    process.exit(0)
  }
  if (Date.now() - started > 45000) {
    writeFileSync(path.join(directory, 'expired'), token)
    process.exit(1)
  }
  writeFileSync(path.join(directory, 'heartbeat'), String(++count))
}, 25)

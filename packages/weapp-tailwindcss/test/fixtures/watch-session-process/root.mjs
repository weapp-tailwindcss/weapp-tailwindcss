import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const [directory, token, worker] = process.argv.slice(2)
const child = spawn(process.execPath, [worker, directory, token], { detached: true, windowsHide: true, stdio: 'ignore' })
child.unref()
writeFileSync(path.join(directory, 'root.json'), JSON.stringify({ pid: process.pid, token }))
let announced = false
const started = Date.now()
setInterval(() => {
  if (!announced && existsSync(path.join(directory, 'worker.json'))) {
    announced = true
    process.stdout.write('compiled successfully\n')
  }
  for (const file of ['release', 'cleanup']) {
    const target = path.join(directory, file)
    if (existsSync(target) && readFileSync(target, 'utf8') === token) {
      process.exit(0)
    }
  }
  if (Date.now() - started > 45000) {
    writeFileSync(path.join(directory, 'expired'), token)
    process.exit(1)
  }
}, 25)

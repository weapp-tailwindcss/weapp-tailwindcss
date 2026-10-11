const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { fileURLToPath } = require('node:url')

const probe = process.env.DEMO_MATRIX_NATIVE_WATCH_FILE
if (probe) {
  const target = path.resolve(probe)
  const original = fs.watch
  let nextId = 0
  const trace = (event, data) => process.stdout.write(`[native-watch] ${JSON.stringify({ event, pid: process.pid, time: new Date().toISOString(), ...data })}\n`)
  const state = () => {
    try {
      const { ino, size, mtimeMs } = fs.statSync(target)
      return { ino, size, mtimeMs }
    }
    catch (error) { return { error: error.code } }
  }
  fs.watch = function (file, ...args) {
    const resolved = path.resolve(file instanceof URL ? fileURLToPath(file) : String(file))
    const relative = path.relative(resolved, target)
    const recursive = args.some(arg => arg && typeof arg === 'object' && arg.recursive === true)
    const ancestor = recursive && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    if (resolved !== target && resolved !== path.dirname(target) && !ancestor) {
      return original.call(this, file, ...args)
    }
    const id = ++nextId
    const caller = new Error('原生监听注册来源').stack
    trace('bind', { id, file: String(file), state: state(), caller })
    const watcher = original.call(this, file, ...args)
    // Watchpack 在返回值上注册 change；仅包装回调参数会漏掉真实原生事件。
    watcher.on('change', (...events) => {
      const filename = events[1]
      if (resolved !== target && filename != null && path.resolve(resolved, String(filename)) !== target) {
        return
      }
      trace('event', { id, events, state: state() })
    })
    watcher.once('close', () => trace('close', { id, state: state() }))
    return watcher
  }
}

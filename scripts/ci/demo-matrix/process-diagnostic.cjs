const fs = require('node:fs')
const process = require('node:process')

// 同步写入，避免进程结束时丢失最后一条诊断；不注册保活句柄或改变退出码。
function trace(event, extra = {}) {
  fs.writeSync(2, `[demo-process] ${JSON.stringify({
    event,
    pid: process.pid,
    ppid: process.ppid,
    command: process.argv.slice(1),
    resources: process.getActiveResourcesInfo(),
    memory: process.memoryUsage(),
    ...extra,
  })}\n`)
}

trace('start')
process.on('beforeExit', code => trace('beforeExit', { code }))
process.on('exit', code => trace('exit', { code }))
process.on('uncaughtExceptionMonitor', error => trace('uncaughtException', { error: error.stack }))

const { mkdirSync, statSync } = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const environment = 'WEAPP_TAILWINDCSS_LOCAL_COMMAND_GATE'
const payload = process.env[environment]
if (!payload) {
  throw new Error('本地 Node 命令缺少启动身份登记凭据。')
}
const { directory, nodeOptions, deadline } = JSON.parse(payload)
// 恢复原环境后才运行用户 preload 和入口，避免后代 Node/Playwright worker 重复等待。
delete process.env[environment]
process.env.NODE_OPTIONS = nodeOptions
// ready 仅供诊断和确定性测试；放行依据仍是父侧采集的进程出生身份。
mkdirSync(path.join(directory, `ready-${process.pid}`))
const wait = new Int32Array(new SharedArrayBuffer(4))
while (true) {
  if (Date.now() >= deadline) {
    throw new Error('本地 Node 命令等待启动身份登记超过截止时间。')
  }
  try {
    if (!statSync(path.join(directory, 'released')).isDirectory()) {
      throw new Error('本地 Node 命令启动放行凭据无效。')
    }
    break
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  Atomics.wait(wait, 0, 0, Math.min(10, deadline - Date.now()))
}

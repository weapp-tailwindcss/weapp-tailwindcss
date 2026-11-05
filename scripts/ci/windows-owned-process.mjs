import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const modulePath = fileURLToPath(import.meta.url)
const supervisorPath = fileURLToPath(new URL('./windows-owned-process/supervisor.ps1', import.meta.url))
const ownedProcesses = new WeakMap()

/** 将命令身份传给本轮 Job 内的 Node 桥接进程，参数不经过 PowerShell 解释。 */
export function createWindowsOwnedProcess(file, args, options = {}) {
  const child = execa('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', supervisorPath], {
    ...options,
    shell: false,
    detached: false,
    windowsHide: true,
    env: {
      ...options.env,
      WEAPP_WINDOWS_OWNED_NODE: process.execPath,
      WEAPP_WINDOWS_OWNED_WORKER: modulePath,
      WEAPP_WINDOWS_OWNED_COMMAND: Buffer.from(JSON.stringify({ file, args })).toString('base64'),
    },
  })
  const closed = new Promise(resolve => child.once('close', resolve))
  ownedProcesses.set(child, { closed })
  // 调用方可能先等待编译标识；立即登记拒绝处理，最终结果仍由调用方读取。
  void child.catch(() => {})
  return child
}

function waitForClose(closed, timeout) {
  let timer
  return Promise.race([
    closed,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Windows owned supervisor did not close within ${timeout} milliseconds`)), timeout)
    }),
  ]).finally(() => clearTimeout(timer))
}

/** 只终止本模块创建的 supervisor；原生 handle 关闭 Job 后同时回收已脱离包装进程的后代。 */
export function stopWindowsOwnedProcess(child, { timeout = 5_000 } = {}) {
  const owned = ownedProcesses.get(child)
  if (!owned) {
    return Promise.reject(new Error('拒绝回收不属于本轮 Windows supervisor 的进程'))
  }
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return Promise.reject(new Error('Windows supervisor 收尾期限必须是正数'))
  }
  if (!owned.stopping) {
    owned.stopping = (async () => {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
      await waitForClose(owned.closed, timeout)
    })()
  }
  return owned.stopping
}

async function runWorker() {
  const payload = process.env.WEAPP_WINDOWS_OWNED_COMMAND
  if (!payload) {
    throw new Error('缺少本轮 Windows 命令身份')
  }
  const { file, args } = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  if (typeof file !== 'string' || !Array.isArray(args) || args.some(value => typeof value !== 'string')) {
    throw new Error('无效的本轮 Windows 命令身份')
  }
  // PATHEXT、pnpm.cmd 和命令参数沿用 execa，避免重新实现 cmd.exe 转义。
  const result = await execa(file, args, { stdio: 'inherit', reject: false })
  process.exitCode = result.exitCode ?? 1
}

if (process.argv[2] === '--owned-worker' && path.resolve(process.argv[1]) === modulePath) {
  await runWorker()
}

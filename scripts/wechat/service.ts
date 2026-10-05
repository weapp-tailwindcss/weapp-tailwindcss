import type { FileHandle } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { wechatVersion } from '../e2e-preflight/probes/wechat-version'

export function wechatCliPath() {
  const cli = process.env.E2E_PREFLIGHT_WECHAT_CLI
    ?? (process.platform === 'darwin' ? path.join(path.parse(os.homedir()).root, 'Applications', 'wechatwebdevtools.app', 'Contents', 'MacOS', 'cli') : undefined)
  if (!cli) {
    throw new Error('请设置 E2E_PREFLIGHT_WECHAT_CLI 指向官方安装；E2E 不会执行 CLI 或启动 IDE。')
  }
  return cli
}

export function servicePort(value: string | number) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('微信 IDE HTTP 服务端口必须是 1–65535 的整数。')
  }
  return Number(value)
}

/** 按官方 Electron CLI 的安装身份定位端口标记，只读元数据，不读取账号存储。 */
export function serviceDirectory(metadata: string, name: string, home: string, platform: NodeJS.Platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix
  if (!['darwin', 'win32'].includes(platform) || api.basename(api.dirname(metadata)) !== 'app.asar.unpacked'
    || !name || api.basename(name) !== name || name === '.' || name === '..') {
    throw new Error('当前 IDE 布局不支持自动发现；请显式设置 E2E_PREFLIGHT_WECHAT_HTTP_PORT。')
  }
  const installation = api.resolve(api.dirname(metadata), '..', 'app.asar')
  const hash = createHash('md5').update(installation).digest('hex')
  return platform === 'darwin'
    ? api.join(home, 'Library', 'Application Support', name, hash, 'Default')
    : api.join(home, 'AppData', 'Local', name, 'User Data', hash, 'Default')
}

export async function existingWechatService(cli = wechatCliPath()) {
  const { version, metadata } = await wechatVersion(cli)
  let port = process.env.E2E_PREFLIGHT_WECHAT_HTTP_PORT
  if (!port) {
    const { name } = JSON.parse(await readFile(metadata, 'utf8'))
    const dir = serviceDirectory(metadata, name, os.homedir())
    try {
      if ((await readFile(path.join(dir, '.ide-status'), 'utf8')).trim() !== 'On') {
        throw new Error('HTTP 服务未开启')
      }
      port = (await readFile(path.join(dir, '.ide'), 'utf8')).trim()
    }
    catch {
      throw new Error('微信 IDE 未提供已开启的 HTTP 服务。请手动打开 IDE、确认登录并开启服务端口；E2E 不会自动启动、登录或重置 IDE。')
    }
  }
  return { command: cli, version, metadata, httpPort: String(servicePort(port)) }
}

type Operation = { kind: 'isLogin' } | { kind: 'auto', project: string, port: number } | { kind: 'close', project: string }
interface ProjectBinding {
  servicePort: number
  autoPort: number
  runId: string
  opened: boolean
  release: () => Promise<void>
}
const blocked = new Set<number>()
const projects = new Map<string, ProjectBinding>()
// 稳定版 IDE 的 simulator 资源是实例级共享的。只允许同一 HTTP 服务持有一个本轮项目租约，
// 防止两个项目虽然拿到不同 autoPort，却在 appLaunch 阶段竞争同一个运行时。
const serviceLeases = new Map<number, ProjectBinding>()
const pendingProjects = new Set<string>()
const pendingServices = new Set<number>()
const serviceQueues = new Map<number, Promise<void>>()
let nextRunId = 0

function lockDirectory() {
  return process.env['E2E_WECHAT_LOCK_DIRECTORY'] || os.tmpdir()
}

/** 返回当前用户对应的微信服务锁路径；锁文件不包含账号或票据。 */
export function wechatServiceLockPath(port: string | number) {
  const user = createHash('sha256').update(os.userInfo().username).digest('hex').slice(0, 16)
  return path.join(lockDirectory(), `weapp-wechat-service-${servicePort(port)}-${user}.lock`)
}

async function acquireServiceLease(port: number, project: string, runId: string) {
  const file = wechatServiceLockPath(port)
  await mkdir(path.dirname(file), { recursive: true })
  let handle: FileHandle
  try {
    handle = await open(file, 'wx')
  }
  catch (error) {
    if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
    const owner = await readFile(file, 'utf8').catch(() => '未知（锁文件不可读）')
    throw new Error(`微信 IDE 服务 ${port} 已被另一个 E2E 会话占用；拒绝并发打开项目 ${project}，保留登录态。锁=${file}，所有者=${owner}`)
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, project, runId, createdAt: new Date().toISOString() }))
  }
  finally {
    await handle.close()
  }
  return async () => {
    const owner = JSON.parse(await readFile(file, 'utf8')) as { pid?: number, runId?: string }
    if (owner.pid !== process.pid || owner.runId !== runId) {
      throw new Error('微信 IDE 服务锁所有者改变，拒绝清理其他会话。')
    }
    await unlink(file)
  }
}

function enqueue<T>(port: number, task: () => Promise<T>) {
  const previous = serviceQueues.get(port) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  serviceQueues.set(port, current)
  const result = previous.then(task)
  return result.finally(() => {
    release()
    if (serviceQueues.get(port) === current) {
      serviceQueues.delete(port)
    }
  })
}

export function ownedWechatPort(project: string) {
  const binding = projects.get(path.resolve(project))
  if (!binding) {
    throw new Error('未登记本轮微信项目与 HTTP 服务的归属，保留 IDE，不重新发现或关闭其他会话。')
  }
  return String(binding.servicePort)
}

/** 临时客户端只借用本进程已打开项目的端口，不重新发现服务或申请项目租约。 */
export function ownedWechatEndpoint(project: string) {
  const binding = projects.get(path.resolve(project))
  if (!binding?.opened || serviceLeases.get(binding.servicePort) !== binding) {
    throw new Error('微信项目没有本轮已打开的自动化连接，拒绝借用未知会话。')
  }
  if (blocked.has(binding.servicePort)) {
    blockWechatService(binding.servicePort)
  }
  return `ws://127.0.0.1:${binding.autoPort}`
}

export function blockWechatService(port: string | number): never {
  blocked.add(servicePort(port))
  throw new Error('微信 IDE 登录或服务异常；本进程停止后续项目请求，保留现场与登录态，请恢复后重新预检。')
}

/** 只允许已有 IDE 服务的三个项目操作；不暴露登录、票据、清缓存或全局退出入口。 */
export async function wechatRequest(port: string | number, operation: Operation, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const actualPort = servicePort(port)
  if (blocked.has(actualPort)) {
    blockWechatService(actualPort)
  }
  if (!['isLogin', 'auto', 'close'].includes(operation.kind)) {
    throw new Error('E2E 不允许此微信 IDE 服务操作。')
  }
  const origin = `http://127.0.0.1:${actualPort}`
  let endpoint = new URL(`/v2/${operation.kind}`, origin)
  const project = operation.kind === 'isLogin' ? undefined : path.resolve(operation.project)
  const autoPort = operation.kind === 'auto' ? servicePort(operation.port) : undefined
  let lease: ProjectBinding | undefined
  if (operation.kind !== 'isLogin') {
    if (!operation.project.trim()) {
      throw new Error('微信 IDE 操作必须指定本次测试的项目路径。')
    }
    // 官方服务在解析 query 后还会解码一次，必须保留路径中的字面量 % 等字符。
    endpoint.searchParams.set('project', encodeURIComponent(project!))
    if (operation.kind === 'auto') {
      const previous = projects.get(project!)
      if (previous && previous.servicePort !== actualPort) {
        throw new Error('微信项目的 HTTP 服务绑定已改变；必须清理原会话后重新预检。')
      }
      const previousAutoPort = previous?.autoPort
      if (previousAutoPort && previousAutoPort !== autoPort) {
        throw new Error('微信项目的自动化端口已改变；必须清理原会话后重新预检。')
      }
      if (previous || pendingProjects.has(project!)) {
        throw new Error('微信项目已有活跃会话；必须先清理原会话后重新打开。')
      }
      const occupied = serviceLeases.get(actualPort)
      if (occupied || pendingServices.has(actualPort)) {
        throw new Error('稳定版微信 IDE 的运行时资源按 HTTP 服务共享；同一服务已有本轮项目，必须先清理后再打开其他项目。')
      }
      const runId = `${process.pid}-${++nextRunId}`
      pendingProjects.add(project!)
      pendingServices.add(actualPort)
      let release: () => Promise<void>
      try {
        release = await acquireServiceLease(actualPort, project!, runId)
      }
      catch (error) {
        pendingProjects.delete(project!)
        pendingServices.delete(actualPort)
        throw error
      }
      pendingProjects.delete(project!)
      pendingServices.delete(actualPort)
      lease = { servicePort: actualPort, autoPort: autoPort!, runId, opened: false, release }
      serviceLeases.set(actualPort, lease)
      // 在请求发出前登记归属，使超时或协议错误仍能沿原服务边界诊断和清理。
      projects.set(project!, lease)
      // 稳定版同时要求 port 与 autoPort；只传 autoPort 会返回 HTTP 200/窗口 ID，却不监听 WebSocket。
      endpoint.searchParams.set('port', String(autoPort!))
      endpoint.searchParams.set('autoPort', String(autoPort!))
    }
    else {
      const binding = projects.get(project!)
      if (!binding) {
        throw new Error('未登记本轮微信项目与 HTTP 服务的归属，保留 IDE，不关闭其他项目。')
      }
      if (binding.servicePort !== actualPort) {
        throw new Error('微信项目的 HTTP 服务绑定已改变；必须清理原会话后重新预检。')
      }
      const leaseOwner = serviceLeases.get(actualPort)
      if (!leaseOwner || leaseOwner.runId !== binding.runId) {
        throw new Error('微信项目租约不属于本轮请求，保留 IDE，不关闭其他项目。')
      }
      lease = binding
    }
  }
  return enqueue(actualPort, async () => {
    if (blocked.has(actualPort)) {
      blockWechatService(actualPort)
    }
    const signal = AbortSignal.timeout(timeoutMs)
    const token = process.env.WECHAT_DEVTOOLS_CLI_TOKEN
    for (let redirects = 0; redirects < 32; redirects++) {
      let response: Response
      try {
        response = await fetch(endpoint, { redirect: 'manual', signal, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      }
      catch {
        blocked.add(actualPort)
        throw new Error(`微信 IDE 已有服务不可用或超时（${operation.kind}）；保留登录态，不启动或重启 IDE。`)
      }
      if (response.status === 303) {
        try {
          const location = response.headers.get('location')
          const next = location && new URL(location, endpoint)
          if (!next || next.origin !== origin || !next.pathname.startsWith('/v2/taskresult/')) {
            throw new Error('不受支持的任务重定向')
          }
          await response.body?.cancel()
          endpoint = next
        }
        catch {
          blocked.add(actualPort)
          await response.body?.cancel().catch(() => {})
          throw new Error('微信 IDE 返回不受支持的任务重定向。')
        }
        continue
      }
      const result: unknown = await response.json().catch(() => undefined)
      const stableWindowId = operation.kind === 'auto' && typeof result === 'string' && /^s\d+$/.test(result) ? result : undefined
      const validObject = !!result && typeof result === 'object' && !Array.isArray(result)
      if (!response.ok || (!validObject && !stableWindowId) || (validObject && ((result as Record<string, unknown>).code || (result as Record<string, unknown>).error || (result as Record<string, unknown>).success === false))) {
        blocked.add(actualPort)
        // 不回显可能包含凭据的服务端正文，保留状态码供定位。
        throw new Error(`微信 IDE ${operation.kind} 失败（HTTP ${response.status}）；请检查 IDE 认证/项目授权，E2E 不会登录、刷新票据或重试账号操作。`)
      }
      if (operation.kind === 'auto') {
        const objectResult = validObject ? result as Record<string, unknown> : undefined
        if (objectResult && 'autoPort' in objectResult) {
          let responseAutoPort: number
          try {
            responseAutoPort = servicePort(objectResult.autoPort as string | number)
          }
          catch {
            blocked.add(actualPort)
            throw new Error('微信 IDE 自动化端口回执无效；拒绝连接旧会话。')
          }
          if (responseAutoPort !== autoPort) {
            blocked.add(actualPort)
            throw new Error('微信 IDE 自动化端口回执与本轮请求不一致；拒绝连接旧会话。')
          }
        }
        lease!.opened = true
        return validObject
          ? { ...objectResult, autoPort: autoPort! }
          : { autoPort: autoPort!, windowId: stableWindowId }
      }
      if (operation.kind === 'close') {
        const currentLease = projects.get(project!)
        if (currentLease?.runId === lease?.runId) {
          await currentLease.release()
          projects.delete(project!)
        }
        if (serviceLeases.get(actualPort)?.runId === currentLease?.runId) {
          serviceLeases.delete(actualPort)
        }
        return result as Record<string, unknown>
      }
      return result as Record<string, unknown>
    }
    blocked.add(actualPort)
    throw new Error('微信 IDE 异步任务重定向过多，停止本轮操作。')
  })
}

export async function assertWechatLogin(port: string | number, timeoutMs?: number) {
  if ((await wechatRequest(port, { kind: 'isLogin' }, timeoutMs)).login !== true) {
    blocked.add(servicePort(port))
    throw new Error('微信 IDE 登录未确认；请在已有 IDE 中完成登录。E2E 不会自动登录、注销或刷新票据。')
  }
}

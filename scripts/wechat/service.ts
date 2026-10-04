import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
const blocked = new Set<number>()
interface ProjectLease {
  port: number
  runId: string
}
const projects = new Map<string, ProjectLease>()
const serviceQueues = new Map<number, Promise<void>>()
let nextRunId = 0

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
  const lease = projects.get(path.resolve(project))
  if (!lease) {
    throw new Error('未登记本轮微信项目与 HTTP 服务的归属，保留 IDE，不重新发现或关闭其他会话。')
  }
  return String(lease.port)
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
  const projectPath = operation.kind === 'isLogin' ? undefined : path.resolve(operation.project)
  if (projectPath !== undefined && !operation.project.trim()) {
    throw new Error('微信 IDE 操作必须指定本次测试的项目路径。')
  }

  // 在进入队列前登记项目，阻止不同 HTTP 服务同时取得同一项目的归属。
  // 该登记故意早于网络请求：超时或服务异常后仍需保留原服务身份供诊断和清理。
  let lease: ProjectLease | undefined
  if (operation.kind === 'auto') {
    const previous = projects.get(projectPath!)
    if (previous && previous.port !== actualPort) {
      throw new Error('微信项目的 HTTP 服务绑定已改变；必须清理原会话后重新预检。')
    }
    if (previous) {
      throw new Error('微信项目已有活跃会话；必须先清理原会话后重新打开。')
    }
    lease = { port: actualPort, runId: `${process.pid}-${++nextRunId}` }
    projects.set(projectPath!, lease)
  }
  else if (operation.kind === 'close') {
    lease = projects.get(projectPath!)
    if (!lease) {
      throw new Error('未登记本轮微信项目与 HTTP 服务的归属，保留 IDE，不关闭其他会话。')
    }
    if (lease.port !== actualPort) {
      throw new Error('微信项目的 HTTP 服务绑定已改变；必须使用原服务清理本轮会话。')
    }
  }

  return enqueue(actualPort, async () => {
    if (blocked.has(actualPort)) {
      blockWechatService(actualPort)
    }
    const origin = `http://127.0.0.1:${actualPort}`
    let endpoint = new URL(`/v2/${operation.kind}`, origin)
    if (projectPath !== undefined) {
      // 官方服务在解析 query 后还会解码一次，必须保留路径中的字面量 % 等字符。
      endpoint.searchParams.set('project', encodeURIComponent(projectPath))
      if (operation.kind === 'auto') {
        endpoint.searchParams.set('autoPort', String(servicePort(operation.port)))
      }
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
      const result = await response.json().catch(() => undefined)
      if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result) || result.code || result.error || result.success === false) {
        blocked.add(actualPort)
        // 不回显可能包含凭据的服务端正文，保留状态码供定位。
        throw new Error(`微信 IDE ${operation.kind} 失败（HTTP ${response.status}）；请检查 IDE 认证/项目授权，E2E 不会登录、刷新票据或重试账号操作。`)
      }
      if (operation.kind === 'close' && projects.get(projectPath!)?.runId === lease?.runId) {
        projects.delete(projectPath!)
      }
      return result
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

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { assertServerIdentity } from './identity'

export interface AttachedWebServer {
  baseUrl: string
  runId: string
  instanceId?: string
  channel: 'stable' | 'alpha'
  logFile: string
  artifactRoot: string
  writeSource: (file: string, content: string) => Promise<void>
  assertOwned: () => Promise<void>
}

export function validateAttachedUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('连接地址必须为本机 HTTP 服务根地址')
  }
  return url.href
}

export async function readAttachedLog(server: Pick<AttachedWebServer, 'logFile' | 'runId' | 'channel'>) {
  const log = await readFile(server.logFile, 'utf8')
  if (!log.includes(`[wt-acceptance] ${server.runId}`)) {
    throw new Error('IDE 日志缺少本轮启动标识，请导出本次运行的完整控制台日志')
  }
  const prefix = `[wt-ide-version] ${server.runId} `
  const versions = log.split(/\r?\n/).filter(line => line.includes(prefix)).map(line => line.slice(line.indexOf(prefix) + prefix.length).trim())
  const version = versions[0]
  if (!version || versions.some(value => value !== version)
    || !/^5\.\d+\.\d+(?:-alpha)?$/.test(version) || version.includes('alpha') !== (server.channel === 'alpha')) {
    throw new Error('IDE 日志的版本或 channel 不匹配')
  }
  const compilers = [...log.matchAll(/(?:编译器版本：|Compiler version: )([\d.]+)\s*[（(]uni-app x[）)]\s*(\w+)模式/g)]
  if (!compilers.length || compilers.some(([, compiler, mode]) => !version.startsWith(`${compiler}.`) || mode !== 'VDOM')) {
    throw new Error('IDE 日志缺少匹配版本的 uni-app x VDOM 编译器')
  }
  return log
}

export async function checkAttachedIdentity(server: Pick<AttachedWebServer, 'baseUrl' | 'runId' | 'instanceId'>, root: string, identityPath: string, timeoutMs = 5000) {
  const response = await fetch(new URL(identityPath, validateAttachedUrl(server.baseUrl)), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
  if (!response.ok) {
    throw new Error(`服务身份请求失败：${response.status}`)
  }
  const identity = await response.json()
  assertServerIdentity(identity, root)
  if (identity.runId !== server.runId) {
    throw new Error('服务启动标识不匹配，请在准备源码后重新通过 IDE 启动')
  }
  if (typeof identity.instanceId !== 'string' || (server.instanceId && identity.instanceId !== server.instanceId)) {
    throw new Error('验收期间服务实例已更换')
  }
  return identity
}

/** 只等待新服务，不操作已有进程；单次请求也受剩余期限约束。 */
export async function waitForAttachedServer(server: AttachedWebServer, root: string, identityPath: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let error: unknown
  while (Date.now() < deadline) {
    await server.assertOwned()
    try {
      return await checkAttachedIdentity(server, root, identityPath, Math.max(1, Math.min(5000, deadline - Date.now())))
    }
    catch (cause) {
      error = cause
    }
    await delay(Math.min(250, Math.max(0, deadline - Date.now())))
  }
  throw new Error(`等待本轮 IDE 服务超时：${server.baseUrl}`, { cause: error })
}

export function assertLogOutsideProject(logFile: string, root: string) {
  const relative = path.relative(root, path.resolve(logFile))
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    throw new Error('IDE 日志请保存到项目源码目录之外，以免触发额外 HMR')
  }
}

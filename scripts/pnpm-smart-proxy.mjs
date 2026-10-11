import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const DEFAULT_PROXY_HOST = '127.0.0.1'
const DEFAULT_PROXY_PORT = 10808
const DEFAULT_PROXY_URL = `http://${DEFAULT_PROXY_HOST}:${DEFAULT_PROXY_PORT}`
const CONNECT_TIMEOUT_MS = 500
const UPDATE_COMMANDS = new Set(['up', 'update'])
const dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_MANIFEST_PATH = path.resolve(dirname, '../pnpm-workspace.yaml')

/** @typedef {(filePath: import('node:fs').PathLike, options: { encoding: BufferEncoding }) => string} ReadFileSyncImpl */
/** @typedef {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) => { status: number | null, error?: Error }} SpawnSyncImpl */

export const UPDATE_METADATA_CACHE_PATTERNS = ['*']

export function parseProxyUrl(value) {
  if (!value) {
    return {
      host: DEFAULT_PROXY_HOST,
      port: DEFAULT_PROXY_PORT,
      url: DEFAULT_PROXY_URL,
    }
  }

  const url = new URL(value)
  const fallbackPort = url.protocol === 'https:' ? 443 : 80

  return {
    host: url.hostname,
    port: Number(url.port || fallbackPort),
    url: value,
  }
}

export function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })

    socket.setTimeout(CONNECT_TIMEOUT_MS)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

/** 帮助参数只影响 pnpm 本身，双横线后的参数不参与此判断。 */
export function isHelpRequest(args) {
  const separator = args.indexOf('--')
  const options = separator === -1 ? args : args.slice(0, separator)
  return commandFromArgs(options) === 'help' || options.some(arg => arg === '--help' || arg === '-h')
}

/** 跳过带值的全局选项，定位 help 命令而非过滤器中的同名包。 */
function commandFromArgs(args) {
  const valuedOptions = new Set(['--dir', '-C', '--filter', '--filter-prod', '-F', '--registry', '--store-dir', '--global-dir', '--config-dir', '--reporter', '--loglevel', '--workspace-concurrency'])
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') {
      return undefined
    }
    if (valuedOptions.has(arg)) {
      index++
      continue
    }
    if (!arg.startsWith('-')) {
      return arg
    }
  }
}

export function shouldRefreshMetadataCache(args) {
  return !isHelpRequest(args) && args.some(arg => UPDATE_COMMANDS.has(arg))
}

/** Windows 没有 POSIX 信号转发，按本层持有的子进程 PID 定向终止整棵树。 */
export function terminateChild(child, signal, platform = process.platform, spawnSyncImpl = spawnSync) {
  if (platform !== 'win32') {
    return child.kill(signal)
  }
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return false
  }
  const result = spawnSyncImpl('taskkill', ['/pid', String(child.pid), '/t', '/f'], { timeout: 5000, windowsHide: true, stdio: 'ignore' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`子进程树 ${child.pid} 终止失败，退出码：${result.status}`)
  }
  return true
}

/** 逐层转发中断，子进程关闭或启动失败后释放本层监听。 */
export function forwardChildSignals(child, parent = process) {
  const interrupt = () => terminateChild(child, 'SIGINT')
  const terminate = () => terminateChild(child, 'SIGTERM')
  const cleanup = () => {
    parent.off('SIGINT', interrupt)
    parent.off('SIGTERM', terminate)
  }
  parent.on('SIGINT', interrupt)
  parent.on('SIGTERM', terminate)
  child.once('error', cleanup)
  child.once('close', cleanup)
  return cleanup
}

/**
 * @param {{ readFileSyncImpl?: ReadFileSyncImpl, workspaceManifestPath?: string }} options
 */
export function readUpdateIgnoreDeps({
  readFileSyncImpl = fs.readFileSync,
  workspaceManifestPath = WORKSPACE_MANIFEST_PATH,
} = {}) {
  const workspace = YAML.parse(readFileSyncImpl(workspaceManifestPath, 'utf8'))
  const ignoreDeps = workspace?.update?.ignoreDeps

  if (!Array.isArray(ignoreDeps) || !ignoreDeps.every(dependency => typeof dependency === 'string')) {
    throw new TypeError('pnpm-workspace.yaml 中的 update.ignoreDeps 必须是字符串数组')
  }

  return ignoreDeps
}

export function appendUpdateIgnoreSelectors(args, ignoreDeps) {
  if (!shouldRefreshMetadataCache(args)) {
    return [...args]
  }

  const existingSelectors = new Set(args)
  const packageScoped = isWeappPackageScopedUpdate(args)
  const ignoreSelectors = ignoreDeps
    .filter(dependency => !(packageScoped && isBabelIgnoreSelector(dependency)))
    .map(dependency => `!${dependency}`)
    .filter(selector => !existingSelectors.has(selector))

  return [...args, ...ignoreSelectors]
}

/** 判断更新是否明确限定在本仓库可独立升级的包。 */
export function isWeappPackageScopedUpdate(args) {
  const selectors = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--filter' || arg === '-F') {
      if (args[index + 1]) {
        selectors.push(args[index + 1])
      }
      index += 1
    }
    else if (arg.startsWith('--filter=')) {
      selectors.push(arg.slice('--filter='.length))
    }
    else if (arg.startsWith('-F')) {
      selectors.push(arg.slice(2))
    }
  }

  const includedSelectors = selectors.filter(selector => !selector.startsWith('!'))
  return includedSelectors.length > 0 && includedSelectors.every(selector => (
    selector === 'packages'
    || selector === 'packages-runtime'
    || selector === './packages'
    || selector === './packages-runtime'
    || selector.startsWith('packages/')
    || selector.startsWith('packages-runtime/')
    || selector.startsWith('./packages/')
    || selector.startsWith('./packages-runtime/')
    || selector.startsWith('@weapp-tailwindcss/')
  ))
}

function isBabelIgnoreSelector(selector) {
  return selector === '@babel/*' || selector === 'babel-*'
}

export function createPnpmEnv(sourceEnv, { proxyAvailable, proxy }) {
  const env = {
    ...sourceEnv,
    npm_config_proxy: proxyAvailable ? proxy.url : '',
    npm_config_https_proxy: proxyAvailable ? proxy.url : '',
    npm_config_noproxy: 'localhost,127.0.0.1,::1',
  }

  delete env.HTTP_PROXY
  delete env.HTTPS_PROXY
  delete env.ALL_PROXY
  delete env.http_proxy
  delete env.https_proxy
  delete env.all_proxy

  return env
}

/**
 * @param {{ spawnSyncImpl?: SpawnSyncImpl }} options
 */
export function refreshUpdateMetadataCache({ spawnSyncImpl = spawnSync } = {}) {
  console.log('[pnpm-smart-proxy] 更新前刷新 pnpm metadata cache')

  const result = spawnSyncImpl('pnpm', ['cache', 'delete', ...UPDATE_METADATA_CACHE_PATTERNS], {
    shell: false,
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  if (result.error) {
    console.error('[pnpm-smart-proxy] 刷新 pnpm metadata cache 失败：', result.error)
    return false
  }

  if (result.status !== 0) {
    console.error(`[pnpm-smart-proxy] 刷新 pnpm metadata cache 失败，退出码：${result.status ?? 1}`)
    return false
  }

  return true
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  spawnImpl = spawn,
  spawnSyncImpl = spawnSync,
  canConnectImpl = canConnect,
} = {}) {
  const isUpdateCommand = shouldRefreshMetadataCache(argv)
  // pnpm 11.24 尚未把 workspace 的 update 配置传入 update 命令，需显式追加负向 selector。
  const pnpmArgs = isUpdateCommand
    ? appendUpdateIgnoreSelectors(argv, readUpdateIgnoreDeps())
    : argv

  if (isUpdateCommand && !refreshUpdateMetadataCache({ spawnSyncImpl })) {
    process.exit(1)
  }

  const proxy = parseProxyUrl(env.PNPM_SMART_PROXY_URL)
  const proxyAvailable = await canConnectImpl(proxy)
  const proxyArgs = proxyAvailable
    ? [`--config.proxy=${proxy.url}`, `--config.https-proxy=${proxy.url}`]
    : ['--config.proxy=', '--config.https-proxy=']

  console.log(
    proxyAvailable
      ? `[pnpm-smart-proxy] 使用本地代理：${proxy.url}`
      : `[pnpm-smart-proxy] 本地代理未开放，直连 registry：${proxy.host}:${proxy.port}`,
  )

  const child = spawnImpl('pnpm', [...proxyArgs, ...pnpmArgs], {
    env: createPnpmEnv(env, { proxyAvailable, proxy }),
    shell: false,
    stdio: 'inherit',
  })
  forwardChildSignals(child)

  child.once('error', (error) => {
    console.error(error)
    process.exit(1)
  })

  child.once('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 1)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}

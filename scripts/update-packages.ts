import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { forwardChildSignals, isHelpRequest } from './pnpm-smart-proxy.mjs'
import { writeIntent } from './update-packages/intent'
import { compareSnapshots, readSnapshot } from './update-packages/snapshot'

const root = fileURLToPath(new URL('../', import.meta.url))
const proxyScript = fileURLToPath(new URL('./pnpm-smart-proxy.mjs', import.meta.url))

interface UpdateResult {
  code: number | null
  signal: NodeJS.Signals | null
}

/** 沿用代理入口，保留交互终端、参数、退出状态和中断信号。 */
export function runProxy(args: string[], cwd: string, script = proxyScript): Promise<UpdateResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: 'inherit', shell: false })
    const cleanup = forwardChildSignals(child)
    child.once('error', (error) => {
      cleanup()
      reject(error)
    })
    child.once('close', (code, signal) => {
      cleanup()
      resolve({ code, signal })
    })
  })
}

export async function updatePackages(args: string[], {
  cwd = root,
  run = runProxy,
  logger = { info: (message: string) => process.stdout.write(`${message}\n`), error: (message: string) => process.stderr.write(`${message}\n`) },
}: {
  cwd?: string
  run?: (args: string[], cwd: string) => Promise<UpdateResult>
  logger?: { info: (message: string) => unknown, error: (message: string) => unknown }
} = {}): Promise<UpdateResult> {
  let updated = false
  try {
    if (isHelpRequest(args)) {
      return await run(args, cwd)
    }
    const before = await readSnapshot(cwd)
    const result = await run(args, cwd)
    if (result.code !== 0 || result.signal) {
      return result
    }
    updated = true
    const changes = compareSnapshots(before, await readSnapshot(cwd))
    const intent = await writeIntent(cwd, changes)
    logger.info(intent
      ? `[update-packages] 已为 ${changes.length} 个包新增 ${path.relative(cwd, intent)}`
      : '[update-packages] 发布包的直接依赖没有变化，无需新增 changeset')
    return result
  }
  catch (error) {
    logger.error(`[update-packages] ${updated ? '依赖可能已经更新，但 changeset 生成失败，请检查并补充记录' : '依赖更新失败'}：${error instanceof Error ? error.message : String(error)}`)
    return { code: 1, signal: null }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await updatePackages(process.argv.slice(2))
  if (result.signal) {
    process.kill(process.pid, result.signal)
  }
  else {
    process.exitCode = result.code ?? 1
  }
}

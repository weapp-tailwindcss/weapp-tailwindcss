import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const READY_RE = /开发服务已就绪|dev(?:elopment)? server ready|ready in \d+/i
const supportedWatchPlatforms = new Set(['weapp', 'web', 'all'])

export function isWatchReadyOutput(text) {
  return READY_RE.test(text)
}

export function resolveWatchPlatform(env = process.env) {
  const platform = env.WEAPP_VITE_E2E_WATCH_PLATFORM?.trim() || 'weapp'
  if (!supportedWatchPlatforms.has(platform)) {
    throw new Error(`Unsupported WEAPP_VITE_E2E_WATCH_PLATFORM: ${platform}`)
  }
  return platform
}

/** 解析当前项目安装的 CLI，直接交给同一个 Node，避免额外启动器切断退出回执。 */
async function resolveProjectCli(cwd) {
  const require = createRequire(path.resolve(cwd, 'package.json'))
  const manifestPath = require.resolve('weapp-vite/package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['weapp-vite']
  if (typeof bin !== 'string' || !bin) {
    throw new Error('Installed weapp-vite does not declare its CLI bin')
  }
  return path.resolve(path.dirname(manifestPath), bin)
}

/** 一个会话只有原生 dev 写入产物；关闭信号只转发一次，并等待实际 close 完成。 */
export async function runWeappViteWatch({
  cwd = process.cwd(),
  env = process.env,
  signals = process,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (env.WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK === '1') {
    throw new Error('WEAPP_VITE_E2E_WATCH_BUILD_FALLBACK=1 would create competing output writers; remove it and use native weapp-vite dev')
  }
  const platform = resolveWatchPlatform(env)
  const cli = await resolveProjectCli(cwd)

  await new Promise((resolve, reject) => {
    const dev = spawn(process.execPath, [cli, 'dev', '--platform', platform, '--no-mcp'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let ready = false
    let stopping = false
    let failure
    let exitReceipt

    const forward = (destination) => {
      let outputTail = ''
      return (text) => {
        destination.write(text)
        // 每条流独立保留 UTF-8 短缓冲，识别分片消息且不拼接 stdout 与 stderr。
        outputTail = `${outputTail}${text}`.slice(-1024)
        ready ||= isWatchReadyOutput(outputTail)
      }
    }
    const onStdout = forward(stdout)
    const onStderr = forward(stderr)
    dev.stdout.setEncoding('utf8').on('data', onStdout)
    dev.stderr.setEncoding('utf8').on('data', onStderr)

    const stop = (signal) => {
      if (stopping) {
        return
      }
      stopping = true
      try {
        dev.kill(signal)
      }
      catch (error) {
        failure ??= error
      }
    }
    const onInterrupt = () => stop('SIGINT')
    const onTerminate = () => stop('SIGTERM')
    signals.on('SIGINT', onInterrupt)
    signals.on('SIGTERM', onTerminate)

    dev.once('error', (error) => {
      failure = error
    })
    // exit 与 close 之间后代仍可能持有管道；迟到的取消不能改写已发生的意外退出。
    dev.once('exit', (code, signal) => {
      exitReceipt = { code, signal, stopping }
    })
    dev.once('close', (code, signal) => {
      signals.off('SIGINT', onInterrupt)
      signals.off('SIGTERM', onTerminate)
      dev.stdout.off('data', onStdout)
      dev.stderr.off('data', onStderr)
      if (failure) {
        reject(failure)
      }
      else if (!exitReceipt?.stopping || code !== 0 || signal !== null) {
        reject(new Error(`weapp-vite dev exited ${ready ? 'after' : 'before'} ready: ${signal ?? code}`))
      }
      else {
        resolve()
      }
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWeappViteWatch().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}

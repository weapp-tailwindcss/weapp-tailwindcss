import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { execa } from 'execa'

const appId = 'com.weapptailwindcss.rncompat'

interface LaunchOptions {
  device: string
  url: string
  artifacts: string
  deadline: number
}

interface LaunchDependencies {
  execute: (command: string, args: string[], timeout?: number) => Promise<string>
  now: () => number
  wait: (ms: number) => Promise<void>
}

export function iosLaunchTimeoutApplication(log: string, device: string, url: string) {
  const text = stripVTControlCharacters(log)
  const lines = text.split(/\r?\n/)
  const command = `xcrun simctl openurl ${device} ${url} exited with non-zero code: 60`
  const errorIndex = lines.indexOf(`Error: ${command}`)
  const buildIndex = lines.indexOf('› Build Succeeded')
  const openingIndex = lines.findIndex(line => line.startsWith('› Opening on ') && line.endsWith(`(${appId})`))
  if (errorIndex < 0
    || !text.includes('(domain=NSPOSIXErrorDomain, code=60)')
    || !text.includes('Operation timed out')
    || buildIndex < 0 || openingIndex <= buildIndex || errorIndex <= openingIndex) {
    throw new Error('Expo 失败不是本轮 iOS 应用安装后的精确深链超时')
  }
  const installed = [...text.matchAll(/^› Installing (.+\.app)\r?$/gm)]
  if (installed.length !== 1 || !path.isAbsolute(installed[0]![1]!)) {
    throw new Error('Expo 深链超时缺少唯一的本轮安装产物')
  }
  const installIndex = lines.indexOf(`› Installing ${installed[0]![1]}`)
  if (installIndex <= buildIndex || installIndex >= openingIndex) {
    throw new Error('Expo 构建、安装和深链错误的阶段顺序不一致')
  }
  return installed[0]![1]!
}

function runningPid(output: string) {
  const matches = output.split(/\r?\n/).flatMap((line) => {
    const [pid, , label] = line.trim().split(/\s+/)
    return pid && /^[1-9]\d*$/.test(pid) && label?.startsWith(`UIKitApplication:${appId}[`) ? [Number(pid)] : []
  })
  if (matches.length > 1) {
    throw new Error('本轮 iOS 应用存在多个运行 PID，拒绝补发深链')
  }
  return matches[0]
}

/** 只核对本轮已发出的启动请求；一次补发不终止应用，也不重建或扩大启动预算。 */
export function createIosLaunchReconciler(options: LaunchOptions, overrides: Partial<LaunchDependencies> = {}) {
  const dependencies: LaunchDependencies = {
    now: Date.now,
    wait: async (ms) => { await setTimeout(ms) },
    execute: async (command, args, timeout = 30_000) => {
      const remaining = options.deadline - Date.now()
      if (remaining <= 0) {
        throw new Error('iOS 启动预算已耗尽')
      }
      return (await execa(command, args, { timeout: Math.min(timeout, remaining) })).stdout
    },
    ...overrides,
  }
  let pending: Promise<void> | undefined
  const reconcile = async () => {
    const { device, url, artifacts, deadline } = options
    const { execute, now, wait } = dependencies
    const log = await fs.readFile(path.join(artifacts, 'expo-run.log'), 'utf8')
    const application = iosLaunchTimeoutApplication(log, device, url)
    const evidence: Record<string, unknown> = { device, url, application, outcome: 'checking', initialError: 'NSPOSIXErrorDomain:60' }
    const save = () => fs.writeFile(path.join(artifacts, 'ios-launch-reconciliation.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    await save()
    try {
      if (now() >= deadline) {
        throw new Error('iOS 启动预算已耗尽')
      }
      const container = (await execute('xcrun', ['simctl', 'get_app_container', device, appId, 'app'])).trim()
      const executable = (await execute('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(application, 'Info.plist')])).trim()
      if (!path.isAbsolute(container) || !executable || path.basename(executable) !== executable) {
        throw new Error('本轮 iOS 应用容器或可执行文件身份无效')
      }
      // Debug 主程序可能只是加载壳，必须同时绑定实际应用 dylib 和 Info.plist。
      const files = (await fs.readdir(application)).filter(name => name === executable || name === 'Info.plist' || name.endsWith('.dylib')).sort()
      const installedFiles = (await fs.readdir(container)).filter(name => name === executable || name === 'Info.plist' || name.endsWith('.dylib')).sort()
      const hashes = await Promise.all([application, container].map(async (directory) => {
        const result: Record<string, string> = {}
        for (const name of files) {
          result[name] = createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')
        }
        return result
      }))
      if (JSON.stringify(files) !== JSON.stringify(installedFiles) || JSON.stringify(hashes[0]) !== JSON.stringify(hashes[1])) {
        throw new Error('模拟器内的应用与本轮安装产物不一致')
      }
      evidence.binarySha256 = hashes[0]
      evidence.container = container
      // LaunchServices 可先返回超时，再完成既有请求；短暂只读等待该应用 PID 收敛。
      const convergeBy = Math.min(deadline, now() + 15_000)
      let pid: number | undefined
      while (now() < convergeBy) {
        pid = runningPid(await execute('xcrun', ['simctl', 'spawn', device, 'launchctl', 'list'], convergeBy - now()))
        if (pid) {
          break
        }
        await wait(Math.min(500, Math.max(0, convergeBy - now())))
      }
      if (!pid || now() >= convergeBy) {
        throw new Error('本轮 iOS 应用未在既有启动预算内运行，拒绝补发深链')
      }
      const executablePath = (await execute('ps', ['-ww', '-p', String(pid), '-o', 'comm='])).trim()
      if (await fs.realpath(executablePath) !== await fs.realpath(path.join(container, executable))) {
        throw new Error('运行 PID 不属于本轮安装容器，拒绝补发深链')
      }
      evidence.pid = pid
      evidence.executablePath = executablePath
      evidence.outcome = 'retrying-deep-link'
      await save()
      await execute('xcrun', ['simctl', 'openurl', device, url])
      evidence.outcome = 'reconciled'
      await save()
    }
    catch (error) {
      evidence.outcome = 'failed'
      evidence.error = String(error)
      await save()
      throw error
    }
  }
  // baseline 与后续 HMR 共用同一结果；原子进程退出码及首次日志保持原样。
  return () => pending ??= reconcile()
}

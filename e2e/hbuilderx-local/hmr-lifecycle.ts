import type { ChildProcess } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { StringDecoder } from 'node:string_decoder'
import { setTimeout } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'

export type AppUpdateMode = 'hmr' | 'native-reload'

export function classifyHmrStep(output: string) {
  const text = stripVTControlCharacters(output)
  if (text.includes('热更新失败')) {
    return 'failed'
  }
  if (/安装\s*\.hap\s*到|正在安装(?:HBuilder|uni-app x)调试基座|(?:HBuilder|uni-app x)调试基座安装成功/.test(text)) {
    return 'reinstalled'
  }
  if (text.includes('App Launch')) {
    return 'restarted'
  }
  return text.includes('热更新完成') ? 'updated' : 'pending'
}

/** 在首次运行完成后、源码写入前监听，保留本轮全部日志，避免滚动窗口丢失失败。 */
export function observeHmrStep(
  child: ChildProcess,
  platform: 'app-android' | 'app-ios' | 'app-harmony' = 'app-harmony',
  mode: AppUpdateMode = 'hmr',
) {
  const outputs = { stdout: '', stderr: '' }
  let overflow = false
  let runtimeVerified = false
  let verifiedTransfer: string | undefined
  let orderedOutput = ''
  const subscribe = (name: 'stdout' | 'stderr') => {
    const decoder = new StringDecoder('utf8')
    const receive = (chunk: Buffer | string) => {
      if (overflow) {
        return
      }
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk)
      outputs[name] += text
      if (platform === 'app-ios') {
        orderedOutput += text
      }
      overflow = Buffer.byteLength(outputs.stdout) + Buffer.byteLength(outputs.stderr) > 32 * 1024 * 1024
    }
    child[name]?.on('data', receive)
    return () => child[name]?.off('data', receive)
  }
  const subscriptions = [subscribe('stdout'), subscribe('stderr')]
  const output = () => `${outputs.stdout}\n${outputs.stderr}`
  const modeLabel = mode === 'native-reload' ? '原生热重载' : '纯 HMR'
  const readIosTransfer = () => {
    const text = stripVTControlCharacters(orderedOutput)
    const started = Math.max(text.lastIndexOf('开始差量编译'), text.lastIndexOf('开始编译'))
    const compiled = text.lastIndexOf('编译成功')
    const synced = text.lastIndexOf('同步手机端程序文件成功')
    return started >= 0 && compiled > started && synced > compiled ? `${started}:${compiled}:${synced}` : undefined
  }
  const hasCurrentRuntimeEvidence = () => runtimeVerified && verifiedTransfer === readIosTransfer()
  const state = () => {
    const observed = classifyHmrStep(output())
    return platform === 'app-ios' && (observed === 'pending' || observed === 'updated')
      ? hasCurrentRuntimeEvidence() ? 'updated' : 'pending'
      : observed
  }
  const snapshot = () => ({
    mode,
    state: state(),
    appLaunchCount: stripVTControlCharacters(output()).match(/App Launch/g)?.length ?? 0,
    ...(platform === 'app-ios' ? { runtimeVerified: hasCurrentRuntimeEvidence() } : {}),
  })
  const assertNoFallback = () => {
    if (overflow) {
      throw new Error(`${modeLabel} 单轮日志超过 32 MiB，不能确认运行结果`)
    }
    const state = classifyHmrStep(output())
    if (state !== 'pending' && state !== 'updated' && !(mode === 'native-reload' && state === 'restarted')) {
      const reason = mode === 'native-reload' ? '更新失败或重装不能计作原生热重载' : '增量重启或重装不能计作保持运行状态的更新'
      throw new Error(`${modeLabel} 验收失败：${state}；${reason}\n${output()}`)
    }
    if (platform === 'app-ios' && runtimeVerified && !hasCurrentRuntimeEvidence()) {
      throw new Error(`iOS HMR 取证完成后出现新编译或同步，旧运行时证据已失效\n${output()}`)
    }
  }
  return {
    assertNoFallback,
    snapshot,
    nativeStopReason() {
      if (platform !== 'app-harmony') {
        return undefined
      }
      if (overflow) {
        return 'Harmony 本轮更新日志超过 32 MiB，已丢失停止期间的完整证据'
      }
      const text = stripVTControlCharacters(output())
      const observed = classifyHmrStep(text)
      return observed === 'failed' || observed === 'reinstalled' || text.includes('开始构建鸿蒙工程')
        ? `Harmony 本轮更新已进入 ${observed} / native fallback，缺少按 session 的停止完成证明`
        : undefined
    },
    async waitForCompletion<T>(timeoutMs: number, ensureRunning: () => void, verifyRuntime?: (remainingMs: number) => Promise<T>): Promise<T | undefined> {
      // Android 由调用方的运行时探针确认；iOS 必须把设备取证纳入完成契约。
      if (platform === 'app-android') {
        ensureRunning()
        assertNoFallback()
        return
      }
      if (platform === 'app-ios' && !verifyRuntime) {
        throw new Error('iOS HMR 缺少运行时验证：中间产物与同步日志不能证明设备已更新')
      }
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        ensureRunning()
        assertNoFallback()
        if (platform === 'app-ios') {
          const transfer = readIosTransfer()
          if (transfer) {
            assertNoFallback()
            const evidence = await verifyRuntime!(Math.max(1, timeoutMs - (Date.now() - startedAt)))
            ensureRunning()
            assertNoFallback()
            if (readIosTransfer() !== transfer) {
              continue
            }
            verifiedTransfer = transfer
            runtimeVerified = true
            return evidence
          }
        }
        else if (classifyHmrStep(output()) === 'updated') {
          return
        }
        await setTimeout(100)
      }
      throw new Error(`${platform === 'app-ios' ? 'iOS 产物更新后未收到当轮编译与同步完成日志' : '产物更新后未收到 HBuilderX 热更新完成日志'}\n${output()}`)
    },
    dispose() {
      subscriptions.forEach(dispose => dispose())
    },
  }
}

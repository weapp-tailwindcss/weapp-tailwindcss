import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'

/** 先取得原生 polling 采样回执，再恢复元数据并核对实际构建；注册句柄不等于采样就绪。 */
export async function preparePollingBaseline({ raw, initialTime, fixedTime, publish, readOutput, isIdle, timeoutMs = 5000, now = () => performance.now(), pause = () => setTimeout(10) }) {
  if (initialTime === fixedTime) {
    throw new Error('polling readiness 的初始与恢复标识必须不同')
  }
  const deadline = now() + timeoutMs
  const offset = raw.length
  const probes = new Set([initialTime])
  let nextTime = fixedTime + 1000
  let stage = 'native-baseline'
  const checkDeadline = () => {
    if (now() >= deadline) {
      throw new Error(`polling readiness 超时：${stage}；${JSON.stringify({ probes: [...probes], raw: raw.slice(offset).map(({ curr, prev }) => ({ curr: curr.mtimeMs, prev: prev.mtimeMs })) })}`)
    }
  }
  const acknowledged = () => raw.slice(offset).some(({ curr, prev }) => curr.mtimeMs !== initialTime && probes.has(curr.mtimeMs) && probes.has(prev.mtimeMs))
  while (!acknowledged()) {
    checkDeadline()
    const probe = nextTime
    nextTime += 1000
    probes.add(probe)
    await publish(probe)
    checkDeadline()
    await pause()
  }
  checkDeadline()
  stage = 'restore-metadata'
  await publish(fixedTime)
  checkDeadline()
  while (!raw.slice(offset).some(({ curr, prev }) => curr.mtimeMs === fixedTime && probes.has(prev.mtimeMs))) {
    checkDeadline()
    await pause()
  }
  stage = 'restore-build'
  while (true) {
    checkDeadline()
    if (!isIdle()) {
      await pause()
      continue
    }
    const output = await readOutput()
    checkDeadline()
    if (output.default === 0 && output.observedMtime === fixedTime && isIdle()) {
      return
    }
    await pause()
  }
}

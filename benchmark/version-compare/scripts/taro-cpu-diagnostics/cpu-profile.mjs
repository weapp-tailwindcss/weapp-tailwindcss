/** 校验采集结构并单独报告原始采样时间性质，不修正 V8 数据。 */
export function describeCpuProfileTiming(profile) {
  if (!profile || !Array.isArray(profile.nodes) || !Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas) || !Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime) || profile.endTime < profile.startTime || profile.samples.length !== profile.timeDeltas.length) {
    throw new Error('主进程 CPU profile 协议不完整')
  }
  const durationUs = profile.endTime - profile.startTime
  if (!Number.isFinite(durationUs)) {
    throw new TypeError('主进程 CPU profile 协议不完整')
  }
  let elapsedUs = 0
  let negativeDeltaCount = 0
  let minimumDeltaUs = null
  for (const delta of profile.timeDeltas) {
    // 固定 Node/V8 协议写出有符号 int；负整数并不自动代表证据损坏。
    if (!Number.isInteger(delta) || delta < -2147483648 || delta > 2147483647) {
      throw new Error('主进程 CPU profile 协议不完整')
    }
    elapsedUs += delta
    if (!Number.isSafeInteger(elapsedUs) || elapsedUs < 0 || elapsedUs > durationUs) {
      throw new Error('主进程 CPU profile 采样时间越出起止范围')
    }
    if (minimumDeltaUs === null || delta < minimumDeltaUs) {
      minimumDeltaUs = delta
    }
    if (delta < 0) {
      negativeDeltaCount++
    }
  }
  return {
    source: 'raw-v8-timeDeltas',
    unit: 'microseconds',
    monotonic: negativeDeltaCount === 0,
    negativeDeltaCount,
    minimumDeltaUs,
    correction: 'none',
    attribution: 'unknown',
  }
}

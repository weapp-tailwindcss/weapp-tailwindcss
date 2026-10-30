import { expect, it } from 'vitest'
import { describeCpuProfileTiming } from '../scripts/taro-cpu-diagnostics/cpu-profile.mjs'

function profile(deltas = [10, 20, 30]) {
  return {
    nodes: [{ id: 1, callFrame: { functionName: 'fixture', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 } }],
    samples: deltas.map(() => 1),
    timeDeltas: deltas,
    startTime: 0,
    endTime: 2000,
  }
}

it('保留真实 Node profile 的负时间差，采集完整不等于采样时间单调', () => {
  // 来自 PID9904 主进程原始 profile 的 3715–3719 样本；不把片段当业务窗口。
  const captured = profile([71, 571, -7, 572, 134])
  const original = JSON.stringify(captured)
  expect(describeCpuProfileTiming(captured)).toEqual({
    source: 'raw-v8-timeDeltas',
    unit: 'microseconds',
    monotonic: false,
    negativeDeltaCount: 1,
    minimumDeltaUs: -7,
    correction: 'none',
    attribution: 'unknown',
  })
  expect(JSON.stringify(captured)).toBe(original)
})

it('普通非负时间差保持原始顺序并报告单调性', () => {
  expect(describeCpuProfileTiming(profile([0, 10, 20]))).toMatchObject({
    monotonic: true,
    negativeDeltaCount: 0,
    minimumDeltaUs: 0,
    correction: 'none',
    attribution: 'unknown',
  })
})

it.each([
  ['nodes 缺失', (value) => { delete value.nodes }],
  ['samples 缺失', (value) => { delete value.samples }],
  ['timeDeltas 缺失', (value) => { delete value.timeDeltas }],
  ['长度不一致', (value) => { value.samples.pop() }],
  ['起点非有限', (value) => { value.startTime = Number.NaN }],
  ['终点非有限', (value) => { value.endTime = Number.POSITIVE_INFINITY }],
  ['结束早于开始', (value) => { value.endTime = -1 }],
  ['非有限时间差', (value) => { value.timeDeltas[1] = Number.NaN }],
  ['负无穷时间差', (value) => { value.timeDeltas[1] = Number.NEGATIVE_INFINITY }],
  ['非数字时间差', (value) => { value.timeDeltas[1] = '20' }],
  ['正小数时间差', (value) => { value.timeDeltas[1] = 0.5 }],
  ['负小数时间差', (value) => { value.timeDeltas[1] = -0.5 }],
  ['负超大有限时间差', (value) => { value.timeDeltas[1] = -1e100 }],
  ['正超大有限时间差', (value) => { value.timeDeltas[1] = 1e100 }],
  ['小于 int32 下限', (value) => { value.timeDeltas[1] = -2147483649 }],
  ['大于 int32 上限', (value) => { value.timeDeltas[1] = 2147483648 }],
  ['起止差溢出', (value) => {
    value.startTime = -Number.MAX_VALUE
    value.endTime = Number.MAX_VALUE
  }],
])('结构损坏仍拒绝：%s', (_label, invalidate) => {
  const captured = profile()
  invalidate(captured)
  expect(() => describeCpuProfileTiming(captured)).toThrow('主进程 CPU profile 协议不完整')
})

it('有符号 int32 边界可以回退到起点，仍保持原始数据', () => {
  const captured = { ...profile([1, 2147483647, -2147483648]), endTime: 2147483648 }
  const original = JSON.stringify(captured)
  expect(describeCpuProfileTiming(captured)).toMatchObject({ monotonic: false, negativeDeltaCount: 1, minimumDeltaUs: -2147483648, correction: 'none' })
  expect(JSON.stringify(captured)).toBe(original)
})

it.each([{ deltas: [-1, 2] }, { deltas: [10, -11, 20] }, { deltas: [2001, -1] }])('每步累计时间都必须落在 profile 起止内，不能只看最终和：$deltas', ({ deltas }) => {
  expect(() => describeCpuProfileTiming(profile(deltas))).toThrow('采样时间越出起止范围')
})

it('非零绝对起点不改变微秒累计边界', () => {
  const captured = { ...profile([10, -7, 1997]), startTime: 259979081, endTime: 259981081 }
  expect(describeCpuProfileTiming(captured)).toMatchObject({ monotonic: false, negativeDeltaCount: 1, minimumDeltaUs: -7 })
})

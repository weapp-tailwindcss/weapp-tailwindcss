import { expect, it } from 'vitest'
import { parseObserverPreparation } from '../scripts/demo-e2e-workflow/process-observer/preparation'
import { observerPreparation } from './helpers/observer-preparation'

const identity = { pid: 424242, parent: 100, group: 0, started: '2026-10-29T00:00:00Z' }

it('同一真实本体快照包含有效出生身份和非零内存才允许结束准备', () => {
  expect(() => parseObserverPreparation(observerPreparation(identity), identity.pid)).not.toThrow()
})

it.each([
  undefined,
  {},
  { ...observerPreparation(identity), identities: [] },
  { ...observerPreparation(identity), identities: [identity, identity] },
  { ...observerPreparation(identity), identities: [{ ...identity, pid: 1 }] },
  { ...observerPreparation(identity), identities: [{ ...identity, started: 'invalid' }] },
  { ...observerPreparation(identity), memory: undefined },
  { ...observerPreparation(identity), memory: { rssMb: 0, maxProcessRssMb: 0, processCount: 0, topProcesses: [] } },
])('缺失或无效的本体身份与内存仍阻断业务：%j', (value) => {
  expect(() => parseObserverPreparation(value, identity.pid)).toThrow()
})

it.each([
  { rssMb: 0 },
  { maxProcessRssMb: 11 },
  { processCount: 2 },
  { topProcesses: [] },
  { topProcesses: [{ pid: 1, ppid: identity.parent, rssMb: 10 }] },
  { topProcesses: [{ pid: identity.pid, ppid: 1, rssMb: 10 }] },
  { topProcesses: [{ pid: identity.pid, ppid: identity.parent, rssMb: 11 }] },
])('本体快照与内存 PID、父身份或指标不一致仍阻断：%j', (difference) => {
  const value = observerPreparation(identity)
  expect(() => parseObserverPreparation({ ...value, memory: { ...value.memory, ...difference } }, identity.pid)).toThrow('准备内存与本体快照身份不一致')
})

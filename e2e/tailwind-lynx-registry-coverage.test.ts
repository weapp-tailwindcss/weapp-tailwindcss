import type { RunContext } from './tailwind-capabilities/context'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { loadInventory } from './tailwind-capabilities/inventory'
import { buildLynxCapabilityReport, lynxCaseContracts } from './tailwind-capabilities/lynx-adapter'

vi.mock('./tailwind-capabilities/identity', async (original) => {
  const module = await original<typeof import('./tailwind-capabilities/identity')>()
  return { ...module, capabilityIdentity: async () => ({
    sourceHash: 'a'.repeat(64),
    lockfileHash: 'b'.repeat(64),
    catalogHash: 'c'.repeat(64),
    fixtureHash: 'd'.repeat(64),
    expectationsHash: 'e'.repeat(64),
    versions: { tailwindcss: '4.3.3' },
  }) }
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.each(['lynx-ios', 'lynx-android'] as const)('%s 为每个注册能力保留独立追踪，不以旧语义 ID 代替', async (target) => {
  const inventory = await loadInventory()
  const contracts = lynxCaseContracts(target)
  const features = new Set(contracts.flatMap(item => item.features))
  expect([...inventory.utilities, ...inventory.variants].filter(entry => !features.has(entry.id)).map(entry => entry.id)).toEqual([])
  expect(contracts.find(item => item.id === 'sizing-size')!.features).toContain('utility/functional/size')
  expect(contracts.find(item => item.id === 'layout-aspect')!.features).toContain('utility/functional/aspect')
  expect(contracts.find(item => item.id === 'layout-display')!.features).toEqual(['authoring/layout-display'])
  expect(new Set(contracts.map(item => item.id)).size).toBe(contracts.length)
})

it('未运行的注册能力没有原始结果时仍逐项归档缺口，不能降级为不支持', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lynx registry 中文 '))
  directories.push(root)
  const context: RunContext = { root, directory: root, runId: 'registry-coverage-current-run', startedAt: new Date().toISOString() }
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', undefined)
  const missing = contracts.filter(item => item.id.startsWith('inventory/'))
  expect(missing.some(item => item.id === 'inventory/variant/static/hover')).toBe(true)
  expect(missing.some(item => item.id === 'inventory/utility/static/grid')).toBe(true)
  for (const contract of missing) {
    expect(report.results.find(item => item.id === contract.id)).toMatchObject({
      status: 'not-run',
      support: 'supported',
      assertions: [],
      artifacts: [],
      reason: expect.stringContaining('独立 Lynx'),
    })
  }
  expect(report.environment.scopeGaps).toBe(missing.length)
})

it('新增注册项保留原始语法见证，带全局标志的案例过滤不会漏项', () => {
  const inventory = { utilities: [{ id: 'utility/functional/future-probe', witness: 'future-probe-[17px]' }], variants: [] }
  const contracts = lynxCaseContracts('lynx-ios', /^inventory\//g, inventory)
  expect(contracts).toHaveLength(1)
  expect(contracts[0]).toMatchObject({
    id: 'inventory/utility/functional/future-probe',
    candidate: 'future-probe-[17px]',
    features: ['utility/functional/future-probe'],
    fixture: 'missing-lynx-registry-runtime-fixture',
    expectation: { support: 'supported', stage: 'runtime' },
  })
})

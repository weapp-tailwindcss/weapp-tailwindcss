import { expect, it } from 'vitest'
import { repositoryPackageManager } from '../version-contract.mjs'
import { cases, coverage, requiredPhases } from './catalog.mjs'
import { verifyReports } from './gate.mjs'
import { productionEvidence } from './taro-production.fixture.mjs'

const productionProjects = ['taro-webpack-react-tailwindcss-v4', 'taro-webpack-vue3-tailwindcss-v4', 'taro-vite-react-tailwindcss-v4', 'taro-vite-vue3-tailwindcss-v4', 'issue-951-taro-vite-react-tailwindcss-v4']

it.each(productionProjects.flatMap(name => ['h5', 'harmony-hybrid'].map(target => [name, target])))('生产门禁拒绝缺证、错误样式和部分属性丢失：%s %s', (name, target) => {
  const item = cases.find(item => item.name === name && item.target === target)
  const result = { id: item.id, coverage: coverage(item), status: 'passed', rounds: Object.fromEntries(requiredPhases(item).map(phase => [phase, {}])), productionBrowser: productionEvidence(target) }
  const report = { sha: 'head', pnpm: repositoryPackageManager.version, node: 'v24.19.0', os: 'win32', expected: [item.id], results: [result] }
  const matrix = { include: [{ os: 'windows-latest', node: 24, cases: [item.id] }] }
  expect(verifyReports([report], matrix, 'head')).toBe(1)
  for (const mutate of [
    (value) => { delete value.productionBrowser },
    (value) => { value.productionBrowser = {} },
    (value) => { value.productionBrowser.computed.margin.margin = 0 },
    (value) => { value.productionBrowser.computed.medium.height = 99 },
    (value) => { value.productionBrowser.rootFontSize = Number.NaN },
    (value) => { value.productionBrowser.computed.color.color = 'red' },
    (value) => { delete value.productionBrowser.computed.opacity.visible },
    (value) => { value.productionBrowser.pixels.color = value.productionBrowser.reference.color = [255, 0, 0, 255] },
  ]) {
    const broken = structuredClone(report)
    mutate(broken.results[0])
    expect(() => verifyReports([broken], matrix, 'head')).toThrow()
  }
})

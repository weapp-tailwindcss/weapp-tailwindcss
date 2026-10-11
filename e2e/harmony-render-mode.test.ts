import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeHarmonyRuntimeTextPairs, parseHarmonyLayoutBounds } from '../scripts/demo-visual-e2e-report/harmony-layout'
import { uniAppXAppCases } from './hbuilderx-local/cases'
import { findForbiddenRuntimeLogs, findMissingRuntimeLogs, resolveAppRuntimeLogContract } from './hbuilderx-local/render-mode'

const issue1125ProbeUtilities = [
  'leading-[26px]',
  'leading-[52rpx]',
  'leading-[1.625]',
  'text-sm',
  'w-[220px]',
  'issue-1125-local-merge',
]

describe('Harmony VDOM and Vapor render mode coverage', () => {
  it('requires mutually exclusive compiler mode logs for both Harmony branches', () => {
    const vdom = uniAppXAppCases.find(item => item.renderMode === 'vdom')
    const vapor = uniAppXAppCases.find(item => item.renderMode === 'vapor')
    const vdomContract = resolveAppRuntimeLogContract(vdom ?? {})
    const vaporContract = resolveAppRuntimeLogContract(vapor ?? {})

    expect(vdom?.name).toContain('vdom')
    expect(vapor?.name).toContain('vapor')
    expect(vapor?.requiredFiles).toContain('bytes/GenPagesIndexIndexSharedData.bytes')
    expect(vapor?.transformedOutputFiles).toContain('bytes/GenPagesIndexIndexSharedData.bytes')
    expect(findMissingRuntimeLogs('App Launch\n当前项目运行在VDOM模式', vdomContract.contains)).toEqual([])
    expect(findForbiddenRuntimeLogs('App Launch\n当前项目运行在VDOM模式', vdomContract.notContains)).toEqual([])
    expect(findMissingRuntimeLogs('App Launch\n当前项目运行在蒸汽模式\n当前视图层编译目标 bytecode', vaporContract.contains)).toEqual([])
    expect(findForbiddenRuntimeLogs('App Launch\n当前项目运行在蒸汽模式\n当前视图层编译目标 bytecode', vaporContract.notContains)).toEqual([])
    expect(findForbiddenRuntimeLogs('当前项目运行在蒸汽模式', vdomContract.notContains)).not.toEqual([])
    expect(findForbiddenRuntimeLogs('当前项目运行在VDOM模式', vaporContract.notContains)).not.toEqual([])
  })

  it('keeps the issue #1125 semantic probe corpus aligned between VDOM and Vapor demos', async () => {
    const [vdom, vapor] = await Promise.all([
      fs.readFile(path.resolve('demo/uni-app-x-vdom-tailwindcss-v4/pages/index/index.uvue'), 'utf8'),
      fs.readFile(path.resolve('demo/uni-app-x-vapor-tailwindcss-v4/pages/index/index.uvue'), 'utf8'),
    ])

    for (const utility of issue1125ProbeUtilities) {
      expect(vdom, `VDOM demo should contain ${utility}`).toContain(utility)
      expect(vapor, `Vapor demo should contain ${utility}`).toContain(utility)
    }
    expect(vdom).toContain('line-height: 26px')
    expect(vapor).toContain('line-height: 26px')
  })

  it('compares Tailwind and native line-height nodes from a Harmony layout tree', () => {
    const layout = {
      children: [
        { attributes: { bounds: '[42,1576][812,1758]', text: 'Tailwind line 1\nTailwind line 2', type: 'Text' } },
        { attributes: { bounds: '[42,1786][812,1968]', text: 'Native line 1 Native line 2', type: 'Text' } },
      ],
    }
    const evidence = analyzeHarmonyRuntimeTextPairs(layout, [{
      tailwindText: 'Tailwind line 1 Tailwind line 2',
      nativeText: 'Native line 1 Native line 2',
    }])

    expect(evidence[0]?.heightDifference).toBe(0)
    expect(evidence[0]?.tailwind.bounds.height).toBe(182)
    expect(evidence[0]?.native.bounds.height).toBe(182)
    expect(parseHarmonyLayoutBounds('invalid')).toBeUndefined()

    const indexEvidence = analyzeHarmonyRuntimeTextPairs({ children: [
      { attributes: { bounds: '[0,0][100,120]', type: 'Custom' } },
      { attributes: { bounds: '[0,130][100,250]', type: 'Custom' } },
      { attributes: { bounds: '[0,260][100,360]', type: 'Custom' } },
    ] }, [{
      tailwindText: 'missing tailwind text',
      nativeText: 'missing native text',
      maxHeightDifference: 20,
      tailwindLayoutNodeIndex: 1,
      nativeLayoutNodeIndex: 3,
    }])
    expect(indexEvidence[0]?.heightDifference).toBe(20)
  })

  it('rejects missing or mismatched Harmony line-height layout evidence', () => {
    const mismatched = {
      children: [
        { attributes: { bounds: '[0,0][100,120]', text: 'Tailwind' } },
        { attributes: { bounds: '[0,130][100,250]', text: 'Native' } },
      ],
    }
    expect(() => analyzeHarmonyRuntimeTextPairs(mismatched, [{
      tailwindText: 'Tailwind',
      nativeText: 'Native',
      maxHeightDifference: 0,
    }])).not.toThrow()

    mismatched.children[1]!.attributes.bounds = '[0,130][100,260]'
    expect(() => analyzeHarmonyRuntimeTextPairs(mismatched, [{
      tailwindText: 'Tailwind',
      nativeText: 'Native',
      maxHeightDifference: 0,
    }])).toThrow('高度不一致')
    expect(() => analyzeHarmonyRuntimeTextPairs({ children: [] }, [{
      tailwindText: 'Tailwind',
      nativeText: 'Native',
    }])).toThrow('缺少 line-height 对照节点')
  })
})

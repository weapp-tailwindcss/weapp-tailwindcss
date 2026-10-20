import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectLynxContractFindings } from './check-lynx-contract.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const baselinePath = path.join(repoRoot, 'examples', 'react-lynx', 'src', 'compatibility', 'baseline.json')
const baselineLabel = path.relative(repoRoot, baselinePath)
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))

describe('Lynx 文档与已提交基线的事实合同', () => {
  it('要求中英文文档与当前基线一致', () => {
    expect(collectLynxContractFindings()).toEqual([])
  })

  it.each([
    baseline.verifiedAt,
    baseline.catalogHash,
    baseline.versions.cssDefines,
    baseline.environments.android.deviceName,
    baseline.environments.ios.deviceName,
  ])('拒绝缺少当前事实 %s 的文档', (fact) => {
    const findings = collectLynxContractFindings({
      readFile: (file) => {
        const source = fs.readFileSync(file, 'utf8')
        return file.endsWith('.md') ? source.replaceAll(fact, '过期事实') : source
      },
    })
    expect(findings.filter(finding => finding.includes(`缺少事实 “${fact}”`))).toHaveLength(6)
  })

  it('允许正常刷新基线和文档，不依赖检查脚本中的历史设备与版本', () => {
    const replacements = new Map([
      [baseline.verifiedAt, '2026-10-21T01:02:03.000Z'],
      [baseline.catalogHash, 'f'.repeat(64)],
      [baseline.versions.cssDefines, '0.0.99'],
      [baseline.environments.android.deviceName, 'new-android-device'],
      [baseline.environments.ios.deviceName, 'new-ios-device'],
    ])
    const findings = collectLynxContractFindings({
      readFile: (file) => {
        let source = fs.readFileSync(file, 'utf8')
        if (file === baselinePath || file.endsWith('.md')) {
          for (const [before, after] of replacements) {
            source = source.replaceAll(before, after)
          }
        }
        return source
      },
    })
    expect(findings).toEqual([])
  })

  it('拒绝缺失设备和版本的基线，不能悄悄减少文档检查范围', () => {
    const findings = collectLynxContractFindings({
      readFile: (file) => {
        if (file === baselinePath) {
          return JSON.stringify({ ...baseline, versions: {}, environments: {} })
        }
        return fs.readFileSync(file, 'utf8')
      },
    })
    expect(findings).toContain(`${baselineLabel}: cssDefines 缺少有效的基线事实`)
    expect(findings).toContain(`${baselineLabel}: android 缺少有效的基线事实`)
    expect(findings).toContain(`${baselineLabel}: iosDevice 缺少有效的基线事实`)
    expect(findings).toContain(`${baselineLabel}: androidApi 缺少有效的基线事实`)
  })
})

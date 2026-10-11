import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractOptionRows,
  extractOptionSections,
  scanConfigDocs,
  validateConfigDocument,
} from './check-config-docs.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function documentFor(locale, option = 'input') {
  const markers = locale === 'zh'
    ? ['**作用**', '**使用场景**', '**用法**']
    : ['**Purpose**', '**When to use**', '**Usage**']
  return [
    `| [\`${option}\`](#${option}) | string |`,
    '',
    `### \`${option}\` {#${option}}`,
    '',
    ...markers.map(marker => `${marker} content`),
  ].join('\n')
}

describe('framework config reference gate', () => {
  it('extracts linked option rows and explicit option sections', () => {
    const source = documentFor('zh')
    expect(extractOptionRows(source)).toEqual([{
      anchor: 'input',
      linkedAnchor: 'input',
      line: 1,
      option: 'input',
    }])
    expect(extractOptionSections(source).get('input')).toMatchObject({ anchor: 'input', line: 3 })
  })

  it('ignores long unterminated table rows', () => {
    expect(extractOptionRows(`| ${' '.repeat(10_000)}`)).toEqual([])
  })

  it('reports missing links, anchors, and required explanation markers', () => {
    const source = [
      '| `sourceGlobs` | string[] |',
      '',
      '### `sourceGlobs`',
      '',
      '**作用** 扫描源码。',
    ].join('\n')
    const result = validateConfigDocument(source, 'react-native.md', 'zh')
    expect(result.findings.map(finding => finding.message)).toEqual([
      '配置表必须链接到 #sourceglobs',
      '详情小节必须声明 {#sourceglobs}',
      '详情小节缺少 **使用场景**',
      '详情小节缺少 **用法**',
    ])
  })

  it('reports option drift between Chinese and English pages', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'config-docs-'))
    temporaryDirectories.push(directory)
    const chineseRoot = path.join(directory, 'zh')
    const englishRoot = path.join(directory, 'en')
    fs.mkdirSync(chineseRoot)
    fs.mkdirSync(englishRoot)
    fs.writeFileSync(path.join(chineseRoot, 'sample.md'), documentFor('zh', 'input'))
    fs.writeFileSync(path.join(englishRoot, 'sample.md'), documentFor('en', 'css'))

    const findings = scanConfigDocs({ chineseRoot, englishRoot })

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('中英文配置项不一致')
  })
})

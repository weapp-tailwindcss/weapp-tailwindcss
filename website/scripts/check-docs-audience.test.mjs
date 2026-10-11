import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findForbiddenCommands,
  formatFindings,
  isMaintainerDocument,
  scanDocs,
  scanDocument,
} from './check-docs-audience.mjs'

const tempDirectories = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('docs audience command gate', () => {
  it('rejects repository filter and e2e commands', () => {
    const findings = findForbiddenCommands([
      'pnpm --filter @weapp-tailwindcss/react-native test',
      'pnpm e2e:react-native:ios',
    ].join('\n'))

    expect(findings).toHaveLength(2)
    expect(formatFindings(findings)).toContain('workspace filter command')
    expect(formatFindings(findings)).toContain('repository e2e command')
  })

  it('allows user project commands', () => {
    expect(findForbiddenCommands([
      'pnpm add @weapp-tailwindcss/react-native',
      'pnpm dev',
      'pnpm build',
      'npm run dev:h5',
    ].join('\n'))).toEqual([])
  })

  it('recognizes maintainer-only frontmatter', () => {
    expect(isMaintainerDocument('---\ntitle: Maintainer\naudience: maintainer\n---\n')).toBe(true)
    expect(isMaintainerDocument('---\ntitle: User guide\n---\n')).toBe(false)
  })

  it('allows repository commands in maintainer documents', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audience-maintainer-'))
    tempDirectories.push(directory)
    const file = path.join(directory, 'maintainer.md')
    fs.writeFileSync(file, '---\naudience: maintainer\n---\npnpm --filter website build\n')

    expect(scanDocument(file, directory)).toEqual([])
  })

  it('scans both Chinese and English document roots', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audience-'))
    tempDirectories.push(directory)
    const chineseRoot = path.join(directory, 'docs')
    const englishRoot = path.join(directory, 'en')
    fs.mkdirSync(chineseRoot)
    fs.mkdirSync(englishRoot)
    fs.writeFileSync(path.join(chineseRoot, 'guide.md'), 'pnpm e2e:internal\n')
    fs.writeFileSync(path.join(englishRoot, 'guide.md'), 'pnpm --filter package test\n')

    const findings = scanDocs({ roots: [chineseRoot, englishRoot] })

    expect(findings).toHaveLength(2)
    expect(findings.map(finding => path.basename(finding.root))).toEqual(['docs', 'en'])
  })
})

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { declaredPackageManager, repositoryPackageManager } from '../version-contract.mjs'
import { authoredClasses, authoredCss } from './authored.mjs'
import { cases, checkCatalog, coverage, demos, matrix, repo, requiredPhases } from './catalog.mjs'
import { consumedClasses } from './consumption.mjs'
import { verifyReports } from './gate.mjs'
import { inspectNativeContents } from './native.mjs'
import { cssClasses, inspectStyles } from './output.mjs'
import { insertProbe } from './probe.mjs'

describe('portable demo matrix', () => {
  it('keeps the UTS Linux binary installable without changing other platform constraints', () => {
    const { hooks } = createRequire(import.meta.url)('../../../.pnpmfile.cjs')
    const manifest = { name: '@dcloudio/uts-linux-x64-gnu', version: '3.0.0-alpha-5020220260725001', os: ['linux'], cpu: ['x64'], libc: ['gnu'] }
    expect(hooks.readPackage({ ...manifest })).toEqual({ ...manifest, libc: ['glibc'] })
    const musl = { ...manifest, name: '@dcloudio/uts-linux-x64-musl', libc: ['musl'] }
    expect(hooks.readPackage({ ...musl })).toEqual(musl)
  })

  it('rejects Metro bootstrap without an application and page', () => {
    expect(() => inspectNativeContents(['__d(function(g,r,i,a,m,e,d){},1,[]);'.repeat(300)])).toThrow('register the application')
    expect(() => inspectNativeContents(['AppRegistry.registerComponent("app",()=>App)'])).toThrow('page probe')
    expect(inspectNativeContents(['AppRegistry.registerComponent("app",()=>App);render("tw-matrix-native-app")']).pageProbe).toBe(true)
  })
  it('matches rendered class identities and rejects unrelated class strings', async () => {
    const item = cases.find(item => coverage(item) === 'authored-styles')
    const markup = Object.entries(authoredClasses('initial')).map(([key], index) => `<view id="tw-matrix-${key}" data-tw-matrix="initial" class="renamed-${index}"></view>`).join('')
    const parsed = await consumedClasses([{ file: 'page.wxml', text: markup }], item, 'initial')
    expect(await consumedClasses([{ file: 'page.js', text: `render(\`${markup}\`)` }], item, 'initial')).toEqual(parsed)
    expect(parsed).toEqual({ 'tw-authored-height-small': ['renamed-0'], 'tw-authored-display': ['renamed-1'], 'tw-authored-color': ['renamed-2'] })
    const css = authoredCss(item, 'initial').replaceAll('tw-authored-height-small', 'renamed-0').replaceAll('tw-authored-display', 'renamed-1').replaceAll('tw-authored-color', 'renamed-2')
    expect(inspectStyles([css], item, 'initial', parsed).coverage).toBe('authored-styles')
    const objects = Object.entries(authoredClasses('initial')).map(([key, value]) => ({ 'id': `tw-matrix-${key}`, 'data-tw-matrix': 'initial', 'className': value }))
    const js = `render(${JSON.stringify(objects)}); const decoy = "h-8 flex";`
    expect(await consumedClasses([{ file: 'page.js', text: js }], item, 'initial')).toEqual(Object.fromEntries(Object.values(authoredClasses('initial')).map(value => [value, [value]])))
    await expect(consumedClasses([{ file: 'page.js', text: 'const decoy = "tw-matrix-initial-height tw-authored-height-small";' }], item, 'initial')).rejects.toThrow('missing consumed class')
    await expect(consumedClasses([{ file: 'page.wxml', text: markup }], item, 'replace')).rejects.toThrow('missing consumed class')
  })
  it('covers every demo and every portable target without duplicate cases', () => {
    checkCatalog()
    const jobs = matrix().include
    for (const os of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
      expect(jobs.filter(job => job.os === os && job.node === 24).flatMap(job => job.cases).sort()).toEqual(cases.map(item => item.id).sort())
    }
    expect(jobs.every(job => job.cases.length > 0 && job.cases.length <= 4)).toBe(true)
    expect(jobs.length).toBeLessThanOrEqual(256)
  })

  it('inserts live render probes into every registered source', async () => {
    for (const item of demos.filter(item => item.source)) {
      const original = await readFile(path.join(repo, 'demo', item.name, item.source), 'utf8')
      for (const round of ['initial', 'replace', 'add', 'restore']) {
        const source = await insertProbe(original, { ...item, target: item.targets[0] }, round)
        expect(source).toContain(`tw-matrix-${round}-height`)
        if (coverage(item) === 'authored-styles') {
          expect(source).toContain('tw-authored-height-')
        }
        else { expect(source).toContain(round === 'replace' || round === 'add' ? 'h-12' : 'h-8') }
        expect(source.includes('id="tw-matrix-added"')).toBe(round === 'add')
      }
    }
  })

  it('decodes CSS class escapes and rejects a standard-utility regression', () => {
    expect(cssClasses('.h-\\[64px\\], .bg-emerald-50\\/80')).toEqual(['h-[64px]', 'bg-emerald-50/80'])
    expect(() => inspectStyles(['.h-\\[64px\\]{height:64px}'], cases[0])).toThrow('missing h-8')
  })

  it('validates CLI reports against the tested head independently of the Actions merge SHA', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'demo-matrix-gate-'))
    const head = 'a'.repeat(40)
    const merge = 'b'.repeat(40)
    const platforms = { 'windows-latest': 'win32', 'macos-latest': 'darwin', 'ubuntu-latest': 'linux' }
    try {
      for (const [index, job] of matrix().include.entries()) {
        const report = {
          sha: head,
          pnpm: repositoryPackageManager.version,
          node: `v${job.node}.0.0`,
          os: platforms[job.os],
          expected: job.cases,
          results: job.cases.map((id) => {
            const item = cases.find(item => item.id === id)
            return { id, coverage: coverage(item), status: 'passed', rounds: Object.fromEntries(requiredPhases(item).map(phase => [phase, {}])) }
          }),
        }
        const directory = path.join(root, String(index))
        await mkdir(directory)
        await writeFile(path.join(directory, 'report.json'), JSON.stringify(report))
      }
      const run = sha => execa(process.execPath, [path.join(repo, 'scripts/ci/demo-matrix/gate.mjs'), root], {
        env: { GITHUB_SHA: merge, DEMO_MATRIX_SHA: sha },
        reject: false,
      })
      const valid = await run(head)
      expect(valid.exitCode, valid.stderr).toBe(0)
      expect(valid.stdout).toContain(`Verified ${matrix().include.flatMap(job => job.cases).length} demo/OS/Node results`)
      const stale = await run(merge)
      expect(stale.exitCode).not.toBe(0)
      expect(stale.stderr).toContain('different commit')
      const missing = await run('')
      expect(missing.exitCode).not.toBe(0)
      expect(missing.stderr).toContain('DEMO_MATRIX_SHA must identify the tested checkout')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  }, 30_000)

  it('fails closed for absent, skipped, duplicate, stale or incomplete evidence', () => {
    const id = cases[0].id
    const expected = { include: [{ os: 'windows-latest', node: 24, cases: [id] }] }
    const passed = { sha: 'head', pnpm: repositoryPackageManager.version, node: 'v24.19.0', os: 'win32', expected: [id], results: [{ id, coverage: 'utilities', status: 'passed', rounds: Object.fromEntries(['production', 'initial', 'replace', 'add', 'restore'].map(round => [round, {}])) }] }
    expect(verifyReports([passed], expected, 'head')).toBe(1)
    const upgraded = declaredPackageManager({ packageManager: 'pnpm@99.2.3' })
    expect(verifyReports([{ ...passed, pnpm: upgraded.version }], expected, 'head', upgraded)).toBe(1)
    expect(() => verifyReports([passed], expected, 'head', upgraded)).toThrow('Report pnpm version')
    expect(() => verifyReports([], expected, 'head')).toThrow()
    expect(() => verifyReports([passed, passed], expected, 'head')).toThrow('Duplicate')
    expect(() => verifyReports([passed], expected, 'new-head')).toThrow('different commit')
    expect(() => verifyReports([{ ...passed, results: [{ ...passed.results[0], status: 'skipped' }] }], expected, 'head')).toThrow('Failed result')
    expect(() => verifyReports([{ ...passed, results: [{ ...passed.results[0], rounds: { production: {} } }] }], expected, 'head')).toThrow('Missing initial')
  })

  it('limits native coverage to its existing integration and requires web refresh evidence', () => {
    const native = cases.find(item => item.target === 'rn')
    expect(coverage(native)).toBe('native-build')
    expect(requiredPhases(native)).toEqual(['production'])
    const hybrid = cases.find(item => item.target === 'harmony-hybrid')
    expect(coverage(hybrid)).toBe('webview-build')
    expect(requiredPhases(hybrid)).toEqual(['production'])
    expect(requiredPhases(cases.find(item => item.target === 'h5'))).toContain('refresh')
    const report = { sha: 'head', pnpm: repositoryPackageManager.version, node: 'v24.19.0', os: 'win32', expected: [native.id], results: [{ id: native.id, coverage: 'native-build', status: 'passed', rounds: { production: { javascript: true } } }] }
    const expected = { include: [{ os: 'windows-latest', node: 24, cases: [native.id] }] }
    expect(verifyReports([report], expected, 'head')).toBe(1)
    expect(() => verifyReports([{ ...report, results: [{ ...report.results[0], coverage: 'utilities' }] }], expected, 'head')).toThrow('Incorrect coverage')
  })
})

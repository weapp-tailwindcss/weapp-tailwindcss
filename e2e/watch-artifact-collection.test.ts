import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectWatchArtifactSnapshot, createWatchCaseArtifacts } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/artifacts'
import { resolveRelativeStyleImport } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/artifacts/imports'
import { buildDemoExtendedCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/extended'
import { assertDevHmrArtifactSnapshotGate } from './watchArtifactSnapshotGate'

describe('watch artifact dependency collection', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
  })
  async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-artifacts-'))
    roots.push(root)
    const shell = path.join(root, 'entry.wxss')
    const vendor = path.join(root, 'vendor.wxss')
    const nested = path.join(root, 'nested.wxss')
    await fs.writeFile(shell, '@import "./vendor.wxss";\n')
    await fs.writeFile(vendor, '@import "./nested.wxss";\n')
    await fs.writeFile(nested, '.probe{color:red}\n')
    const sourceCase = buildDemoExtendedCases(root).find(item => item.name === 'mpx-tailwindcss-v4')!
    const watchCase = { ...sourceCase, cwd: root, outputWxml: path.join(root, 'missing.wxml'), outputJs: path.join(root, 'missing.js'), outputStyleCandidates: [shell], globalStyleCandidates: [shell], subPackageMutations: [], outputIntegrityGuards: [] }
    return { watchCase, vendor, nested }
  }
  it('captures transitive imported outputs without relying on mutation candidates', async () => {
    const { watchCase, nested } = await fixture()
    const dev = await collectWatchArtifactSnapshot(watchCase, 'dev')
    await fs.writeFile(nested, '.probe{color:blue}\n')
    const hmr = await collectWatchArtifactSnapshot(watchCase, 'hmr')
    const artifacts = await createWatchCaseArtifacts(dev, hmr, 5)
    expect(dev.files.map(entry => entry.file)).toEqual(['entry.wxss', 'nested.wxss', 'vendor.wxss'])
    expect(() => assertDevHmrArtifactSnapshotGate('import graph', artifacts)).not.toThrow()
    expect(artifacts.diff.files.map(entry => entry.file)).toEqual(['nested.wxss'])
  })
  it('retains missing dependencies so the gate rejects broken imports', async () => {
    const { watchCase, nested } = await fixture()
    const dev = await collectWatchArtifactSnapshot(watchCase, 'dev')
    await fs.rm(nested)
    const hmr = await collectWatchArtifactSnapshot(watchCase, 'hmr')
    const artifacts = await createWatchCaseArtifacts(dev, hmr, 5)
    expect(hmr.files.find(entry => entry.file === 'nested.wxss')).toMatchObject({ exists: false, size: 0 })
    expect(() => assertDevHmrArtifactSnapshotGate('missing import', artifacts)).toThrow('HMR import shell target is missing or empty')
  })
  it('deduplicates circular imports and preserves original CRLF bytes for hashes', async () => {
    const { watchCase, nested } = await fixture()
    await fs.writeFile(nested, '@import "./vendor.wxss";\r\n.probe{color:red}\r\n')
    const dev = await collectWatchArtifactSnapshot(watchCase, 'dev')
    const hmr = await collectWatchArtifactSnapshot(watchCase, 'hmr')
    expect(dev.files).toHaveLength(3)
    expect(dev.files.find(entry => entry.file === 'nested.wxss')?.content).toContain('\r\n')
    const artifacts = await createWatchCaseArtifacts(dev, hmr, 5)
    expect(() => assertDevHmrArtifactSnapshotGate('CRLF', artifacts)).not.toThrow()
  })
})

describe('artifact import path boundary', () => {
  it.each([
    ['/output/app.wxss', './styles/vendor.wxss', '/output/styles/vendor.wxss', path.posix],
    ['/app.wxss', '../vendor.wxss?x=1', '/vendor.wxss', path.posix],
    [String.raw`C:\output\app.wxss`, './styles/vendor.wxss', String.raw`C:\output\styles\vendor.wxss`, path.win32],
    [String.raw`D:\app.wxss`, String.raw`.\vendor.wxss#hash`, String.raw`D:\vendor.wxss`, path.win32],
  ] as const)('resolves %s -> %s using the filesystem path API', (file, request, expected, paths) => {
    expect(resolveRelativeStyleImport(file, request, paths)).toBe(expected)
  })
  it.each(['/vendor.wxss', String.raw`\vendor.wxss`, String.raw`C:\vendor.wxss`, 'C:vendor.wxss', 'https://example.com/a.css', '//cdn.example.com/a.css', 'data:text/css,a', '#fragment'])('does not reinterpret rooted URLs or remote imports as local files: %s', (request) => {
    expect(resolveRelativeStyleImport('/out/app.wxss', request)).toBeUndefined()
  })
})

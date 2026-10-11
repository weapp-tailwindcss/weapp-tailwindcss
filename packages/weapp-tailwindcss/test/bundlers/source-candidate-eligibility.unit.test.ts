import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createSourceCandidateEligibilityMatcher, resolveSourceCandidateScanFiles } from '@/project-sources/candidates/scan-root'

const createdDirs: string[] = []

describe('source candidate eligibility', () => {
  it('显式空来源不扫描项目，且与增量资格判断一致', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'empty-explicit-scan-'))
    createdDirs.push(root)
    const file = path.join(root, 'page.qxml')
    await writeFile(file, '<view class="flex" />')
    const scan = { root, explicit: true, entries: [] }
    expect(await resolveSourceCandidateScanFiles({ ...scan, filter: () => true })).toEqual([])
    expect(createSourceCandidateEligibilityMatcher([scan])(file)).toBe(false)
  })
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('uses scanner file identities to exclude gitignored transformed modules', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-source-eligibility-'))
    const sourceFile = path.join(root, 'src/App.vue')
    const ignoredFile = path.join(root, 'ignored-by-gitignore.js')
    createdDirs.push(root)
    await mkdir(path.dirname(sourceFile), { recursive: true })
    await writeFile(path.join(root, '.gitignore'), 'ignored-by-gitignore.js\n')
    await writeFile(sourceFile, '<template><view class="text-green-500" /></template>')
    await writeFile(ignoredFile, 'export const className = "text-red-500"')

    const files = await resolveSourceCandidateScanFiles({
      filter: () => true,
      root,
    })
    const matches = createSourceCandidateEligibilityMatcher([{ root }], files)

    expect(matches(sourceFile)).toBe(true)
    expect(matches(ignoredFile)).toBe(false)
  })

  it('applies Tailwind default ignores to implicit root scans', () => {
    const root = path.resolve('workspace/packages/app')
    const matches = createSourceCandidateEligibilityMatcher([{ root, outDir: 'dist' }])

    expect(matches(path.join(root, 'src/App.vue'))).toBe(true)
    expect(matches(path.join(root, 'node_modules/monaco/editor.ts'))).toBe(false)
    expect(matches(path.join(root, 'dist/assets/index.js'))).toBe(false)
    expect(matches(path.resolve(root, '../../node_modules/monaco/editor.ts'))).toBe(false)
  })

  it('allows explicitly included dependency sources outside the vite root', () => {
    const root = path.resolve('workspace/packages/app')
    const dependencyRoot = path.resolve(root, '../../node_modules/example')
    const matches = createSourceCandidateEligibilityMatcher([{
      root,
      explicit: true,
      entries: [{
        base: dependencyRoot,
        pattern: '**/*.ts',
        negated: false,
      }],
    }])

    expect(matches(path.join(dependencyRoot, 'src/index.ts'))).toBe(true)
    expect(matches(path.resolve(root, '../../node_modules/other/index.ts'))).toBe(false)
  })

  it('does not treat an uninitialized explicit negative scan as match-all', () => {
    const root = path.resolve('workspace/packages/app')
    const matches = createSourceCandidateEligibilityMatcher([{
      root,
      explicit: true,
      entries: [{
        base: root,
        pattern: 'node_modules/**',
        negated: true,
      }],
    }])

    expect(matches(path.join(root, 'src/App.vue'))).toBe(false)
  })

  it('applies implicit negative sources to transformed modules', () => {
    const root = path.resolve('workspace/packages/app')
    const generatedRoot = path.join(root, 'src/generated')
    const matches = createSourceCandidateEligibilityMatcher([{
      root,
      entries: [{
        base: generatedRoot,
        pattern: '**/*',
        negated: true,
      }],
    }])

    expect(matches(path.join(root, 'src/App.vue'))).toBe(true)
    expect(matches(path.join(generatedRoot, 'client.ts'))).toBe(false)
  })

  it('accepts files from every implicit source root', () => {
    const appRoot = path.resolve('workspace/packages/app')
    const sharedRoot = path.resolve('workspace/shared-ui')
    const matches = createSourceCandidateEligibilityMatcher([
      { root: appRoot },
      { root: sharedRoot },
    ])

    expect(matches(path.join(appRoot, 'src/App.vue'))).toBe(true)
    expect(matches(path.join(sharedRoot, 'Button.vue'))).toBe(true)
    expect(matches(path.resolve('workspace/unrelated/index.ts'))).toBe(false)
  })
})

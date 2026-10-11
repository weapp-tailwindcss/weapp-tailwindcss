import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readReachableMiniProgramStyles, resolveMiniProgramRuntimeStyleEntry, resolveMiniProgramStyleImport } from './hbuilderx-local/styles'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-hbuilderx-styles-'))
  temporaryDirectories.push(root)
  await fs.writeFile(path.join(root, 'entry.js'), '')
  await fs.writeFile(path.join(root, 'entry.acss'), '@import "./framework.acss";\n.runtime{}')
  await fs.writeFile(path.join(root, 'framework.acss'), '@import "./generated.acss";')
  await fs.writeFile(path.join(root, 'generated.acss'), '@import "./framework.acss";\n.tailwind{}')
  await fs.writeFile(path.join(root, 'unlinked.acss'), '.unlinked{}')
  return root
}

describe('HBuilderX mini-program style reachability', () => {
  it('resolves the runtime style from the root chunk and follows local imports', async () => {
    const root = await createFixture()
    const entry = await resolveMiniProgramRuntimeStyleEntry(root, ['.acss'])

    expect(entry).toBe(path.join(root, 'entry.acss'))
    const css = await readReachableMiniProgramStyles(root, entry!, ['.acss'])
    expect(css).toContain('.runtime{}')
    expect(css).toContain('.tailwind{}')
    expect(css).not.toContain('.unlinked{}')
  })

  it('rejects imports outside the output root without reading them', async () => {
    const root = await createFixture()
    const external = path.join(path.dirname(root), 'external.acss')
    await fs.writeFile(external, '.external{}')
    await fs.appendFile(path.join(root, 'entry.acss'), '\n@import "../external.acss";')
    try {
      await expect(readReachableMiniProgramStyles(root, path.join(root, 'entry.acss'), ['.acss'])).rejects.toThrow(/escapes mini-program output root/)
    }
    finally {
      await fs.rm(external, { force: true })
    }
  })

  it.each([
    [path.posix, '/project/out', '/project/out/pages/home/style.acss', '../../framework.acss', '/project/out/framework.acss'],
    [path.posix, '/project/out', '/project/out/pages/style.acss', '/theme.acss?version=1', '/project/out/theme.acss'],
    [path.win32, 'C:\\project\\out', 'C:\\project\\out\\pages\\home\\style.acss', '..\\..\\framework.acss', 'C:\\project\\out\\framework.acss'],
    [path.win32, 'C:\\project\\out', 'C:\\project\\out\\pages\\style.acss', '/theme.acss', 'C:\\project\\out\\theme.acss'],
  ])('resolves logical imports with explicit filesystem semantics', (paths, root, importer, request, expected) => {
    expect(resolveMiniProgramStyleImport(root, importer, request, paths)).toBe(expected)
  })

  it.each([path.posix, path.win32])('rejects a relative import that escapes the registered output root', (paths) => {
    const root = paths.resolve('output')
    expect(() => resolveMiniProgramStyleImport(root, paths.join(root, 'entry.acss'), '../../framework.acss', paths)).toThrow('escapes mini-program output root')
    expect(resolveMiniProgramStyleImport(root, paths.join(root, 'entry.acss'), 'https://example.com/style.css', paths)).toBeUndefined()
    expect(resolveMiniProgramStyleImport(root, paths.join(root, 'entry.acss'), 'D:\\outside.acss', paths)).toBeUndefined()
  })

  it('reads multiple imports on one line and ignores import-like comments and strings', async () => {
    const root = await createFixture()
    await fs.writeFile(path.join(root, 'entry.acss'), `/* @import "./missing.acss"; */ @import "/framework.acss";@import "./generated.acss";.label{content:"@import './missing.acss';"}`)
    const css = await readReachableMiniProgramStyles(root, path.join(root, 'entry.acss'), ['.acss'])
    expect(css.match(/\.tailwind\{\}/g)).toHaveLength(1)
  })
})

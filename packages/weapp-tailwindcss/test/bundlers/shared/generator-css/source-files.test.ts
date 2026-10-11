import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  resolveSourceSideCssEntrySource,
} from '@/generation/source-files'

describe('source files resolver', () => {
  it('resolves css entry from local style import chains', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-files-'))
    await mkdir(path.join(cwd, 'src/styles'), { recursive: true })
    await mkdir(path.join(cwd, 'src/pages'), { recursive: true })
    await writeFile(path.join(cwd, 'src/styles/base.css'), '@config "./tailwind.config.js";\n@source "./pages/**/*.vue";\n')
    await writeFile(path.join(cwd, 'src/styles/app.css'), '@import "./base.css";\n')
    await writeFile(path.join(cwd, 'src/pages/index.vue'), '<template><view class="text-red-500"></view></template>\n<style>\n@import "../styles/app.css";\n</style>')

    const resolved = resolveSourceSideCssEntrySource(
      path.join(cwd, 'src/pages/index.vue'),
      {
        projectRoot: cwd,
        cwd,
        sourceFile: path.join(cwd, 'src/pages/index.vue'),
      },
    )

    expect(resolved).toMatchObject({
      file: path.join(cwd, 'src/styles/base.css'),
      base: path.join(cwd, 'src/styles'),
      configRequest: './tailwind.config.js',
    })
    expect(resolved?.css).toContain('@source "./pages/**/*.vue";')
  })

  it('prefers configured absolute css sources over inferred sourceFile fallback', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-files-'))
    await mkdir(path.join(cwd, 'src'), { recursive: true })
    await writeFile(path.join(cwd, 'src/app.css'), '@config "./tailwind.config.js";\n')

    const resolved = resolveSourceSideCssEntrySource(path.join(cwd, 'src/app.css'), {
      projectRoot: cwd,
      cwd,
      sourceCss: '@config "./tailwind.config.js";\n',
      sourceFile: path.join(cwd, 'src/app.css'),
      cssEntries: [path.join(cwd, 'src/app.css')],
      cssSources: [{
        file: path.join(cwd, 'src/app.css'),
      }],
    })

    expect(resolved?.file).toBe(path.join(cwd, 'src/app.css'))
    expect(resolved?.base).toBe(path.join(cwd, 'src'))
  })

  it('resolves extensionless imports, avoids import cycles, and removes config when requested', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-files-'))
    await mkdir(path.join(cwd, 'src/styles'), { recursive: true })
    const app = path.join(cwd, 'src/styles/app.css')
    const base = path.join(cwd, 'src/styles/base.css')
    await writeFile(app, '@import "./base";\n')
    await writeFile(base, '@import "./app.css";\n@config "./tailwind.config.js";\n@source "./pages";')

    const resolved = resolveSourceSideCssEntrySource('styles/app.wxss', {
      projectRoot: cwd,
      cwd: path.join(cwd, 'src'),
      outputRoot: path.join(cwd, 'dist'),
      sourceFile: app,
    }, { removeConfig: true })

    expect(resolved).toMatchObject({
      file: base,
      base: path.dirname(base),
      configRequest: './tailwind.config.js',
    })
    expect(resolved?.css).not.toContain('@config')
  })

  it('returns undefined for ambiguous configured source matches and unreadable candidates', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-files-'))
    const first = path.join(cwd, 'src/app.css')
    const second = path.join(cwd, 'alt/app.css')
    await mkdir(path.dirname(first), { recursive: true })
    await mkdir(path.dirname(second), { recursive: true })
    await writeFile(first, '@source "./src";')
    await writeFile(second, '@source "./alt";')

    expect(resolveSourceSideCssEntrySource('app.wxss', {
      projectRoot: cwd,
      cwd,
      cssSources: [{ file: first }, { file: second }],
    })).toBeUndefined()

    expect(resolveSourceSideCssEntrySource(path.join(cwd, 'missing.css'), {
      projectRoot: cwd,
      cwd,
      sourceFile: path.join(cwd, 'missing.css'),
    })).toBeUndefined()
  })
})

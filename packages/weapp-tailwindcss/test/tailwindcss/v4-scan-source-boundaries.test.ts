import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

describe('Tailwind 多入口扫描边界', () => {
  it.each([false, true])('入口顺序反转 %s 时仍排除兄弟目录配置并保留页面候选', async (reversed) => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-scan-boundaries-'))
    try {
      const entries: string[] = []
      for (const [name, candidate] of [['first', 'underline'], ['second', 'italic']]) {
        const dir = path.join(root, name!)
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, 'page.html'), `<div class="${candidate}"></div>`)
        await writeFile(path.join(dir, 'tailwind.config.local.js'), 'module.exports = { corePlugins: { container: false } }')
        const entry = path.join(dir, 'theme.css')
        await writeFile(entry, '@import "tailwindcss" source(none);\n@source "./*.{html,js}";')
        entries.push(entry)
      }
      const source = await resolveTailwindV4Source({
        projectRoot: root,
        cssEntries: reversed ? entries.toReversed() : entries,
      })
      const engine = createTailwindV4Engine(source)
      try {
        const generated = await engine.generate({ target: 'web' })
        expect(generated.classSet).toEqual(new Set(['underline', 'italic']))
        expect(generated.rawCss).not.toContain('.container')
      }
      finally {
        engine.dispose()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('显式兄弟目录扫描仍忽略配置，同时保留页面实际使用的 container', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-scan-sibling-'))
    try {
      const base = path.join(root, 'styles')
      const content = path.join(root, 'content')
      await mkdir(base)
      await mkdir(content)
      await writeFile(path.join(content, 'tailwind.config.js'), 'module.exports = { safelist: ["italic"] }')
      await writeFile(path.join(content, 'page.html'), '<div class="container underline"></div>')
      const source = await resolveTailwindV4Source({
        projectRoot: base,
        base,
        css: '@import "tailwindcss" source(none);\n@source "../content/*.{html,js}";',
      })
      const engine = createTailwindV4Engine(source)
      try {
        const generated = await engine.generate({ target: 'web' })
        expect(generated.classSet).toEqual(new Set(['container', 'underline']))
        expect(generated.rawCss).toContain('.container')
        expect(generated.rawCss).not.toContain('.italic')
      }
      finally {
        engine.dispose()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

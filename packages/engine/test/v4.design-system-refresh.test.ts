import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractValidCandidates } from '../src/extraction/candidate-extractor/valid'
import { loadTailwindV4DesignSystem } from '../src/v4/node-adapter'

// 同时覆盖 design system 和候选有效性两层缓存，包含配置的间接依赖。
describe('design system dependency refresh', () => {
  it('revalidates candidates after a config dependency changes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-design-refresh-'))
    try {
      await fs.symlink(path.resolve(__dirname, '../../../node_modules'), path.join(root, 'node_modules'), 'junction')
      await fs.writeFile(path.join(root, 'package.json'), '{"type":"commonjs"}')
      await fs.writeFile(path.join(root, 'theme.cjs'), 'module.exports = { theme: { extend: { colors: require("./colors.cjs") } } }')
      const colors = path.join(root, 'colors.cjs')
      await fs.writeFile(colors, 'module.exports = { first: "red" }')
      await fs.writeFile(path.join(root, 'page.html'), '<div class="bg-first bg-second"></div>')
      const source = { projectRoot: root, base: root, baseFallbacks: [], dependencies: [], css: '@import "tailwindcss" source(none); @config "./theme.cjs";' }
      const options = { cwd: root, base: root, css: source.css, sources: [{ base: root, pattern: 'page.html', negated: false }] }
      const initial = await loadTailwindV4DesignSystem(source)
      expect(await loadTailwindV4DesignSystem(source)).toBe(initial)
      expect(await extractValidCandidates(options)).toContain('bg-first')
      expect(await extractValidCandidates(options)).not.toContain('bg-second')
      await fs.writeFile(colors, 'module.exports = { second: "blue" }')
      const changed = await loadTailwindV4DesignSystem(source)
      expect(changed).not.toBe(initial)
      expect(await extractValidCandidates(options)).toContain('bg-second')
      expect(await extractValidCandidates(options)).not.toContain('bg-first')
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

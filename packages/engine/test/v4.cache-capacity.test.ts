import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadTailwindV4DesignSystem } from '../src/v4/node-adapter'

describe('design system 长会话缓存', () => {
  it('持续变更 CSS 时保留热项并淘汰旧 design system', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-design-capacity-'))
    try {
      const moduleRoot = path.join(root, 'node_modules', '@tailwindcss', 'node')
      await fs.mkdir(moduleRoot, { recursive: true })
      await fs.writeFile(path.join(moduleRoot, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }))
      await fs.writeFile(path.join(moduleRoot, 'index.js'), 'export async function __unstable__loadDesignSystem(css) { return { css } }')
      const source = { projectRoot: root, base: root, baseFallbacks: [], dependencies: [], css: 'hot' }
      const hot = await loadTailwindV4DesignSystem(source)
      const coldSource = { ...source, css: 'cold' }
      const cold = await loadTailwindV4DesignSystem(coldSource)
      for (let index = 0; index < 62; index++) {
        await loadTailwindV4DesignSystem({ ...source, css: `revision-${index}` })
      }
      expect(await loadTailwindV4DesignSystem(source)).toBe(hot)
      await loadTailwindV4DesignSystem({ ...source, css: 'overflow' })
      expect(await loadTailwindV4DesignSystem(source)).toBe(hot)
      expect(await loadTailwindV4DesignSystem(coldSource)).not.toBe(cold)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

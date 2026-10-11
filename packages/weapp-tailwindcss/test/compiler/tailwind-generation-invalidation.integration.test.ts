import type { TailwindResolvedSource } from '@/generator'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'

// 配置热加载必须使用原生模块缓存，不能经过 Vitest 的模块执行器。
vi.mock('@/generator', async () => {
  const { createRequire } = await import('node:module')
  return createRequire(import.meta.url)('../../dist/generator.cjs')
})

describe('生成会话失效的真实 Tailwind 回归', () => {
  it.each(['web', 'weapp'] as const)('%s 保留独立入口，更新间接配置并支持删除恢复', async (target) => {
    const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-pool-dependencies-')))
    const pool = new TailwindGenerationSessionPool()
    try {
      const shared = path.join(directory, 'shared.cjs')
      await writeFile(shared, 'module.exports = { probe: "#123456" }')
      const sources: TailwindResolvedSource[] = []
      for (const name of ['a', 'b', 'independent']) {
        const config = path.join(directory, `${name}.cjs`)
        await writeFile(config, name === 'independent'
          ? 'module.exports = { theme: { colors: { probe: "#abcdef" } } }'
          : 'module.exports = { theme: { colors: require("./shared.cjs") } }')
        sources.push({ projectRoot: process.cwd(), base: directory, baseFallbacks: [process.cwd()], css: `@config "./${name}.cjs"; @tailwind utilities;`, dependencies: [config] })
      }
      const options = { candidates: ['bg-probe'], scanSources: false as const, incrementalCache: true, target }
      const initial = await Promise.all(sources.map(source => pool.generate(source, options)))
      expect(initial[0]!.dependencies).toContain(shared)
      expect(initial[0]!.css).toContain('#123456')
      await writeFile(shared, 'module.exports = { probe: "#654321" }')
      pool.invalidate({ type: 'dependencies', paths: [shared] })
      expect(pool.size).toBe(1)
      const updated = await Promise.all(sources.map(source => pool.generate(source, options)))
      expect(updated[0]!.css).toContain('#654321')
      expect(updated[1]!.css).toContain('#654321')
      expect(updated[0]!.css).not.toContain('#123456')
      expect(updated[2]!.css).toBe(initial[2]!.css)
      expect(updated[2]!.incrementalCss).toBe('')

      const added = await pool.generate(sources[2]!, { ...options, candidates: ['bg-probe', 'w-[17px]'] })
      expect(added.classSet.has('w-[17px]')).toBe(true)
      const removed = await pool.generate(sources[2]!, options)
      expect(removed.classSet.has('w-[17px]')).toBe(false)
      expect(removed.css).toBe(initial[2]!.css)
      const authored = await pool.generate({ ...sources[2]!, css: `${sources[2]!.css} .author { opacity: .7 }` }, options)
      expect(authored.css).toMatch(/opacity:\s*0?\.7/)

      await rm(shared)
      pool.invalidate({ type: 'dependencies', paths: [shared] })
      await expect(pool.generate(sources[0]!, options)).rejects.toThrow()
      await writeFile(shared, 'module.exports = { probe: "#123456" }')
      pool.invalidate({ type: 'dependencies', paths: [shared] })
      const restored = await pool.generate(sources[0]!, options)
      expect(restored.css).toBe(initial[0]!.css)
    }
    finally {
      pool.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

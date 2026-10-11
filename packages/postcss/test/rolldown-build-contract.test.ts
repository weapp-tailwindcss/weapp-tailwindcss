import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { createPostcssTsdownConfigs } from '../tsdown.config.mts'

it('真实多入口构建保留独立 CJS 语法入口及 ESM/CJS source map', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'postcss-rolldown-contract-'))
  try {
    for (const config of createPostcssTsdownConfigs()) {
      await build({
        ...config,
        config: false,
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        outDir: temporary,
        sourcemap: true,
        logLevel: 'silent',
      })
    }
    const files = await readdir(temporary, { recursive: true })
    for (const extension of ['js', 'cjs']) {
      for (const entry of ['syntax', 'transform']) {
        expect((await readFile(path.join(temporary, `${entry}.${extension}`), 'utf8')).length).toBeGreaterThan(0)
      }
      // 仅重导出的入口可能没有 map；实际实现所在的分块必须交付有效映射。
      const maps = files.filter(file => file.endsWith(`.${extension}.map`))
      expect(maps.length).toBeGreaterThan(0)
      for (const name of maps) {
        const file = path.join(temporary, name)
        const map = JSON.parse(await readFile(file, 'utf8'))
        expect(await readFile(file.slice(0, -4), 'utf8')).toContain('sourceMappingURL=')
        expect(map.version).toBe(3)
        expect(map.sources.length).toBeGreaterThan(0)
        expect(map.sourcesContent.some((source: string) => source.length > 0)).toBe(true)
        expect(map.mappings.length).toBeGreaterThan(0)
      }
    }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}, 30_000)

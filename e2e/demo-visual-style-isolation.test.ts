import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readManifest, writeManifest, writeStyleIsolationVariantManifest } from '../scripts/demo-visual-e2e-report/style-isolation'

const demoRequire = createRequire(path.resolve('demo/uni-app-vite-tailwindcss-v4/package.json'))
const uniRequire = createRequire(demoRequire.resolve('@dcloudio/uni-cli-shared'))
const { initPreContext, preJson } = uniRequire('./preprocess')
const { parse } = uniRequire('jsonc-parser')

function parsePlatform(source: string, platform: string) {
  initPreContext(platform)
  const errors: unknown[] = []
  const value = parse(preJson(source), errors, { allowTrailingComma: true })
  expect(errors).toEqual([])
  return value
}

describe('视觉变体 manifest 条件配置', () => {
  it.each(['2', '"2"'])('数字和字符串 %s 均在默认变体移除，在 v2 变体无条件生效', async (value) => {
    const source = `{
      "uni-app-x": {
        // #ifdef H5
        "styleIsolationVersion": ${value}
        // #endif
      },
      "other": { "styleIsolationVersion": "2" }
    }`
    const root = await fs.mkdtemp(path.join(tmpdir(), 'visual-manifest-'))
    try {
      for (const variant of [{}, { styleIsolationVersion: '2' as const }]) {
        await writeManifest(root, source)
        await writeStyleIsolationVariantManifest(root, variant)
        const result = await readManifest(root)
        expect(result).toContain('// #ifdef H5')
        expect(result).toContain('// #endif')
        for (const platform of ['h5', 'mp-weixin']) {
          const parsed = parsePlatform(result, platform)
          expect(parsed['uni-app-x'].styleIsolationVersion).toBe(variant.styleIsolationVersion)
          expect(parsed.other.styleIsolationVersion).toBe('2')
        }
        await writeStyleIsolationVariantManifest(root, variant)
        expect(await readManifest(root)).toBe(result)
      }
      await writeManifest(root, source)
      expect(await readManifest(root)).toBe(source)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it.each([
    '"styleIsolationVersion": 2, "keep": { "styleIsolationVersion": "2", "text": "}" }',
    '"keep": true, /* 分隔注释 */ "styleIsolationVersion": "2"',
    '"keep": true // 尾部注释',
    '// 只有注释',
  ])('仅变更目标对象直接属性并保留注释：%s', async (body) => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'visual-manifest-'))
    try {
      const source = `{ "uni-app-x": {\n${body}\n}, "sibling": true }`
      for (const variant of [{}, { styleIsolationVersion: '2' as const }]) {
        await writeManifest(root, source)
        await writeStyleIsolationVariantManifest(root, variant)
        const result = parsePlatform(await readManifest(root), 'mp-weixin')
        const original = parsePlatform(source, 'mp-weixin')
        expect(result).toEqual({
          ...original,
          'uni-app-x': { ...original['uni-app-x'], styleIsolationVersion: variant.styleIsolationVersion },
        })
      }
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

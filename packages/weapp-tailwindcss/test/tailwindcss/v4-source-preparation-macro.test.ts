import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileCssMacroConditionalComments } from '@/css-macro/auto'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { resolveCssMacroTailwindV4Source } from '@/tailwindcss/v4-engine/css-macro-source'

const samples = [
  ['内层条件', '@custom-variant wx { /* #ifdef MP-WEIXIN */ @slot; /* #endif */ }'],
  ['负向条件', '@custom-variant h5 { /* #ifndef MP */ @slot; /* #endif */ }'],
  ['嵌套条件', '@custom-variant wx { /* #ifdef MP */ /* #ifdef MP-WEIXIN */ @slot; /* #endif */ /* #endif */ }'],
  ['嵌套选择器', '@custom-variant active { &:active { /* #ifndef MP */ @slot; /* #endif */ } }'],
  ['共享外层条件', '/* #ifndef MP */ @custom-variant active { &:active { @slot; } } @custom-variant hover { &:hover { @slot; } } /* #endif */'],
  ['混合外层条件', '/* #ifndef MP */ .web-only { color: red; } @custom-variant active { &:active { @slot; } } /* #endif */'],
] as const

function expectIdempotent(css: string) {
  const source = { css, base: process.cwd(), baseFallbacks: [], dependencies: [] }
  const prepared = resolveCssMacroTailwindV4Source(source)
  const repeated = resolveCssMacroTailwindV4Source(prepared)
  expect(repeated.css).toBe(prepared.css)
}

describe('宏来源的单次准备契约', () => {
  it.each(samples)('%s 的二次准备不再改变 CSS', (_name, css) => {
    expectIdempotent(css)
  })

  it.each([
    'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    'uni-app-x-vdom-tailwindcss-v4',
    'uni-app-x-vapor-tailwindcss-v4',
  ])('真实 %s 入口的二次准备不再改变 CSS', async (demo) => {
    const file = fileURLToPath(new URL(`../../../../demo/${demo}/main.css`, import.meta.url))
    expectIdempotent(await readFile(file, 'utf8'))
  })

  it.each(['web', 'weapp'] as const)('混合条件在 %s 的直接和增量生成中保留平台语义', async (target) => {
    const source = await resolveTailwindV4Source({
      css: '@theme { --spacing: 1rpx; } @tailwind utilities; /* #ifndef MP */ .web-only { color: red; } @custom-variant gated { @slot; } /* #endif */',
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    try {
      for (const platform of ['h5', 'mp-weixin']) {
        const options = { target, scanSources: false, candidates: ['gated:p-4'], styleOptions: { platform } }
        const direct = await engine.generate(options)
        const incremental = await engine.generate({ ...options, incrementalCache: true })
        expect(incremental.css).toBe(direct.css)
        expect(incremental.rawCss).toBe(direct.rawCss)
        expect(incremental.classSet).toEqual(direct.classSet)
        const compiledCss = compileCssMacroConditionalComments(direct.css, { platform })
        expect(compiledCss.includes('.gated')).toBe(platform === 'h5')
      }
    }
    finally {
      engine.dispose()
    }
  })
})

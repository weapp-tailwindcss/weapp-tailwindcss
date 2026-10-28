import type { RollupOutput } from 'rollup'
import type { UserDefinedOptions } from '@/types'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcssWeb } from '@/vite-web'

async function buildCss(cssOptions: UserDefinedOptions['cssOptions'], spacing: string) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-vite-web-calc-units-')))
  try {
    await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(path.join(root, 'index.html'), '<script type="module" src="./main.ts"></script><div class="w-2 p-[2rem]"></div>')
    await writeFile(path.join(root, 'main.ts'), 'import "./theme.css";import "./author.css";')
    await writeFile(path.join(root, 'theme.css'), `@import "tailwindcss" source(none);@source inline("w-2 p-[2rem]");@theme{--spacing:${spacing}}`)
    await writeFile(path.join(root, 'author.css'), '.units-target{width:calc(var(--spacing)*2)}')
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: WeappTailwindcssWeb({
        cssEntries: [path.join(root, 'theme.css')],
        tailwindcssBasedir: root,
        cssOptions: { cssCalc: ['--spacing'], ...cssOptions },
      }),
      build: { write: false, cssMinify: false },
    }) as RollupOutput
    return result.output
      .filter(output => output.type === 'asset' && output.fileName.endsWith('.css'))
      .map(output => String(output.source))
      .join('\n')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('Web 真实构建的 calc 与显式单位转换', () => {
  it.each([
    { name: 'rem2rpx', options: { rem2rpx: true }, spacing: '.375rem', expected: '24rpx' },
    { name: 'px2rpx', options: { px2rpx: true }, spacing: '2px', expected: '4rpx' },
    { name: 'unitsToPx', options: { unitsToPx: { unitMap: { rem: 10 } } }, spacing: '2rem', expected: '40px' },
    {
      name: 'unitConversion 的 Web 平台配置',
      options: { unitConversion: { default: false, platforms: { web: { rules: [{ from: 'rpx', to: 'px', factor: 0.5 }] } } } },
      spacing: '2rpx',
      expected: '2px',
    },
  ])('$name 在跨资产求值后执行', async ({ options, spacing, expected }) => {
    const css = await buildCss(options as UserDefinedOptions['cssOptions'], spacing)
    expect(css.match(/\.units-target\s*\{[^}]*\}/)?.[0]).toMatch(new RegExp(`width:\\s*${expected}\\s*;?\\s*\\}`))
  })

  it('未配置单位转换时保留 Web 单位和选择器', async () => {
    const css = await buildCss({}, '.375rem')
    expect(css.match(/\.units-target\s*\{[^}]*\}/)?.[0]).toContain('0.75rem')
    expect(css).toContain(':root')
    expect(css).not.toContain('rpx')
  })

  it.each([{ cssCalc: false }, { cssCalc: ['--spacing'] }] as const)('cssCalc=$cssCalc 时非幂等单位规则只执行一次', async ({ cssCalc }) => {
    for (const options of [
      { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] }, expected: '4rem' },
      { unitsToPx: { unitMap: { rem: 10 } }, unitConversion: { rules: [{ from: 'px', to: 'rem', factor: 0.5 }] }, expected: '10rem' },
    ]) {
      const { expected, ...units } = options
      const css = await buildCss({ ...units, cssCalc } as UserDefinedOptions['cssOptions'], '2rem')
      expect(css.match(/\.p-\\\[2rem\\\]\s*\{[^}]*\}/)?.[0]).toContain(`padding: ${expected}`)
      if (cssCalc) {
        const width = Number.parseFloat(expected) * 2
        expect(css.match(/\.units-target\s*\{[^}]*\}/)?.[0]).toMatch(new RegExp(`width:\\s*${width}rem\\s*[;}]`))
      }
    }
  })
})

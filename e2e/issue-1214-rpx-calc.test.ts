import type { FixtureOptions } from './issue-1214/project'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { buildProject, createProject, probeProperties, readOutput, readProbeDeclarations } from './issue-1214/project'

const staticCases: Array<{ name: string, options: FixtureOptions, base: number }> = [
  { name: 'default', options: {}, base: 1 },
  { name: 'default-2rpx', options: { spacing: '2rpx' }, base: 2 },
  { name: 'default-3rpx', options: { spacing: '3rpx' }, base: 3 },
  { name: 'default-8rpx', options: { spacing: '8rpx' }, base: 8 },
  { name: 'default-inline', options: { inline: true, spacing: '3rpx' }, base: 3 },
  { name: 'default-fraction', options: { spacing: '0.5rpx' }, base: 0.5 },
  { name: 'default-negative', options: { spacing: '-0.5rpx' }, base: -0.5 },
  { name: 'default-alias', options: { spacing: 'var(--base)', overrides: '@theme { --base: 3rpx; }' }, base: 3 },
  { name: 'top-level-1rpx', options: { calc: 'top-level', spacing: '1rpx' }, base: 1 },
  { name: 'nested-2rpx', options: { calc: 'nested', spacing: '2rpx' }, base: 2 },
  { name: 'odd-3rpx', options: { calc: 'nested', spacing: '3rpx' }, base: 3 },
  { name: 'inline-8rpx', options: { calc: 'nested', inline: true, spacing: '8rpx' }, base: 8 },
  { name: 'fractional-base', options: { calc: 'nested', spacing: '0.5rpx' }, base: 0.5 },
]

const runtimeCases: Array<{ name: string, options: FixtureOptions, override?: RegExp }> = [
  { name: 'disabled', options: { calc: 'off' } },
  { name: 'unresolved', options: { spacing: 'var(--runtime-spacing)' } },
  {
    name: 'local-override',
    options: { overrides: '.scope { --spacing: 2rpx; }' },
    override: /\.scope\s*\{\s*--spacing:\s*2rpx/,
  },
  {
    name: 'conditional-override',
    options: { overrides: '@media (min-width: 400px) { :root { --spacing: 2rpx; } }' },
    override: /@media\s*\(min-width:\s*400px\)[\s\S]*--spacing:\s*2rpx/,
  },
  {
    name: 'external-author-override',
    options: { authorCss: '.scope { --spacing: 2rpx; }' },
    override: /\.scope\s*\{\s*--spacing:\s*2rpx/,
  },
]

const multipliers: Record<string, number> = {
  '.w-32': 32,
  '.h-32': 32,
  '.p-4': 4,
  '.mt-4': 4,
  '.gap-4': 4,
  '.-mt-4': -4,
  '.p-0_d5': 0.5,
  '.-mt-0_d5': -0.5,
}

describe('Issue #1214 真实 uni-app 微信 WXSS', () => {
  it.each(staticCases)('$name 输出最终 rpx，含负值与小数候选', async ({ name, options, base }) => {
    const project = await createProject(options)
    try {
      const build = await buildProject(project)
      expect(`${build.stdout}\n${build.stderr}`).not.toContain('[rpx-theme]')
      process.stdout.write(`[issue-1214] ${JSON.stringify(project.versions)} ${build.stdout.match(/Compiler version[^\n]*/)?.[0]}\n`)
      const { css, wxml } = await readOutput(project)
      expect(wxml).toContain('issue-1214-initial')
      expect(css).not.toMatch(/@(theme|tailwind|source)\b/)
      const declarations = readProbeDeclarations(css)
      expect(Object.keys(declarations).sort()).toEqual(Object.keys(probeProperties).sort())
      for (const [selector, multiplier] of Object.entries(multipliers)) {
        const values = declarations[selector]
        expect(values, selector).toHaveLength(1)
        expect(values[0], selector).toMatch(/^-?(?:\d*\.)?\d+rpx$/)
        expect(Number.parseFloat(values[0]), selector).toBe(base * multiplier)
      }
      expect(css).not.toMatch(/calc\([^;{}]*var\(--spacing\)/)
      await expect(`${JSON.stringify(declarations, null, 2)}\n`).toMatchFileSnapshot(`__snapshots__/issue-1214/${name}.json`)
    }
    finally {
      await project.close()
    }
  }, 150_000)

  it.each(runtimeCases)('$name 保留运行时变量表达式', async ({ name, options, override }) => {
    const project = await createProject(options)
    try {
      const build = await buildProject(project)
      const warnings = `${build.stdout}\n${build.stderr}`.match(/\[rpx-theme\]/g) ?? []
      expect(warnings).toHaveLength(name === 'unresolved' ? 0 : 1)
      const { css, wxml } = await readOutput(project)
      expect(wxml).toContain('issue-1214-initial')
      const declarations = readProbeDeclarations(css)
      expect(Object.keys(declarations).sort()).toEqual(Object.keys(probeProperties).sort())
      for (const [selector, values] of Object.entries(declarations)) {
        expect(values.at(-1), selector).toMatch(/calc\(var\(--spacing\)/)
      }
      if (name === 'unresolved') {
        expect(css).toMatch(/--spacing:\s*var\(--runtime-spacing\)/)
      }
      if (override) {
        expect(css).toMatch(override)
      }
      await expect(`${JSON.stringify(declarations, null, 2)}\n`).toMatchFileSnapshot(`__snapshots__/issue-1214/${name}.json`)
    }
    finally {
      await project.close()
    }
  }, 150_000)
})

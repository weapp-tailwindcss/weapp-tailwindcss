import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import { describe, expect, it } from 'vitest'

describe('installed preset-env autoprefixer contract', () => {
  it('typechecks false, options and omission while rejecting unsupported values', () => {
    const require = createRequire(import.meta.url)
    const compiler = require.resolve('typescript/bin/tsc')
    const project = fileURLToPath(new URL('./fixtures/preset-env-types/tsconfig.json', import.meta.url))
    const result = spawnSync(process.execPath, [compiler, '--project', project, '--pretty', 'false'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  })

  it('keeps the real default prefixer and disables it only when configured', async () => {
    const css = '.x{display:flex}'
    const options = { stage: false as const, browsers: ['ie 10'] }
    const defaults = await postcss([postcssPresetEnv(options)]).process(css, { from: undefined })
    const disabled = await postcss([postcssPresetEnv({ ...options, autoprefixer: false })]).process(css, { from: undefined })
    const configured = await postcss([postcssPresetEnv({ ...options, autoprefixer: { add: false } })]).process(css, { from: undefined })
    expect(defaults.css).toBe('.x{display:-ms-flexbox;display:flex}')
    expect(disabled.css).toBe(css)
    expect(configured.css).toBe(css)
  })
})

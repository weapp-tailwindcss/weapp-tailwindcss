import type { Transform } from 'node:stream'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import Vinyl from 'vinyl'
import { afterEach, expect, it, vi } from 'vitest'
import { createPlugins } from '@/bundlers/gulp'

function runTransform(transform: Transform, file: Vinyl) {
  return new Promise<Vinyl>((resolve, reject) => {
    transform.once('data', resolve)
    transform.once('error', reject)
    transform.end(file)
  })
}

afterEach(() => vi.restoreAllMocks())

it.each([
  { split: true, cssCalc: true },
  { split: true, cssCalc: false },
  { split: false, cssCalc: true },
  { split: false, cssCalc: false },
])('Gulp 在适配后按最终 calc 决定警告：%j', async ({ split, cssCalc }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gulp-rpx-warning-'))
  const file = path.join(directory, 'tokens.css')
  const source = '@import "tailwindcss" source(none); @source inline("p-8"); @theme { --spacing: 1rpx; }'
  await writeFile(file, source)
  const plugins = createPlugins({
    platform: 'mp-weixin',
    tailwindcssBasedir: process.cwd(),
    cssEntries: [file],
    cssPreflight: false,
    cssCalc,
  })
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  try {
    const input = new Vinyl({ cwd: directory, base: directory, path: file, contents: Buffer.from(source) })
    let output: Vinyl
    if (split) {
      const generated = await runTransform(plugins.generateWxss(), input)
      expect(warn).not.toHaveBeenCalled()
      output = await runTransform(plugins.adaptWxss(), generated)
    }
    else {
      output = await runTransform(plugins.transformWxss(), input)
    }
    const css = output.contents!.toString()
    expect(css).toMatch(cssCalc ? /padding:\s*8rpx/ : /padding:\s*calc\(var\(--spacing\)/)
    expect(warn).toHaveBeenCalledTimes(cssCalc ? 0 : 1)
    if (!cssCalc) {
      expect(warn.mock.lastCall?.[0]).toContain('最终样式仍含 rpx 运行时 calc')
    }
  }
  finally {
    await plugins.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

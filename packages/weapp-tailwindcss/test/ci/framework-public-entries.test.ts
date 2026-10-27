import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(path.join(packageRoot, 'package.json'))
const entries = ['', '/vite', '/vite/web', '/webpack', '/rspack', '/gulp', '/core', '/generator', '/presets', '/framework']

describe('框架隔离后的发布兼容性', () => {
  it.each(entries)('公开入口 weapp-tailwindcss%s 的 ESM/CJS 导出一致且声明存在', async (suffix) => {
    const name = `weapp-tailwindcss${suffix}`
    const esm = await import(name)
    const cjs = require(name)
    const keys = (value: object) => Object.keys(value).filter(key => key !== 'default' && key !== '__esModule').sort()
    expect(keys(esm)).toEqual(keys(cjs))
    const manifest = require('weapp-tailwindcss/package.json')
    const declaration = manifest.exports[suffix ? `.${suffix}` : '.'].types
    expect(fs.existsSync(path.resolve(packageRoot, declaration))).toBe(true)
  })

  it('HBuilderX 的同步 require 链路不要求加载纯 ESM 官方插件，Webpack loader 保持可解析', () => {
    // 按仓库支持的 Node 语义加载，并单独禁止同步引入官方 Tailwind 生成插件。
    const output = execFileSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict')
      const path = require('node:path')
      const Module = require('node:module')
      const load = Module._load
      Module._load = function (request, ...args) {
        assert.ok(!/^@tailwindcss\\/(?:vite|postcss)(?:$|\\/)/.test(request), request)
        return load.call(this, request, ...args)
      }
      assert.equal(typeof require('weapp-tailwindcss/vite').WeappTailwindcss, 'function')
      require('weapp-tailwindcss/presets')
      const directory = path.dirname(require.resolve('weapp-tailwindcss/webpack'))
      for (const name of ['weapp-tw-runtime-classset-loader', 'weapp-tw-css-generation-loader', 'weapp-tw-css-import-rewrite-loader']) {
        const loader = require(path.join(directory, name + '.cjs'))
        assert.equal(typeof (loader.default ?? loader), 'function')
      }
      process.stdout.write('compatible')
    `], { cwd: packageRoot, encoding: 'utf8', timeout: 30_000 })
    expect(output).toBe('compatible')
  })
})

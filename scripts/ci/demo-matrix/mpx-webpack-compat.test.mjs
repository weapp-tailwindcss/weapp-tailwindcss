import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { compileFunction } from 'node:vm'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

const consumers = ['demo/mpx-tailwindcss-v4', 'demo/style-injector-mpx', 'starter/mpx', 'packages/weapp-tailwindcss']

it.each(consumers)('Mpx 完整插件从 %s 消费同一个 Webpack 模块身份', async (project) => {
  // 独立进程隔离 Webpack 序列化注册表，真实加载入口、异步依赖和 WXS 子编译器。
  const result = await execa(process.execPath, ['-e', `
    const assert = require('node:assert/strict')
    const { createRequire } = require('node:module')
    const project = createRequire(process.argv[1])
    const plugin = createRequire(project.resolve('@mpxjs/webpack-plugin/package.json'))
    const webpack = plugin('webpack')
    assert.equal(webpack, project('webpack'))
    assert.equal(typeof project('@mpxjs/webpack-plugin'), 'function')
    for (const name of ['CommonJsAsyncDependency', 'CommonJsExtractDependency', 'CommonJsVariableDependency', 'ImportDependency']) {
      const Dependency = plugin('./lib/dependencies/' + name)
      assert.ok(Dependency.prototype instanceof webpack.dependencies.ModuleDependency, name)
    }
    plugin('./lib/dependencies/RetryRuntimeModule')
    plugin('./lib/react/LoadAsyncChunkModule')
    plugin('./lib/wxs/WxsTemplatePlugin')
    assert.equal(typeof plugin('./lib/wxs/loader'), 'function')
    process.stdout.write('mpx-webpack-compat-ready')
  `, path.join(repo, project, 'package.json')], { reject: false, timeout: 15_000 })
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('mpx-webpack-compat-ready')
})

it('Mpx 入口导出保护兼容真实旧版 Webpack 并传播模块加载错误', () => {
  const project = createRequire(path.join(repo, 'demo', 'mpx-tailwindcss-v4', 'package.json'))
  const plugin = createRequire(project.resolve('@mpxjs/webpack-plugin/package.json'))
  const source = readFileSync(plugin.resolve('./lib/utils/flag-entry-export-as-used-plugin'), 'utf8')
  const taro = createRequire(path.join(repo, 'demo', 'taro-webpack-react-tailwindcss-v4', 'package.json'))
  const runner = createRequire(taro.resolve('@tarojs/webpack5-runner/package.json'))
  for (const localRequire of [plugin, runner]) {
    const module = { exports: {} }
    compileFunction(source, ['require', 'module'])(localRequire, module)
    expect(typeof module.exports.prototype.apply).toBe('function')
  }

  const failure = Object.assign(new Error('入口保护插件内部依赖加载失败'), { code: 'MODULE_NOT_FOUND' })
  const requests = []
  const load = Object.assign(() => {
    throw failure
  }, {
    resolve(id) {
      requests.push(id)
      return id
    },
  })
  expect(() => compileFunction(source, ['require', 'module'])(load, { exports: {} })).toThrow(failure)
  expect(requests).toHaveLength(1)
})

it('独立 Mpx 模板携带同一兼容补丁与注册', () => {
  const patch = 'patches/@mpxjs__webpack-plugin@2.11.1.patch'
  const template = path.join(repo, 'templates', 'mpx-tailwindcss-v4')
  expect(readFileSync(path.join(template, patch), 'utf8')).toBe(readFileSync(path.join(repo, patch), 'utf8'))
  expect(readFileSync(path.join(template, 'pnpm-workspace.yaml'), 'utf8')).toContain(`'@mpxjs/webpack-plugin@2.11.1': ${patch}`)
})

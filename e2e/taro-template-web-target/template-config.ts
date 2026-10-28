import type { Compiler } from 'webpack'
import type { UserDefinedOptions } from '../../packages/weapp-tailwindcss/src/types'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const repoRoot = path.resolve(__dirname, '../..')
export type TaroTemplate = 'taro-vite-tailwindcss-v4' | 'taro-webpack-tailwindcss-v4'
export interface WebpackPluginInstance { apply: (compiler: Compiler) => void }
interface WebpackPluginConstructor { new (...args: unknown[]): WebpackPluginInstance }
export interface TemplateConfig {
  designWidth: number
  deviceRatio: Record<number, number>
  compiler: string | { vitePlugins: UserDefinedOptions[] }
  mini: { webpackChain?: (chain: unknown) => void }
  h5: {
    postcss: {
      pxtransform: { config: { baseFontSize: number, minRootSize: number, maxRootSize: number } }
    }
    htmlPluginOption?: Record<string, unknown>
    webpackChain?: (chain: unknown) => void
  }
  rn: Record<string, unknown>
}

// 执行模板原始配置和环境分支，只替换构建器入口，不启动 Taro/Vite/Webpack。
export async function loadTemplate(template: TaroTemplate, target: string) {
  const configRoot = path.join(repoRoot, 'templates', template, 'config')
  const mockProcess = { env: { TARO_ENV: target, NODE_ENV: 'production' }, cwd: () => path.dirname(configRoot) }
  const sentinel = class WeappTailwindcss {}
  const dependencyRequire = process.env.E2E_TARO_TEMPLATE_PUBLISHED === '1'
    ? createRequire(path.join(repoRoot, 'templates', template, 'package.json'))
    : createRequire(path.join(repoRoot, 'packages', 'postcss', 'package.json'))
  function load(file: string): { default: unknown } {
    const module = { exports: {} }
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: file,
    }).outputText
    const templateRequire = (id: string): unknown => {
      if (id === '@tarojs/cli') {
        return { defineConfig: (callback: unknown) => callback }
      }
      if (id === 'weapp-tailwindcss/vite') {
        return { WeappTailwindcss: (options: UserDefinedOptions) => options }
      }
      if (id === 'weapp-tailwindcss/webpack') {
        return { WeappTailwindcss: sentinel }
      }
      if (id === 'tsconfig-paths-webpack-plugin') {
        return class TsconfigPathsPlugin {}
      }
      if (id.startsWith('.')) {
        return load(path.resolve(path.dirname(file), `${id}.ts`))
      }
      return dependencyRequire(id)
    }
    runInNewContext(source, { exports: module.exports, module, require: templateRequire, process: mockProcess, __dirname: path.dirname(file) }, { filename: file })
    return module.exports as { default: unknown }
  }
  const callback = load(path.join(configRoot, 'index.ts')).default as (merge: (...configs: unknown[]) => unknown, env: unknown) => Promise<TemplateConfig>
  const config = await callback((_empty, base) => base, { command: 'build', mode: 'production' })
  const options: UserDefinedOptions[] = []
  const webpackPlugins: WebpackPluginInstance[] = []
  if (typeof config.compiler === 'object') {
    options.push(...config.compiler.vitePlugins)
  }
  else if (!['rn', 'jdrn'].includes(target)) {
    const plugin = (_name: string) => ({ use: (implementation: unknown, args: unknown[] = []) => {
      if (implementation === sentinel) {
        options.push(...args as UserDefinedOptions[])
      }
      else if (typeof implementation === 'function' && implementation.prototype.apply) {
        webpackPlugins.push(new (implementation as WebpackPluginConstructor)(...args))
      }
    } })
    const chain = {
      resolve: { plugin },
      plugin,
      merge: (value: { plugin: { install: { args: UserDefinedOptions[] } } }) => options.push(...value.plugin.install.args),
    }
    const section = target === 'h5' || target === 'harmony-hybrid' ? config.h5 : config.mini
    section.webpackChain?.(chain)
  }
  return { config, options, webpackPlugins }
}

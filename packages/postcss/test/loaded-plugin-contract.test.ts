import type { Plugin, Root } from 'postcss'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { isAutoprefixerPlugin } from '@/autoprefixer'
import { processUserCss } from '@/framework-pipeline'
import { createStyleHandler } from '@/handler'

describe('作者插件配置与已加载插件契约', () => {
  it('真实公开类型定义保留集合、模块与工厂域并拒绝无效引用', () => {
    const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    const project = fileURLToPath(new URL('./fixtures/loaded-plugin-types/tsconfig.json', import.meta.url))
    const result = spawnSync(process.execPath, [compiler, '--project', project, '--pretty', 'false'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  })

  it('按 map 值顺序重放具体选项工厂及异步嵌套默认模块', async () => {
    const factory = (options: { suffix: string }): Plugin => ({
      postcssPlugin: 'object-options',
      Once(root) {
        root.walkDecls((declaration) => {
          declaration.value += options.suffix
        })
      },
    })
    const asyncFactory = async (suffix: string) => ({ default: { default: {
      postcssPlugin: 'async-options',
      Once(root: Root) {
        root.walkDecls((declaration) => {
          declaration.value += suffix
        })
      },
    } } })
    const result = await processUserCss('.a{color:red}', { plugins: {
      first: [{ default: { default: factory } }, { suffix: '-one' }],
      disabled: ['missing-disabled-plugin', false],
      second: [asyncFactory, '-two'],
    } })
    expect(result.css).toBe('.a{color:red-one-two}')
  })

  it('map autoprefixer 键保持身份含义，false 值保留默认前缀器', async () => {
    const Once = vi.fn()
    const handler = createStyleHandler({ majorVersion: 4, cssPreflight: false, postcssOptions: { plugins: {
      autoprefixer: { postcssPlugin: 'explicit-author-prefixer', Once },
    } } })
    const css = '.a{user-select:none}'
    expect((await handler(css)).css).toBe(css)
    expect(Once).toHaveBeenCalledTimes(1)
    expect(handler.getPipeline().nodes.some(node => node.id === 'normal:autoprefixer')).toBe(false)
    const disabledEntry = createStyleHandler({ majorVersion: 4, cssPreflight: false, postcssOptions: { plugins: {
      autoprefixer: false,
    } } })
    expect(disabledEntry.getPipeline().nodes.some(node => node.id === 'normal:autoprefixer')).toBe(true)
  })

  it('未归一化身份探测接受真实对象和函数，不推断其他配置引用', () => {
    const factory = Object.assign(() => undefined, { postcssPlugin: 'autoprefixer' })
    expect(isAutoprefixerPlugin(factory)).toBe(true)
    expect(isAutoprefixerPlugin({ postcssPlugin: 'autoprefixer' })).toBe(true)
    for (const value of [undefined, null, false, true, 1, 'autoprefixer', {}, ['autoprefixer', {}]]) {
      expect(isAutoprefixerPlugin(value)).toBe(false)
    }
  })
})

import type { Plugin, Root } from 'postcss'
import type { LoadedPostcssOptions } from '../../../src/postcss-plugin-options'
import postcss from 'postcss'

const plugin: Plugin = { postcssPlugin: 'fixture' }
const factory = (options: { color: string }): Plugin => ({ postcssPlugin: options.color })
const asyncFactory = async (suffix: string) => ({ default: { default: { postcssPlugin: suffix } } })
function zeroArguments(): Plugin {
  return plugin
}
function legacy(root: Root) {
  root.removeAll()
}
const pack = postcss([plugin])
function accept(options: LoadedPostcssOptions) {
  return options
}

accept({ plugins: [plugin, legacy, pack, 'module-name', { default: { default: plugin } }] })
accept({ plugins: [[factory, { color: 'blue' }], [asyncFactory, 'suffix'], [zeroArguments], ['module-name', false]] })
accept({ plugins: [[{ default: { default: factory } }, { color: 'red' }]] })
accept({ plugins: [false, null, undefined] })
accept({ plugins: { first: plugin, second: [factory, { color: 'green' }], autoprefixer: false } })
accept({})

// @ts-expect-error 裸 true 不是有效的插件引用。
accept({ plugins: [true] })
// @ts-expect-error 数字不是有效的插件引用。
accept({ plugins: { invalid: 1 } })
// @ts-expect-error 空对象不能当作插件。
accept({ plugins: [{}] })
// @ts-expect-error 工厂结果仍须是已归一化的 PostCSS 插件。
accept({ plugins: [[(options: { color: string }) => options.color, { color: 'blue' }]] })
// @ts-expect-error 默认模块不能包装禁用标记。
accept({ plugins: [{ default: false }] })
// @ts-expect-error tuple 仅在配置条目顶层识别。
accept({ plugins: [{ default: [factory, { color: 'blue' }] }] })
// @ts-expect-error 工厂返回模块内部的 Promise 不会再次 await。
accept({ plugins: [[(options: string) => ({ default: Promise.resolve({ postcssPlugin: options }) }), 'blue']] })
// @ts-expect-error 裸 false 条目可禁用插件，工厂输出的 false 不属于插件结果。
accept({ plugins: [[(_options: string) => false, 'blue']] })
// @ts-expect-error await 后的 false 也不是有效插件结果。
accept({ plugins: [[async (_options: string) => false, 'blue']] })
// @ts-expect-error 工厂结果的默认模块不能包装禁用标记。
accept({ plugins: [[(_options: string) => ({ default: false }), 'blue']] })

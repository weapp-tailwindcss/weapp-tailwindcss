// 根据配置生成 calc 相关插件，支持小程序兼容参数
import type { PostCssCalcOptions } from '@weapp-tailwindcss/postcss-calc'
import type { AcceptedPlugin, Plugin } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import postcssCalc from '@weapp-tailwindcss/postcss-calc'
import { analyzeCssCalcContext } from '../utils/css-calc-context'
import { getCssCalcVariableReferences, isCssCalcCustomPropertySelected } from '../utils/css-custom-property'
import { getAutoCalcPlugin } from './auto-calc'

export function getCalcPlugin(options: IStyleHandlerOptions): AcceptedPlugin | null {
  if (options.cssCalc === 'auto') {
    return getAutoCalcPlugin(options)
  }
  if (!options.cssCalc) {
    return null
  }
  const configured: PostCssCalcOptions = typeof options.cssCalc === 'object' && !Array.isArray(options.cssCalc)
    ? { ...options.cssCalc }
    : {}
  const includes = [...(Array.isArray(options.cssCalc) ? options.cssCalc : configured.includeCustomProperties) ?? []]
  const inputValues = options.customPropertyValues ?? configured.customPropertyValues
  const explicitValues = inputValues ? new Map(inputValues) : undefined
  const contextCss = options.customPropertyContextCss ?? ''
  const selectAll = options.cssCalc === true
  return {
    postcssPlugin: 'postcss-calc',
    Once(root, helpers) {
      // 上游作者插件阶段已经完成；在主题作用域和单位改写前读取当前 AST。
      const context = analyzeCssCalcContext([contextCss, root.toString()].join('\n'), explicitValues)
      const selectedValues = new Map([...context.customPropertyValues]
        .filter(([name]) => selectAll || isCssCalcCustomPropertySelected(name, includes)))
      const customPropertyValues = new Map<string, string>()
      // 底层 calc 按引用原文查表；只给已通过统一身份检查的变量补齐拼写别名。
      root.walk((node) => {
        const value = node.type === 'decl'
          ? node.value
          : node.type === 'atrule' && configured.mediaQueries
            ? node.params
            : node.type === 'rule' && configured.selectors ? node.selector : undefined
        if (!value) {
          return
        }
        for (const [rawName, name] of getCssCalcVariableReferences(value)) {
          const resolved = selectedValues.get(name)
          if (resolved !== undefined) {
            customPropertyValues.set(rawName, resolved)
          }
        }
      })
      const plugin = postcssCalc({
        ...configured,
        customPropertyValues,
        includeCustomProperties: [...customPropertyValues.keys()],
      }) as Plugin
      return plugin.OnceExit?.(root, helpers)
    },
  }
}

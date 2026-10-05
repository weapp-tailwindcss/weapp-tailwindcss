import type { PluginObject } from '@babel/core'
import type { ImageProps, TextProps, ViewProps } from 'react-native'
import type { NativeStyleValue } from '../../src/runtime/types'
import { StyleSheet } from 'react-native'
import babelPlugin from '../../src/babel'
import { withWeappTailwindcss } from '../../src/metro'
import { composeStyle, createNativeStyleRuntime, getStaticStyle, setStyleSheetFactory, tw } from '../../src/runtime'

setStyleSheetFactory(StyleSheet.create)
const view: ViewProps['style'] = tw('flex')
const text: TextProps['style'] = getStaticStyle(['text-white'])
const image: ImageProps['style'] = createNativeStyleRuntime().tw('w-4')
const inline = StyleSheet.create({ card: { opacity: 0.5 } }).card
const combined: ViewProps['style'] = composeStyle(tw('flex'), [inline, false, null, undefined])
const empty: TextProps['style'] = composeStyle(getStaticStyle(['text-white']), false)
const preserved: false = composeStyle(tw('flex'), false)[1]
const plugin: PluginObject = babelPlugin()
const sync = withWeappTailwindcss({ resolver: { sourceExts: ['js'] }, customField: 1 })
const custom: number = sync.customField
const extensions: string[] | undefined = sync.resolver?.sourceExts
const asyncConfig = withWeappTailwindcss(async () => ({ customField: 2 }))
const asyncCustom: Promise<number> = asyncConfig.then(config => config.customField)

void [view, text, image, combined, empty, preserved, plugin, custom, extensions, asyncCustom]

// 任意数字不是 React Native 注册过的 StyleSheet ID。
// @ts-expect-error 必须拒绝未经注册的数字样式。
const invalid: ViewProps['style'] = 42
void invalid

// @ts-expect-error NativeStyleValue 与原生组件一样拒绝任意数字。
const unregistered: NativeStyleValue = 42
void unregistered

import type { NativeManifestPublication, NativePlatform, NativeStyleManifest } from '../types'

// 保持 RN 0.81 的样式结构与注册品牌，避免编译器声明引入设备端全局类型。
type FalsyStyle = undefined | null | false | ''
type RegisteredStyle<T> = number & { __registeredStyleBrand: T }
interface RecursiveStyleArray<T> extends Array<T | ReadonlyArray<T> | RecursiveStyleArray<T>> {}
type StyleRecord = Record<string, unknown>

export interface NativeStyleEnvironment {
  colorScheme?: 'light' | 'dark' | undefined
  platform?: NativePlatform | undefined
  /** 未在当前元素指定字号时，调用方可显式传入已知的继承字号。 */
  fontSize?: number | undefined
  /** 当前元素没有文字颜色时，调用方可显式提供已知的继承颜色。 */
  color?: string | undefined
}

export type NativeClassValue = string | false | null | undefined | NativeClassValue[] | Record<string, boolean>
export type NativeStyleValue = StyleRecord | RegisteredStyle<StyleRecord> | RecursiveStyleArray<StyleRecord | RegisteredStyle<StyleRecord> | FalsyStyle> | FalsyStyle

export interface NativeStyleRuntime {
  tw: (value: NativeClassValue, environment?: NativeStyleEnvironment) => NativeStyleValue
  getStaticStyle: (ids: readonly string[], environment?: NativeStyleEnvironment) => NativeStyleValue
  composeStyle: <const InlineStyle>(tailwindStyle: NativeStyleValue, inlineStyle: InlineStyle) => [NativeStyleValue, InlineStyle] | [NativeStyleValue, InlineStyle, NativeStyleValue]
  setManifest: (manifest: NativeStyleManifest, publication?: NativeManifestPublication) => void
  setEnvironment: (environment: NativeStyleEnvironment) => void
  getManifest: () => NativeStyleManifest | undefined
  getPublication: () => NativeManifestPublication | undefined
}

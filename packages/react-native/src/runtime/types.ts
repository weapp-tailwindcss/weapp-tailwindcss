import type { StyleProp } from 'react-native'
import type { NativePlatform, NativeStyleManifest } from '../types'

export interface NativeStyleEnvironment {
  colorScheme?: 'light' | 'dark' | undefined
  platform?: NativePlatform | undefined
}

export type NativeClassValue = string | false | null | undefined | NativeClassValue[] | Record<string, boolean>
export type NativeStyleValue = StyleProp<Record<string, unknown>>

export interface NativeStyleRuntime {
  tw: (value: NativeClassValue, environment?: NativeStyleEnvironment) => NativeStyleValue
  getStaticStyle: (ids: readonly string[], environment?: NativeStyleEnvironment) => NativeStyleValue
  composeStyle: <const InlineStyle>(tailwindStyle: NativeStyleValue, inlineStyle: InlineStyle) => [NativeStyleValue, InlineStyle] | [NativeStyleValue, InlineStyle, NativeStyleValue]
  setManifest: (manifest: NativeStyleManifest) => void
  setEnvironment: (environment: NativeStyleEnvironment) => void
  getManifest: () => NativeStyleManifest | undefined
}

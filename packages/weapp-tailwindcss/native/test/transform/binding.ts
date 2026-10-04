import type { ParseConfig } from './reference'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export interface NativeTransformer {
  transform: (source: string, lang: ParseConfig['lang'], sourceType: ParseConfig['sourceType'], preserveParens: boolean, options: { alwaysEscape?: boolean, unescapeUnicode?: boolean, moduleGraph?: boolean, ignoreTaggedTemplates?: boolean, preserveStar?: boolean }) => string | null
  transformWithCandidates: (source: string, lang: ParseConfig['lang'], sourceType: ParseConfig['sourceType'], preserveParens: boolean, options: Parameters<NativeTransformer['transform']>[4], contains: (candidate: string) => boolean) => string | null
  replaceClassNames: (classes: string[]) => boolean
}

const report = process.platform === 'linux' ? process.report.getReport() as { header: { glibcVersionRuntime?: string } } : undefined
const abi = process.platform === 'win32' ? '-msvc' : process.platform === 'linux' ? report?.header.glibcVersionRuntime ? '-gnu' : '-musl' : ''
export const bindingPath = process.env.WEAPP_TW_NATIVE_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bindings', `weapp-tailwindcss-native.${process.platform}-${process.arch}${abi}.node`)
export const native = createRequire(import.meta.url)(bindingPath) as {
  createJsTransformer: (classes: string[], entries: { character: string, replacement: string }[]) => NativeTransformer | null
}

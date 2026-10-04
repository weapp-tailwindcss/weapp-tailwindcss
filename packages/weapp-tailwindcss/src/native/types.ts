export interface NativeJsTransformOptions {
  alwaysEscape?: boolean
  preserveStar?: boolean
  unescapeUnicode?: boolean
  moduleGraph?: boolean
  ignoreTaggedTemplates?: boolean
}

export interface NativeJsTransformer {
  transform: (source: string, lang: 'js' | 'jsx' | 'ts' | 'tsx', sourceType: 'module' | 'script' | 'unambiguous', preserveParens: boolean, options: NativeJsTransformOptions) => string | null
  transformWithCandidates: (source: string, lang: 'js' | 'jsx' | 'ts' | 'tsx', sourceType: 'module' | 'script' | 'unambiguous', preserveParens: boolean, options: NativeJsTransformOptions, contains: (candidate: string) => boolean) => string | null
  replaceClassNames: (classes: string[]) => boolean
}

export interface NativeJsEscapeEntry {
  character: string
  replacement: string
}

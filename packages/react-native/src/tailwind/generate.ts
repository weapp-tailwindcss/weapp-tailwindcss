/* eslint-disable style/max-statements-per-line */

import type { TailwindV4SourceOptions } from 'weapp-tailwindcss/generator'
import type { NativeStyleManifest } from '../types'
import process from 'node:process'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { addNativeVariantRules, baseClassName, compileNativeStylesheet, finalizeNativeManifest } from '../compiler'

export interface GenerateNativeStylesheetOptions extends Omit<TailwindV4SourceOptions, 'projectRoot' | 'cssEntries'> {
  /** Tailwind source 扫描根目录；用于 workspace 示例和 Metro 项目。 */
  projectRoot?: string | undefined
  /** Tailwind CSS 入口文件；相对路径会按 projectRoot 解析。 */
  cssEntries?: string[] | undefined
  candidates?: Iterable<string> | undefined
  sourceGlobs?: string[] | undefined
}

/**
 * 使用 weapp-tailwindcss 的 Tailwind v4 generator 生成原始 CSS，再编译为 RN manifest。
 */
export interface NativeStylesheetEvidence {
  /** Tailwind 生成阶段的原始 CSS，尚未经过原生属性编码。 */
  rawCss: string
  /** Tailwind 实际生成的精确候选集合，与编码后的 manifest.classSet 分离。 */
  generatedClassSet: string[]
  manifest: NativeStyleManifest
}

export async function generateNativeStylesheetEvidence(options: GenerateNativeStylesheetOptions = {}): Promise<NativeStylesheetEvidence> {
  const { projectRoot = process.cwd(), cssEntries, ...sourceOptions } = options
  const source = await resolveTailwindV4Source({ ...sourceOptions, projectRoot, ...(cssEntries ? { cssEntries } : {}) })
  const generator = createWeappTailwindcssGenerator(source)
  try {
    const sourcePatterns = options.sourceGlobs?.map(pattern => ({ base: source.projectRoot, pattern, negated: false }))
    const generatorCandidates = new Set(options.candidates ?? [])
    for (const candidate of generatorCandidates) {
      const base = baseClassName(candidate)
      if (base && /^(?:ios|android|native):/.test(candidate)) { generatorCandidates.add(base) }
    }
    let generated = await generator.generate({
      target: 'web',
      ...(generatorCandidates.size ? { candidates: generatorCandidates } : {}),
      scanSources: sourcePatterns ?? true,
    })
    const platformBases = new Set<string>()
    for (const candidate of generated.rawCandidates ?? []) {
      const base = baseClassName(candidate)
      if (base && /^(?:ios|android|native):/.test(candidate) && !generated.classSet.has(base)) { platformBases.add(base) }
    }
    if (platformBases.size) {
      generated = await generator.generate({
        target: 'web',
        candidates: new Set([...generatorCandidates, ...platformBases]),
        scanSources: sourcePatterns ?? true,
      })
    }
    const classSet = new Set(generated.classSet)
    const requestedCandidates = new Set(options.candidates ?? [])
    for (const candidate of generated.rawCandidates ?? []) {
      const base = baseClassName(candidate)
      if (base && generated.classSet.has(base) && /^(?:dark|ios|android|native):/.test(candidate)) { requestedCandidates.add(candidate) }
    }
    for (const candidate of requestedCandidates) { classSet.add(candidate) }
    const manifest = compileNativeStylesheet(generated.rawCss, { classSet })
    addNativeVariantRules(manifest, requestedCandidates)
    finalizeNativeManifest(manifest)
    return { rawCss: generated.rawCss, generatedClassSet: [...generated.classSet], manifest }
  }
  finally {
    generator.dispose?.()
  }
}

/** 生成应用使用的原生样式；需要分层诊断时使用 generateNativeStylesheetEvidence。 */
export async function generateNativeStylesheet(options: GenerateNativeStylesheetOptions = {}): Promise<NativeStyleManifest> {
  return (await generateNativeStylesheetEvidence(options)).manifest
}

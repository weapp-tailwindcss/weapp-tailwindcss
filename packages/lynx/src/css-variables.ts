import type { LynxDiagnosticsOptions, LynxEncodingEvidence } from './diagnostics'
import type { CssSnapshot } from './diagnostics/origins'
import { createHash } from 'node:crypto'
import { createLynxDiagnosticsReport, formatLynxDiagnosticsSummary, hasStrictLynxDiagnosticFailure } from './diagnostics'
import { isRecord } from './diagnostics/input'
import { captureCssSnapshot, cssInputIdentity, snapshotMatches } from './diagnostics/origins'
import { installedEncoderVersion } from './diagnostics/versions'

interface EncodeArguments {
  encodeData: { sourceContent: { config: Record<string, unknown> }, css?: unknown }
}

interface BeforeEmitArguments {
  finalEncodeOptions: { css?: unknown, compilerOptions?: Record<string, string | boolean>, customSections?: unknown }
  cssChunks?: unknown
  template: Uint8Array
  outputName: string
  cssDiagnostics?: string | undefined
}

export interface LynxTemplatePluginApi {
  getLynxTemplatePluginHooks: (compilation: unknown) => {
    beforeEncode: { tap: (name: string, handler: (args: EncodeArguments) => EncodeArguments) => void }
    beforeEmit?: { tapPromise: (name: string, handler: (args: BeforeEmitArguments) => Promise<BeforeEmitArguments>) => void }
  }
}

interface Compiler {
  hooks: {
    thisCompilation: { tap: (name: string, handler: (compilation: unknown) => void) => void }
    afterEmit?: { tapPromise: (name: string, handler: (compilation: Compilation) => Promise<void>) => void }
  }
}

interface Compilation {
  getAsset?: (name: string) => { source: { source: () => string | Uint8Array } } | undefined
  warnings?: unknown[]
  errors?: unknown[]
}

/** 通过模板编码生命周期启用原生递归变量解析，保留显式配置及动态依赖。 */
export class LynxCssVariablesPlugin {
  constructor(
    private readonly templatePlugin: LynxTemplatePluginApi,
    private readonly diagnostics: LynxDiagnosticsOptions = {},
    private readonly root?: string,
  ) {}

  apply(compiler: Compiler) {
    const name = 'weapp-tailwindcss:lynx-css-variables'
    const pending = new WeakMap<object, Array<{ args: BeforeEmitArguments, origins?: CssSnapshot | undefined }>>()
    if (!compiler.hooks.afterEmit?.tapPromise && (this.diagnostics.strict || this.diagnostics.onReport)) {
      throw new Error('Lynx compiler afterEmit hook 不可用，不能验证实际发出的模板。')
    }
    compiler.hooks.afterEmit?.tapPromise(name, async (compilation) => {
      for (const { args, origins } of pending.get(compilation) ?? []) {
        await this.reportEmittedTemplate(compilation, args, origins)
      }
      pending.delete(compilation)
    })
    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      const hooks = this.templatePlugin.getLynxTemplatePluginHooks(compilation)
      const getAsset = (compilation as Compilation).getAsset?.bind(compilation)
      const snapshots = new Map<string, CssSnapshot | null>()
      hooks.beforeEncode.tap(name, (args) => {
        const config = args.encodeData.sourceContent.config
        if (config.enableCSSInlineVariables === undefined) {
          config.enableCSSInlineVariables = true
        }
        const snapshot = captureCssSnapshot(args.encodeData.css, getAsset)
        if (snapshot) {
          const previous = snapshots.get(snapshot.identity)
          snapshots.set(snapshot.identity, snapshots.has(snapshot.identity) && (previous === null || JSON.stringify([previous?.assets, [...(previous?.contents ?? [])]]) !== JSON.stringify([snapshot.assets, [...snapshot.contents]])) ? null : snapshot)
        }
        return args
      })
      if (!hooks.beforeEmit?.tapPromise && (this.diagnostics.strict || this.diagnostics.onReport)) {
        throw new Error('Lynx beforeEmit 异步模板 hook 不可用，不能生成可信 CSS 诊断。')
      }
      hooks.beforeEmit?.tapPromise(name, async (args) => {
        const identity = cssInputIdentity(args.finalEncodeOptions.css)
        const snapshot = identity ? snapshots.get(identity) : undefined
        const origins = snapshot && snapshotMatches(snapshot, args.finalEncodeOptions.css, args.cssChunks, getAsset) ? snapshot : undefined
        const entries = pending.get(compilation as object) ?? []
        entries.push({ args: structuredClone({
          outputName: args.outputName,
          cssDiagnostics: args.cssDiagnostics,
          template: new Uint8Array(),
          finalEncodeOptions: {
            css: args.finalEncodeOptions.css,
            compilerOptions: args.finalEncodeOptions.compilerOptions,
            customSections: args.finalEncodeOptions.customSections,
          },
        }), origins })
        pending.set(compilation as object, entries)
        return args
      })
    })
  }

  private async reportEmittedTemplate(compilation: Compilation, args: BeforeEmitArguments, origins?: CssSnapshot) {
    let evidence: LynxEncodingEvidence | undefined
    evidence = { outputName: args.outputName, inputCssSha256: cssInputIdentity(args.finalEncodeOptions.css) }
    try {
      const emitted = compilation.getAsset?.(args.outputName)?.source.source()
      if (!(emitted instanceof Uint8Array) || emitted.byteLength === 0) {
        throw new Error('构建图缺少本轮已发出的 template 字节')
      }
      evidence.bundleSha256 = createHash('sha256').update(emitted).digest('hex')
      const sections = args.finalEncodeOptions.customSections
      if (isRecord(sections) && Object.values(sections).some(section => isRecord(section) && section.encoding === 'CSS')) {
        throw new Error('固定 decoder 尚不能证明独立 CSS custom section 的完整性')
      }
      const { decodeLynxBundle, lynxDecoderIdentity } = await import('@weapp-tailwindcss/lynx/decoder')
      const decoded = await decodeLynxBundle(emitted)
      evidence = {
        outputName: args.outputName,
        bundleSha256: createHash('sha256').update(emitted).digest('hex'),
        decoderIdentity: lynxDecoderIdentity(),
        decodedCssSha256: createHash('sha256').update(decoded.css.text).digest('hex'),
        cssText: decoded.css.text,
        inputCssSha256: cssInputIdentity(args.finalEncodeOptions.css),
      }
    }
    catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error)
    }
    const report = createLynxDiagnosticsReport(
      args.cssDiagnostics,
      args.finalEncodeOptions.css,
      this.diagnostics,
      args.finalEncodeOptions.compilerOptions,
      evidence,
      origins,
      await installedEncoderVersion(this.root, this.templatePlugin),
    )
    this.diagnostics.onReport?.(report)
    if (report.diagnostics.length > 0) {
      const summary = new Error(formatLynxDiagnosticsSummary(report))
      if (hasStrictLynxDiagnosticFailure(report, this.diagnostics)) {
        compilation.errors?.push(summary)
      }
      else {
        compilation.warnings?.push(summary)
      }
    }
  }
}

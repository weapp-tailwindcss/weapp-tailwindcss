import type { InternalGenerationRequest } from './generation-request.ts'
import type {
  GenerationChange,
  GenerationRequest,
  TailwindGenerationSession,
  TailwindGenerationSessionOptions,
  TailwindV4DesignSystem,
  TailwindV4GenerateOptions,
  TailwindV4GenerateResult,
  TailwindV4ResolvedSource,
} from './types.ts'
import { clearRequireCache } from '@tailwindcss/node/require-cache'
import {
  canonicalizeBareArbitraryValueCandidates,
  extractTailwindV4InlineSourceCandidates,
  replaceBareArbitraryValueSelectors,
  resolveValidTailwindV4Candidates,
} from './candidates.ts'
import { cloneTailwindGenerationArtifact, createTailwindGenerationArtifact } from './generation-artifact.ts'
import {
  collectRawCandidates,
  shouldCompileSourceEntries,
  stripCompiledSourceEntries,
  toGenerateOptions,
  toGenerationRequest,
} from './generation-request.ts'
import { invalidateGenerationModuleCache } from './module-cache.ts'
import { compileTailwindV4Source, loadTailwindV4DesignSystem } from './node-adapter.ts'

interface TailwindGenerationRuntime {
  source: TailwindV4ResolvedSource
  compiled: Awaited<ReturnType<typeof compileTailwindV4Source>>['compiled']
  dependencies: Set<string>
  designSystem: TailwindV4DesignSystem
  builtCandidates: Set<string>
}

interface InternalGenerationResult {
  source: TailwindV4ResolvedSource
  css: string
  classSet: Set<string>
  rawCandidates: Set<string>
  dependencies: string[]
  sources: TailwindV4GenerateResult['sources']
  root: TailwindV4GenerateResult['root']
}

export interface TailwindV4EngineGenerationSession extends TailwindGenerationSession {
  loadDesignSystem: () => Promise<TailwindV4DesignSystem>
  validateCandidates: (candidates: Iterable<string>) => Promise<Set<string>>
  generateLegacy: (options?: TailwindV4GenerateOptions) => Promise<TailwindV4GenerateResult>
}

class TailwindGenerationSessionImpl implements TailwindV4EngineGenerationSession {
  private currentSource: TailwindV4ResolvedSource
  private readonly runtimes = new Map<boolean, Promise<TailwindGenerationRuntime>>()
  private readonly designSystems = new Map<string, Promise<TailwindV4DesignSystem>>()
  private revision = 0
  private disposed = false
  private readonly moduleDependencies = new Set<string>()

  constructor(source: TailwindV4ResolvedSource, private readonly options: TailwindGenerationSessionOptions = {}) {
    this.currentSource = source
  }

  get source() {
    return this.currentSource
  }

  async generate(request: GenerationRequest = {}) {
    const revision = this.revision
    const generated = await this.generateInternal(request)
    this.assertRevision(revision)
    return cloneTailwindGenerationArtifact(createTailwindGenerationArtifact(
      generated.css,
      generated.source,
      request,
      generated.classSet,
      generated.rawCandidates,
      generated.dependencies,
    ))
  }

  async generateLegacy(options?: TailwindV4GenerateOptions): Promise<TailwindV4GenerateResult> {
    const revision = this.revision
    const generated = await this.generateInternal(toGenerationRequest(options))
    this.assertRevision(revision)
    return {
      css: generated.css,
      classSet: generated.classSet,
      rawCandidates: generated.rawCandidates,
      dependencies: generated.dependencies,
      sources: generated.sources,
      root: generated.root,
    }
  }

  loadDesignSystem() {
    return this.getDesignSystem(this.currentSource)
  }

  async validateCandidates(candidates: Iterable<string>) {
    return resolveValidTailwindV4Candidates(await this.loadDesignSystem(), candidates)
  }

  invalidate(change: GenerationChange) {
    if (this.disposed) {
      return
    }
    if (change.type === 'source') {
      this.currentSource = change.source
    }
    clearRequireCache([...this.moduleDependencies])
    invalidateGenerationModuleCache()
    this.moduleDependencies.clear()
    this.runtimes.clear()
    this.designSystems.clear()
    this.revision += 1
  }

  dispose() {
    clearRequireCache([...this.moduleDependencies])
    this.moduleDependencies.clear()
    this.runtimes.clear()
    this.designSystems.clear()
    this.revision += 1
    this.disposed = true
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error('Tailwind generation session has been disposed.')
    }
  }

  private assertRevision(revision: number) {
    this.assertActive()
    if (revision !== this.revision) {
      throw new Error('Tailwind generation session changed during generation.')
    }
  }

  private getDesignSystem(source: TailwindV4ResolvedSource) {
    this.assertActive()
    // 来源元数据在同一 revision 内固定；仅完全相同的实际 CSS 共享实例。
    const cached = this.designSystems.get(source.css)
    if (cached) {
      return cached
    }
    const revision = this.revision
    const promise = loadTailwindV4DesignSystem(source, { cache: false }).then((designSystem) => {
      this.assertRevision(revision)
      return designSystem
    })
    this.designSystems.set(source.css, promise)
    void promise.catch(() => {
      if (this.designSystems.get(source.css) === promise) {
        this.designSystems.delete(source.css)
      }
    })
    return promise
  }

  private getRuntime(compileSourceEntries: boolean, previous?: TailwindGenerationRuntime) {
    this.assertActive()
    const cached = this.runtimes.get(compileSourceEntries)
    if (cached) {
      return cached
    }
    const revision = this.revision
    const source = compileSourceEntries
      ? this.currentSource
      : stripCompiledSourceEntries(this.currentSource)
    const designSystemPromise = previous ? Promise.resolve(previous.designSystem) : this.getDesignSystem(source)
    const preparedSource = previous
      ? Promise.resolve(previous.source)
      : this.options.prepareSource
        ? designSystemPromise.then(async (designSystem) => {
            this.assertRevision(revision)
            const css = await this.options.prepareSource!(source, designSystem)
            this.assertRevision(revision)
            return { ...source, css }
          })
        : Promise.resolve(source)
    const promise = Promise.all([
      preparedSource.then(async (prepared) => {
        this.assertRevision(revision)
        return { ...await compileTailwindV4Source(prepared), source: prepared }
      }),
      designSystemPromise,
    ]).then(([compiledSource, designSystem]) => {
      this.assertRevision(revision)
      return {
        source: compiledSource.source,
        compiled: compiledSource.compiled,
        dependencies: compiledSource.dependencies,
        designSystem,
        builtCandidates: new Set<string>(),
      }
    })
    this.runtimes.set(compileSourceEntries, promise)
    void promise.catch(() => {
      if (this.runtimes.get(compileSourceEntries) === promise) {
        this.runtimes.delete(compileSourceEntries)
      }
    })
    return promise
  }

  private async resetRuntime(compileSourceEntries: boolean, runtime: TailwindGenerationRuntime) {
    this.runtimes.delete(compileSourceEntries)
    // 删除候选只重建累积输出，复用同一来源的已准备 CSS 和 design system。
    return this.getRuntime(compileSourceEntries, runtime)
  }

  private async generateInternal(request: InternalGenerationRequest): Promise<InternalGenerationResult> {
    this.assertActive()
    const revision = this.revision
    const source = this.currentSource
    const options = toGenerateOptions(request)
    const compileSourceEntries = shouldCompileSourceEntries(options)
    let runtime = await this.getRuntime(compileSourceEntries)
    this.assertRevision(revision)
    const sourceFiles: string[] = []
    let rawCandidates = await collectRawCandidates(
      source,
      options,
      runtime.compiled.root,
      runtime.compiled.sources,
      files => sourceFiles.push(...files),
    )
    this.assertRevision(revision)
    if (request.prepareCandidates) {
      rawCandidates = new Set(request.prepareCandidates(rawCandidates))
    }
    const classSet = resolveValidTailwindV4Candidates(runtime.designSystem, rawCandidates, {
      ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
    })
    const inlineSources = extractTailwindV4InlineSourceCandidates(source.css)
    for (const candidate of inlineSources.excluded) {
      classSet.delete(candidate)
    }

    const buildCandidates = new Set(canonicalizeBareArbitraryValueCandidates(classSet, options.bareArbitraryValues))
    if ([...runtime.builtCandidates].some(candidate => !buildCandidates.has(candidate))) {
      runtime = await this.resetRuntime(compileSourceEntries, runtime)
      this.assertRevision(revision)
    }
    const css = replaceBareArbitraryValueSelectors(
      runtime.compiled.build([...buildCandidates]),
      classSet,
      options.bareArbitraryValues,
    )
    runtime.builtCandidates = new Set(buildCandidates)
    for (const dependency of runtime.dependencies) {
      this.moduleDependencies.add(dependency)
    }
    const dependencies = [...new Set([...runtime.dependencies, ...sourceFiles])]
    return {
      source,
      css,
      classSet,
      rawCandidates,
      dependencies,
      sources: runtime.compiled.sources,
      root: runtime.compiled.root,
    }
  }
}

export function createTailwindGenerationSession(
  source: TailwindV4ResolvedSource,
  options?: TailwindGenerationSessionOptions,
): TailwindGenerationSession {
  return new TailwindGenerationSessionImpl(source, options)
}

export function createTailwindV4EngineGenerationSession(
  source: TailwindV4ResolvedSource,
  options?: TailwindGenerationSessionOptions,
): TailwindV4EngineGenerationSession {
  return new TailwindGenerationSessionImpl(source, options)
}

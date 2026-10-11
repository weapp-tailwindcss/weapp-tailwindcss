import type { BabelParserOptions, IJsHandlerOptions, JsModuleGraphOptions, LinkedJsModuleResult } from '../types'
import type { EvalHandler } from './evalTransforms'
import type { ModuleGraphEntry, ModuleState, QueueItem } from './module-graph/types'
import type { ImportToken } from './NodePathWalker'
import type { SourceAnalysis } from './sourceAnalysis'
import { analyzeSource } from './babel/analyze'
import { babelParse } from './babel/parse'
import { processUpdatedSource } from './babel/process'
import { IgnoredExportsTracker } from './module-graph/ignored-exports'

export type { ModuleGraphEntry } from './module-graph/types'

export class JsModuleGraph {
  private readonly modules = new Map<string, ModuleState>()
  private readonly queue: QueueItem[] = []
  private readonly resolve: JsModuleGraphOptions['resolve']
  private readonly load: JsModuleGraphOptions['load']
  private readonly filter?: JsModuleGraphOptions['filter']
  private readonly maxDepth: number
  private readonly baseOptions: IJsHandlerOptions
  private readonly parserOptions?: BabelParserOptions | undefined
  private readonly rootFilename: string
  private readonly ignoredExports: IgnoredExportsTracker

  constructor(entry: ModuleGraphEntry, graphOptions: JsModuleGraphOptions, private readonly evalHandler: EvalHandler) {
    this.resolve = graphOptions.resolve
    this.load = graphOptions.load
    this.filter = graphOptions.filter
    this.maxDepth = graphOptions.maxDepth ?? Number.POSITIVE_INFINITY
    const { moduleGraph: _moduleGraph, filename: _ignoredFilename, ...rest } = entry.handlerOptions
    this.baseOptions = {
      ...rest,
      filename: entry.filename,
    }
    this.parserOptions = entry.handlerOptions.babelParserOptions
    this.rootFilename = entry.filename
    this.ignoredExports = new IgnoredExportsTracker({
      resolve: this.resolve,
      filter: this.filter,
      modules: this.modules,
    })

    this.modules.set(entry.filename, {
      filename: entry.filename,
      source: entry.source,
      analysis: entry.analysis,
    })
    this.queue.push({ filename: entry.filename, depth: 0 })
  }

  build(): Record<string, LinkedJsModuleResult> | undefined {
    this.collectDependencies()

    let linked: Record<string, LinkedJsModuleResult> | undefined
    for (const [filename, state] of this.modules) {
      if (filename === this.rootFilename) {
        continue
      }

      const childOptions: IJsHandlerOptions = {
        ...this.baseOptions,
        filename,
      }
      const ms = processUpdatedSource(state.source, childOptions, state.analysis)
      const code = ms.toString()
      if (code !== state.source) {
        if (!linked) {
          linked = {}
        }
        linked[filename] = { code }
      }
    }

    return linked
  }

  private collectDependencies() {
    while (this.queue.length > 0) {
      const { filename, depth } = this.queue.shift() as QueueItem
      if (depth >= this.maxDepth) {
        continue
      }
      const state = this.modules.get(filename)
      if (!state) {
        continue
      }

      const dependencySpecifiers = new Map<string, ImportToken[]>()
      for (const token of state.analysis.walker.imports) {
        if (!dependencySpecifiers.has(token.source)) {
          dependencySpecifiers.set(token.source, [])
        }
        dependencySpecifiers.get(token.source)!.push(token)
      }
      for (const exportPath of state.analysis.exportDeclarations) {
        if (exportPath.isExportAllDeclaration() || exportPath.isExportNamedDeclaration()) {
          const source = exportPath.node.source?.value
          if (typeof source === 'string' && !dependencySpecifiers.has(source)) {
            dependencySpecifiers.set(source, [])
          }
        }
      }

      for (const [specifier, tokens] of dependencySpecifiers) {
        let resolved: string | undefined
        try {
          resolved = this.resolve(specifier, filename)
        }
        catch {
          continue
        }
        if (!resolved) {
          continue
        }
        if (this.filter && !this.filter(resolved, specifier, filename)) {
          continue
        }
        if (tokens.length > 0) {
          this.ignoredExports.registerIgnoredExportsFromTokens(resolved, tokens)
        }
        if (this.modules.has(resolved)) {
          continue
        }

        let source: string | undefined
        try {
          source = this.load(resolved)
        }
        catch {
          continue
        }
        if (typeof source !== 'string') {
          continue
        }

        let analysis: SourceAnalysis
        try {
          const ast = babelParse(source, {
            ...this.parserOptions,
            sourceFilename: resolved,
          })
          analysis = analyzeSource(ast, {
            ...this.baseOptions,
            filename: resolved,
          }, this.evalHandler)
          this.ignoredExports.applyIgnoredExportsToAnalysis(resolved, analysis)
        }
        catch {
          continue
        }

        this.modules.set(resolved, {
          filename: resolved,
          source,
          analysis,
        })
        this.queue.push({ filename: resolved, depth: depth + 1 })
      }
    }
  }
}

import type { NodePath } from '@babel/traverse'
import type { Node as BabelNode, Identifier, StringLiteral } from '@babel/types'
import type { JsModuleGraphOptions } from '../../types'
import type { SourceAnalysis } from '../babel'
import type { ImportToken } from '../NodePathWalker'
import type { ModuleState } from './types'

interface IgnoredExportsTrackerOptions {
  resolve: JsModuleGraphOptions['resolve']
  filter?: JsModuleGraphOptions['filter']
  modules: Map<string, ModuleState>
}

export class IgnoredExportsTracker {
  private readonly ignoredExportNames = new Map<string, Set<string>>()

  constructor(private readonly options: IgnoredExportsTrackerOptions) {}

  addIgnoredExport(filename: string, exportName: string) {
    if (!exportName) {
      return
    }
    let pending = this.ignoredExportNames.get(filename)
    if (!pending) {
      pending = new Set()
      this.ignoredExportNames.set(filename, pending)
    }
    if (pending.has(exportName)) {
      return
    }
    pending.add(exportName)
    const existing = this.options.modules.get(filename)
    if (existing) {
      this.applyIgnoredExportsToAnalysis(filename, existing.analysis)
    }
  }

  registerIgnoredExportsFromTokens(resolved: string, tokens: ImportToken[]) {
    for (const token of tokens) {
      if (token.type === 'ImportSpecifier') {
        this.addIgnoredExport(resolved, token.imported)
      }
      else if (token.type === 'ImportDefaultSpecifier') {
        this.addIgnoredExport(resolved, 'default')
      }
    }
  }

  applyIgnoredExportsToAnalysis(filename: string, analysis: SourceAnalysis) {
    const pending = this.ignoredExportNames.get(filename)
    if (!pending || pending.size === 0) {
      return
    }

    const names = new Set(pending)
    pending.clear()

    const propagate: Array<{ specifier: string, exportName: string }> = []

    for (const exportPath of analysis.exportDeclarations) {
      if (names.size === 0) {
        break
      }

      if (exportPath.isExportDefaultDeclaration()) {
        if (names.has('default')) {
          analysis.walker.walkExportDefaultDeclaration(exportPath)
          names.delete('default')
        }
        continue
      }

      if (exportPath.isExportNamedDeclaration()) {
        const source = exportPath.node.source?.value
        if (typeof source === 'string') {
          for (const spec of exportPath.get('specifiers')) {
            if (!spec.isExportSpecifier()) {
              continue
            }
            const exported = spec.get('exported')
            let exportedName: string | undefined
            if (exported.isIdentifier()) {
              exportedName = exported.node.name
            }
            else if (exported.isStringLiteral()) {
              exportedName = exported.node.value
            }

            if (!exportedName || !names.has(exportedName)) {
              continue
            }

            const local = spec.get('local') as NodePath<Identifier | StringLiteral>
            if (local.isIdentifier()) {
              propagate.push({
                specifier: source,
                exportName: local.node.name,
              })
              names.delete(exportedName)
            }
            else if (local.isStringLiteral()) {
              propagate.push({
                specifier: source,
                exportName: local.node.value,
              })
              names.delete(exportedName)
            }
          }
          continue
        }

        const declaration = exportPath.get('declaration')
        if (declaration.isVariableDeclaration()) {
          for (const decl of declaration.get('declarations')) {
            const id = decl.get('id')
            if (id.isIdentifier()) {
              const exportName = id.node.name
              if (names.has(exportName)) {
                analysis.walker.walkVariableDeclarator(decl)
                names.delete(exportName)
              }
            }
          }
        }

        for (const spec of exportPath.get('specifiers')) {
          if (!spec.isExportSpecifier()) {
            continue
          }
          const exported = spec.get('exported')
          let exportedName: string | undefined
          if (exported.isIdentifier()) {
            exportedName = exported.node.name
          }
          else if (exported.isStringLiteral()) {
            exportedName = exported.node.value
          }
          if (!exportedName || !names.has(exportedName)) {
            continue
          }
          const local = spec.get('local') as NodePath<BabelNode | null>
          analysis.walker.walkNode(local)
          names.delete(exportedName)
        }
        continue
      }

      if (exportPath.isExportAllDeclaration()) {
        const source = exportPath.node.source?.value
        if (typeof source === 'string') {
          for (const exportName of names) {
            propagate.push({
              specifier: source,
              exportName,
            })
          }
          names.clear()
        }
      }
    }

    for (const { specifier, exportName } of propagate) {
      let resolved: string | undefined
      try {
        resolved = this.options.resolve(specifier, filename)
      }
      catch {
        resolved = undefined
      }
      if (!resolved) {
        pending.add(exportName)
        continue
      }
      if (this.options.filter && !this.options.filter(resolved, specifier, filename)) {
        pending.add(exportName)
        continue
      }
      this.addIgnoredExport(resolved, exportName)
    }

    for (const name of names) {
      pending.add(name)
    }
  }
}

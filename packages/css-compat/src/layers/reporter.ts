import type { Node } from 'postcss'
import type { CascadeLayerDiagnostic, CascadeLayerDiagnosticCode, CascadeLayerSource } from '../diagnostics'
import { CascadeLayerError } from '../diagnostics'

export function sourceLocation(node: Node): CascadeLayerSource {
  return {
    file: node.source?.input.file,
    line: node.source?.start?.line,
    column: node.source?.start?.column,
  }
}

export interface DiagnosticDetails {
  related?: Node | undefined
  layer?: string | undefined
  selector?: string | undefined
  property?: string | undefined
}

export interface Reporter {
  diagnostics: CascadeLayerDiagnostic[]
  nodes: Map<CascadeLayerDiagnostic, Node>
  fail: (node: Node, code: CascadeLayerDiagnosticCode, message: string, suggestion: string) => never
  warn: (node: Node, code: CascadeLayerDiagnosticCode, message: string, suggestion: string, details?: DiagnosticDetails) => void
}

export function createReporter(onConflict: 'warning' | 'error'): Reporter {
  const diagnostics: CascadeLayerDiagnostic[] = []
  const nodes = new Map<CascadeLayerDiagnostic, Node>()
  const record = (node: Node, code: CascadeLayerDiagnosticCode, message: string, suggestion: string, severity: 'warning' | 'error', details: DiagnosticDetails = {}) => {
    const diagnostic: CascadeLayerDiagnostic = {
      code,
      severity,
      message,
      suggestion,
      source: sourceLocation(node),
      related: details.related ? sourceLocation(details.related) : undefined,
      layer: details.layer,
      selector: details.selector,
      property: details.property,
    }
    diagnostics.push(diagnostic)
    nodes.set(diagnostic, node)
  }
  return {
    diagnostics,
    nodes,
    fail(node, code, message, suggestion): never {
      record(node, code, message, suggestion, 'error')
      throw new CascadeLayerError(diagnostics)
    },
    warn(node, code, message, suggestion, details) {
      record(node, code, message, suggestion, onConflict, details)
      if (onConflict === 'error') {
        throw new CascadeLayerError(diagnostics)
      }
    },
  }
}

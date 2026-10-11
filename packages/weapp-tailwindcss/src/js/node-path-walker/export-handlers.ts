import type { NodePath } from '@babel/traverse'
import type {
  ExportAllDeclaration,
  ExportDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Node,
} from '@babel/types'
import type { ExportAllDeclarationImportToken, ImportToken } from './import-tokens'

interface ExportWalkContext {
  addImportToken: (token: ImportToken) => void
  walkNode: (path: NodePath<Node | null>) => void
}

export function walkExportDeclaration(ctx: ExportWalkContext, path: NodePath<ExportDeclaration>) {
  if (path.isExportDeclaration()) {
    if (path.isExportNamedDeclaration()) {
      walkExportNamedDeclaration(ctx, path)
    }
    else if (path.isExportDefaultDeclaration()) {
      walkExportDefaultDeclaration(ctx, path)
    }
    else if (path.isExportAllDeclaration()) {
      walkExportAllDeclaration(ctx, path)
    }
  }
}

export function walkExportNamedDeclaration(ctx: ExportWalkContext, path: NodePath<ExportNamedDeclaration>) {
  const declaration = path.get('declaration')
  if (declaration.isVariableDeclaration()) {
    for (const decl of declaration.get('declarations')) {
      ctx.walkNode(decl)
    }
  }
  const specifiers = path.get('specifiers')
  for (const spec of specifiers) {
    if (spec.isExportSpecifier()) {
      const local = spec.get('local')
      if (local.isIdentifier()) {
        ctx.walkNode(local)
      }
    }
  }
}

export function walkExportDefaultDeclaration(ctx: ExportWalkContext, path: NodePath<ExportDefaultDeclaration>) {
  const decl = path.get('declaration')
  if (decl.isIdentifier()) {
    ctx.walkNode(decl)
  }
  else {
    ctx.walkNode(decl as unknown as NodePath<Node | null>)
  }
}

export function walkExportAllDeclaration(ctx: ExportWalkContext, path: NodePath<ExportAllDeclaration>) {
  const source = path.get('source')
  if (source.isStringLiteral()) {
    // Capture re-export paths so that the caller can decide how to process them.
    ctx.addImportToken(
      {
        declaration: path,
        source: source.node.value,
        type: 'ExportAllDeclaration',
      } satisfies ExportAllDeclarationImportToken,
    )
  }
}

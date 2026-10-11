import type { NodePath } from '@babel/traverse'
import type {
  ExportAllDeclaration,
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportSpecifier,
  Node,
} from '@babel/types'

export interface ImportSpecifierImportToken {
  declaration: NodePath<ImportDeclaration>
  specifier: NodePath<ImportSpecifier>
  local: string
  imported: string
  source: string
  type: 'ImportSpecifier'
}

export interface ImportDefaultSpecifierImportToken {
  declaration: NodePath<ImportDeclaration>
  specifier: NodePath<ImportDefaultSpecifier>
  local: string
  source: string
  type: 'ImportDefaultSpecifier'
}

export interface ExportAllDeclarationImportToken {
  declaration: NodePath<ExportAllDeclaration>
  source: string
  type: 'ExportAllDeclaration'
}

export type ImportToken = ImportSpecifierImportToken | ImportDefaultSpecifierImportToken | ExportAllDeclarationImportToken

export function maybeAddImportToken(imports: Set<ImportToken>, arg: NodePath<Node | null>) {
  if (
    !((arg.isImportSpecifier() && arg.node.importKind !== 'type')
      || arg.isImportDefaultSpecifier())
  ) {
    return false
  }

  const importDeclaration = arg.parentPath
  if (!importDeclaration.isImportDeclaration() || importDeclaration.node.importKind === 'type') {
    return false
  }

  if (arg.isImportSpecifier()) {
    const imported = arg.get('imported')
    if (imported.isIdentifier()) {
      imports.add(
        {
          declaration: importDeclaration,
          specifier: arg,
          imported: imported.node.name,
          local: arg.node.local.name,
          source: importDeclaration.node.source.value,
          type: 'ImportSpecifier',
        } satisfies ImportSpecifierImportToken,
      )
    }
    return true
  }

  imports.add(
    {
      declaration: importDeclaration,
      specifier: arg,
      local: arg.node.local.name,
      source: importDeclaration.node.source.value,
      type: 'ImportDefaultSpecifier',
    } satisfies ImportDefaultSpecifierImportToken,
  )

  return true
}

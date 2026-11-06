import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

it.each(['d.ts', 'd.cts'])('Node 工具声明 %s 不引入设备端全局类型', (extension) => {
  const program = ts.createProgram(['index', 'runtime', 'babel'].map(entry => resolve(packageRoot, 'dist', `${entry}.${extension}`)), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    types: ['node'],
    strict: true,
    skipLibCheck: false,
    noEmit: true,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
  const imports: string[] = []
  for (const source of program.getSourceFiles()) {
    ts.forEachChild(source, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text)
      }
    })
  }
  expect(imports).not.toContain('react-native')
})

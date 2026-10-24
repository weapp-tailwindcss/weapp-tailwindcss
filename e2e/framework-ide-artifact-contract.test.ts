import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('requires a bound runtime root at every IDE and visual artifact call site', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const consumers = [
    'e2e/frameworkIdeClassHotUpdate.ts',
    'e2e/frameworkIdeStyleHotUpdate.ts',
    'scripts/demo-visual-e2e-report/cases.ts',
  ].map(file => path.resolve(root, file))
  const artifactFile = path.resolve(root, 'e2e/frameworkIdeHotUpdateArtifacts.ts')
  const watchFile = path.resolve(root, 'tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types.ts')
  const program = ts.createProgram(consumers, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    exactOptionalPropertyTypes: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
  })
  const checker = program.getTypeChecker()
  function exported(file: string, name: string) {
    const source = program.getSourceFile(file)!
    const module = checker.getSymbolAtLocation(source)!
    const symbol = checker.getExportsOfModule(module).find(symbol => symbol.name === name)
    expect(symbol, `${file}: ${name}`).toBeDefined()
    return symbol!
  }
  const boundType = checker.getDeclaredTypeOfSymbol(exported(artifactFile, 'IdeWatchCase'))
  const plainType = checker.getDeclaredTypeOfSymbol(exported(watchFile, 'WatchCase'))
  expect(checker.isTypeAssignableTo(plainType, boundType)).toBe(false)
  const artifactFunctions = new Set(['readArtifacts', 'collectArtifactMtimes'].map(name => exported(artifactFile, name)))
  for (const file of consumers) {
    let callCount = 0
    const failures: string[] = []
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const symbol = checker.getSymbolAtLocation(node.expression)
        const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
        if (target && artifactFunctions.has(target)) {
          callCount++
          const argument = node.arguments[0]
          const type = argument && checker.getTypeAtLocation(argument)
          if (!type || (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || !checker.isTypeAssignableTo(type, boundType)) {
            failures.push(node.getText())
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(program.getSourceFile(file)!)
    expect(callCount, file).toBeGreaterThan(0)
    expect(failures, file).toEqual([])
  }
})

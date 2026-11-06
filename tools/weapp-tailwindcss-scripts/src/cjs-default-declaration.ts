import { basename } from 'node:path'
import ts from 'typescript'

export function createCjsDefaultDeclaration(filepath: string) {
  const program = ts.createProgram([filepath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(filepath)
  const module = source && checker.getSymbolAtLocation(source)
  if (!module) {
    throw new Error(`找不到 ESM 声明入口：${filepath}`)
  }
  const exports = checker.getExportsOfModule(module)
  if (!exports.some(symbol => symbol.name === 'default')) {
    throw new Error(`CJS 可调用入口缺少 ESM default：${filepath}`)
  }
  const aliases = exports.filter(symbol => symbol.name !== 'default').map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    if (target.flags & ts.SymbolFlags.Value || target.declarations?.some(node => (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.typeParameters?.length)) {
      throw new Error(`CJS 可调用入口包含需要单独建模的命名导出：${filepath} ${symbol.name}`)
    }
    return `  export type ${symbol.name} = Esm.${symbol.name}`
  })
  const runtime = basename(filepath).replace(/\.d\.ts$/, '.js').replace(/\.d\.mts$/, '.mjs')
  return [
    `import type * as Esm from './${runtime}' with { 'resolution-mode': 'import' }`,
    'declare const callable: typeof Esm.default',
    ...(aliases.length ? ['declare namespace callable {', ...aliases, '}'] : []),
    'export = callable',
    '',
  ].join('\n')
}

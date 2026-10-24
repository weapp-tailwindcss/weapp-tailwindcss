import type { Graph } from '../graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { inside } from '../workspace'
import { createRawTypeResolver } from './raw-types'

/** 运行时策略只消费中立事实；禁止通过新增钩子或类型别名重新暴露构建器配置。 */
export function auditViteFrameworkRuntimeInputs(root: string, graph: Graph): string[] {
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const contract = path.join(source, 'bundlers', 'vite', 'shared', 'framework-runtime-strategy.ts')
  if (!graph.has(contract)) {
    return []
  }
  const asts = new Map([...graph.keys()].filter(file => inside(source, file)).map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)]))
  const types = createRawTypeResolver(source, graph, asts, new Set(['ResolvedConfig', 'UserConfig', 'Plugin', 'PluginOption']), new Set(['vite']))
  const ast = asts.get(contract)!
  const errors = new Set<string>()
  function visit(node: ts.Node) {
    if ((ts.isTypeReferenceNode(node) && types.resolveName(contract, node.typeName))
      || (ts.isImportSpecifier(node) && types.resolve(contract, node.name.text))
      || (ts.isImportTypeNode(node) && types.resolveImportType(contract, node))) {
      errors.add(`框架运行时契约暴露 Vite 配置或插件：${path.relative(root, contract)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1} ${node.getText(ast)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (types.exportsRaw(contract) && errors.size === 0) {
    errors.add(`框架运行时契约暴露 Vite 配置或插件：${path.relative(root, contract)} 的类型重导出`)
  }
  return [...errors]
}

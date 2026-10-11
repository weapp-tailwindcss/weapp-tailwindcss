import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve(import.meta.dirname, '../../src')

describe('生成编排归属', () => {
  it('通用生成管线位于核心，旧适配路径只保留重导出', () => {
    expect(fs.existsSync(path.join(sourceRoot, 'generation/pipeline.ts'))).toBe(true)
    const files = ['generator-css', 'source-candidates'].flatMap((directory) => {
      const legacyRoot = path.join(sourceRoot, 'bundlers/shared', directory)
      return fs.readdirSync(legacyRoot, { recursive: true })
        .filter(file => typeof file === 'string' && file.endsWith('.ts'))
        .map(file => path.join(legacyRoot, String(file)))
    })
    for (const name of ['generator-css', 'source-candidates', 'v4-generation-core', 'framework-postcss', 'framework-user-css', 'framework-css-composition', 'style-handler-options', 'style-requests', 'run-tasks']) {
      files.push(path.join(sourceRoot, 'bundlers/shared', `${name}.ts`))
    }
    for (const file of files) {
      const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      expect(ast.statements.every(node => ts.isExportDeclaration(node) && node.moduleSpecifier), file).toBe(true)
    }
  })
})

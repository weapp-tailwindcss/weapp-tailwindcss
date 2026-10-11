import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { parseAsync } from '@babel/core'
import fg from 'fast-glob'

export const diagnosticPackages = ['@weapp-tailwindcss/debug-uni-app-x']

export async function withoutProfiling(source, filename) {
  if (!diagnosticPackages.some(name => source.includes(name))) return source
  const ast = await parseAsync(source, { filename, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] } })
  for (const node of [...ast.program.body].reverse()) {
    if (node.type !== 'ImportDeclaration' || !diagnosticPackages.includes(node.source.value)) continue
    assert.ok(node.specifiers.length && node.specifiers.every(specifier => specifier.type === 'ImportSpecifier' && specifier.imported.name === 'debugX'), '未知诊断 API，不能假定其不影响产物')
    const replacement = node.specifiers.map(specifier => `const ${specifier.local.name} = () => [];`).join('\n')
    source = source.slice(0, node.start) + replacement + source.slice(node.end)
  }
  return source
}

export async function disableProfiling(root) {
  const files = await fg('**/*config*.{ts,js,mjs,cjs}', { cwd: root, absolute: true, ignore: ['**/node_modules/**'] })
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const next = await withoutProfiling(source, file)
    if (next !== source) await writeFile(file, next)
  }
}

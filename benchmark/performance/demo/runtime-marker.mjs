import assert from 'node:assert/strict'
import { parseAsync } from '@babel/core'
import { sfcBlocks } from './sfc.mjs'

async function rewriteScript(source, filename) {
  const ast = await parseAsync(source, { filename, configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] } })
  const edits = []
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== 'weapp-tailwindcss/escape') continue
    assert.ok(node.specifiers.length && node.specifiers.every(specifier => specifier.type === 'ImportSpecifier' && specifier.imported.name === 'weappTwIgnore'), '基线仅支持已证明等价的 weappTwIgnore 运行时标记')
    edits.push({ start: node.start, end: node.end, text: node.specifiers.map(specifier => `const ${specifier.local.name} = String.raw;`).join('\n') })
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

export async function plainRuntimeMarkers(sources) {
  const result = new Map(sources)
  for (const [file, source] of sources) {
    if (!source.includes('weapp-tailwindcss/escape')) continue
    if (/\.(?:vue|uvue|mpx)$/.test(file)) {
      let next = source
      for (const block of sfcBlocks(source, file).reverse()) {
        if (block.type !== 'script') continue
        const script = await rewriteScript(block.content, file)
        next = next.slice(0, block.offset) + script + next.slice(block.offset + block.length)
      }
      result.set(file, next)
    }
    else if (/\.[cm]?[jt]sx?$/.test(file)) result.set(file, await rewriteScript(source, file))
  }
  return result
}

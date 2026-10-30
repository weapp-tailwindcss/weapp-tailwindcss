import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export function errorRecord(error, seen = new Set()) {
  if (!error || typeof error !== 'object') {
    return String(error)
  }
  if (seen.has(error)) {
    return '[circular]'
  }
  seen.add(error)
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    watchState: error.watchState,
    watchEvents: error.watchEvents,
    cause: error.cause === undefined ? undefined : errorRecord(error.cause, seen),
    errors: Array.isArray(error.errors) ? error.errors.map(item => errorRecord(item, seen)) : undefined,
  }
}

/** 仅归档静态 chunk/CSS 消费集合；动态加载和浏览器顺序不在此证据范围。 */
export function consumptionGraph(snapshot, postcss) {
  const outputs = new Map(snapshot.outputs.map(item => [item.fileName, item]))
  const entries = snapshot.outputs.filter(item => item.type === 'chunk' && item.isEntry)
  const consumers = entries.map((entry) => {
    const chunks = new Set()
    const css = new Set()
    const unresolved = []
    const visit = (file) => {
      if (chunks.has(file)) {
        return
      }
      const chunk = outputs.get(file)
      if (!chunk || chunk.type !== 'chunk') {
        unresolved.push({
          type: 'js-import',
          file,
        })
        return
      }
      chunks.add(file)
      for (const imported of chunk.imports) {
        visit(imported)
      }
      for (const imported of chunk.importedCss) {
        css.add(imported)
      }
    }
    visit(entry.fileName)
    const cssSources = []
    for (const file of css) {
      const asset = outputs.get(file)
      if (!asset || asset.type !== 'asset') {
        unresolved.push({
          type: 'css-asset',
          file,
        })
        continue
      }
      const source = Buffer.isBuffer(asset.source) ? asset.source.toString('utf8') : asset.source
      try {
        postcss.parse(source).walkAtRules('import', rule => unresolved.push({
          type: 'css-import-not-expanded',
          file,
          params: rule.params,
        }))
      }
      catch (error) {
        unresolved.push({
          type: 'css-parse',
          file,
          error: errorRecord(error),
        })
      }
      cssSources.push({
        fileName: file,
        sha256: sha256(source),
        source,
      })
    }
    return {
      entry: entry.fileName,
      name: entry.name,
      facadeModuleId: entry.facadeModuleId,
      chunks: [...chunks],
      cssFiles: [...css],
      cssSources,
      unresolved,
      staticMembershipComplete: unresolved.length === 0,
    }
  })
  return {
    basis: 'Static chunk.imports plus viteMetadata.importedCss membership; no dynamic import or browser load-order claim',
    entryCount: entries.length,
    hasEntryChunks: entries.length > 0,
    staticMembershipComplete: entries.length > 0 && consumers.every(entry => entry.staticMembershipComplete),
    entries: consumers,
  }
}

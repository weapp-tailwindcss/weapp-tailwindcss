/** 验证 Vite 静态 CSS 引用仍属于同一产物图，不能用合并后的 CSS 文本掩盖丢失资产。 */
export function assertWatchCssAssets(bundle) {
  const outputs = Object.values(bundle)
  const cssAssets = new Set(outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.fileName))
  for (const chunk of outputs.filter(item => item.type === 'chunk')) {
    const importedCss = chunk.viteMetadata?.importedCss
    if (!(importedCss instanceof Set)) {
      throw new TypeError(`watch 产物缺少 Vite CSS 引用元数据：${chunk.fileName}`)
    }
    for (const file of importedCss) {
      if (!cssAssets.has(file)) {
        throw new Error(`watch chunk 引用的 CSS 资产不存在：${chunk.fileName} → ${file}`)
      }
    }
  }
}

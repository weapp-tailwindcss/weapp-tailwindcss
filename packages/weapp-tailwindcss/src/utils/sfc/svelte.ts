/** 保留已有 Svelte 样式提取行为，不使用 Vue SFC 模式解析其表达式。 */
export function extractSvelteStyleBlocks(source: string) {
  return [...source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].map((match, index) => {
    const attrs = match[1] ?? ''
    const lang = /\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs)
    const language = lang?.[1] ?? lang?.[2] ?? lang?.[3]
    return {
      attrs,
      index,
      scoped: /(?:^|\s)scoped(?:\s|=|$)/i.test(attrs),
      source: match[2] ?? '',
      ...(language ? { lang: language } : {}),
    }
  })
}

const marker = /\/\*!?\s*weapp-tailwindcss deferred-source:([^\s*]+)\s*\*\//g

/** 为延后生成的入口保留来源身份，供构建器在合并后查询生命周期缓存。 */
export function createDeferredCssSourceMarker(file: string) {
  return `/*! weapp-tailwindcss deferred-source:${encodeURIComponent(file).replace(/\*/g, '%2A')} */`
}

/** 按产物中的出现顺序读取来源，不把标记当作文件系统读取授权。 */
export function readDeferredCssSourceMarkers(css: string) {
  return [...new Set([...css.matchAll(marker)].flatMap((match) => {
    try {
      return [decodeURIComponent(match[1]!)]
    }
    catch {
      return []
    }
  }))]
}

/** 最终产物不保留构建期来源标记。 */
export function stripDeferredCssSourceMarkers(css: string) {
  return css.replace(marker, '')
}

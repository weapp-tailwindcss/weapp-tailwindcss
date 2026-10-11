/** 仅用于缓存索引的 32 位 FNV-1a；命中后仍须核对完整输入。 */
export function contentHash(source: string): string {
  let hash = 0x811C9DC5 | 0
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

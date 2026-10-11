export function mergeSourcesByPriority(
  moduleSourceById: Map<string, string>,
  transformSourceById: Map<string, string>,
  cssSourceById: Map<string, string>,
  scanSourceById: Map<string, string>,
) {
  const sources = new Map<string, string>()
  for (const [id, source] of moduleSourceById) {
    sources.set(id, source)
  }
  for (const [id, source] of transformSourceById) {
    sources.set(id, source)
  }
  for (const [id, source] of cssSourceById) {
    sources.set(id, source)
  }
  for (const [id, source] of scanSourceById) {
    sources.set(id, source)
  }
  return sources
}

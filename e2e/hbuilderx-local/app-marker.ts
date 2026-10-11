interface AppMarker {
  className: string
  textClassName?: string
  text: string
}

const legacyMarkerRE = /\n[ \t]*<view class="[^"]+">(?:<text class="[^"]+">)?hbuilderx-app-(?:dynamic|hmr)-[^<]+(?:<\/text>)?<\/view>/g
const persistentMarkerRE = /<view(?:\s+id="native-hmr-probe")?\s+class="[^"]*\bhbuilderx-app-native-hmr-probe\b[^"]*"(?:\s+style="[^"]*")?>[\s\S]*?<\/view>/g

/** 仅移除旧测试插入物，保留 demo 已有的持久探针及其原始源码。 */
export function removeLegacyAppMarkers(source: string) {
  return source.replace(legacyMarkerRE, '')
}

/** 结构与视觉测试使用同一探针身份，每次保存替换已有节点。 */
export function rewriteAppMarker(source: string, anchors: string[], marker: AppMarker) {
  const cleaned = removeLegacyAppMarkers(source)
  const markerClassName = `hbuilderx-app-native-hmr-probe ${marker.className.replace(/\bhbuilderx-app-native-hmr-probe\b/g, '').trim()}`
  const content = marker.textClassName ? `<text class="${marker.textClassName}">${marker.text}</text>` : marker.text
  // 位移验收需要独立展示空间，避免后续业务节点遮挡 translate 后的标记。
  const element = `<view id="native-hmr-probe" class="${markerClassName}" style="margin-bottom: 40px;">${content}</view>`
  const existing = [...cleaned.matchAll(persistentMarkerRE)]
  if (existing.length > 1) {
    throw new Error('App E2E 源码存在多个受管探针，不能确定运行时节点身份')
  }
  if (existing.length === 1) {
    return cleaned.replace(persistentMarkerRE, element)
  }
  const anchor = anchors.find(item => cleaned.includes(item))
  if (!anchor) {
    throw new Error('找不到 App E2E 插入锚点')
  }
  const index = cleaned.indexOf(anchor)
  return `${cleaned.slice(0, index)}${element}\n\t\t${cleaned.slice(index)}`
}

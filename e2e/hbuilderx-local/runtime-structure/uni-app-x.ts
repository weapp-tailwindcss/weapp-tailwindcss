/** 由 UniElement 提供真实节点，不读取模板或截图推导文字与布局。 */
export function createUniAppXElementProbe(runId: string) {
  const nonce = JSON.stringify(runId)
  const prefix = JSON.stringify(`WT_RUNTIME_STRUCTURE_${runId}=`)
  return `
import { onMounted as __wtRuntimeMounted, onUnmounted as __wtRuntimeUnmounted } from 'vue'
function __wtRuntimeElements(element: UniElement, selector: string): UniElement[] {
  const nodes = element.querySelectorAll(selector)
  return nodes ?? [] as UniElement[]
}
function __wtRuntimeNode(element: UniElement): UTSJSONObject {
  const rect = element.getBoundingClientRect()
  let text = ''
  if (element.tagName.toLowerCase() == 'text') {
    text = (element as UniTextElement).value
  } else {
    for (const node of __wtRuntimeElements(element, 'text')) {
      text += (node as UniTextElement).value
    }
  }
  return { id: element.getAttribute('id') ?? '', tagName: element.tagName, text, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
}
function __wtInstallRuntimeStructure() {
  let timer: number = -1
  let sequence = 0
  const instanceId = Date.now().toString() + '-' + Math.random().toString()
  __wtRuntimeMounted(() => {
    timer = setInterval(() => {
      try {
        const marker = uni.getElementById('native-hmr-probe')
        if (marker == null) return
        let root = marker
        while (root.parentElement != null) { root = root.parentElement! }
        const markerCount = __wtRuntimeElements(root, '#native-hmr-probe').length + (root.getAttribute('id') == 'native-hmr-probe' ? 1 : 0)
        const nodes = [__wtRuntimeNode(marker)] as UTSJSONObject[]
        for (const node of __wtRuntimeElements(marker, 'text')) { nodes.push(__wtRuntimeNode(node)) }
        sequence++
        console.log(${prefix} + JSON.stringify({ schemaVersion: 1, runId: ${nonce}, adapter: 'uni-app-x-element', instanceId, sequence, token: marker.getAttribute('data-wt-runtime-token') ?? '', pixelRatio: uni.getWindowInfo().pixelRatio, markerCount, marker: nodes[0], nodes }))
      } catch (error) {
        console.log(${prefix} + JSON.stringify({ runId: ${nonce}, error: String(error) }))
      }
    }, 250)
  })
  __wtRuntimeUnmounted(() => { if (timer != -1) clearInterval(timer) })
}
`
}

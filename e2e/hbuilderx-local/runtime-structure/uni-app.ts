/** App WebView 的 renderjs 读取真实 DOM，再通过官方桥接回逻辑层日志。 */
export function createUniAppRenderProbe(runId: string) {
  const nonce = JSON.stringify(runId)
  return `<script module="__wtRuntimeStructure" lang="renderjs">
export default {
  methods: {
    start(value, previous, ownerInstance) {
      if (this.__wtRuntimeStop) this.__wtRuntimeStop()
      const owner = ownerInstance || this.$ownerInstance
      let sequence = 0
      const instanceId = Date.now().toString() + '-' + Math.random().toString()
      let root = null
      const node = element => {
        const rect = element.getBoundingClientRect()
        return { id: element.id || '', tagName: element.tagName, text: element.textContent || '', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
      }
      const send = payload => owner.callMethod('__wtRuntimeReport', JSON.stringify(payload))
      const stop = () => {
        clearInterval(timer)
        window.removeEventListener('pagehide', stop)
      }
      const timer = setInterval(() => {
        try {
          if (root && !root.isConnected) { stop(); return }
          root = document.querySelector('[data-wt-runtime-owner="' + ${nonce} + '"]')
          if (!root) return
          const markers = document.querySelectorAll('#native-hmr-probe')
          if (markers.length == 0) return
          const marker = markers[0]
          const nodes = [node(marker), ...Array.from(marker.querySelectorAll('*')).map(node)]
          sequence++
          send({ schemaVersion: 1, runId: ${nonce}, adapter: 'uni-app-renderjs', instanceId, sequence, token: marker.getAttribute('data-wt-runtime-token') || '', pixelRatio: window.devicePixelRatio, markerCount: markers.length, marker: nodes[0], nodes })
        } catch (error) {
          send({ runId: ${nonce}, error: String(error) })
        }
      }, 250)
      this.__wtRuntimeStop = stop
      window.addEventListener('pagehide', stop)
    }
  },
  beforeDestroy() { if (this.__wtRuntimeStop) this.__wtRuntimeStop() },
  beforeUnmount() { if (this.__wtRuntimeStop) this.__wtRuntimeStop() }
}
</script>`
}

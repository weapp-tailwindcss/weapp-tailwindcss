import assert from 'node:assert/strict'

export function trackBrowserState(page) {
  const pending = new Set()
  const errors = []
  const messages = []
  page.on('console', message => {
    messages.push({ type: message.type(), text: message.text() })
    if (messages.length > 200) messages.shift()
  })
  let documents = 0
  let transportReady = false
  const styles = new Map()
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', (response) => {
    const request = response.request()
    // 只有成功的新主文档才能替换旧文档的请求集合；hash/history 不改变文档身份。
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && response.status() >= 200 && response.status() < 300) {
      documents++
      pending.clear()
      styles.clear()
      transportReady = false
    }
    else if (request.resourceType?.() === 'stylesheet') {
      // 读取浏览器已请求的响应体，不另发网络请求；CSSOM 会删除浏览器不识别的 rpx 声明。
      const text = response.text().then(text => ({ text }), error => ({ error }))
      styles.set(request.url(), { document: documents, status: response.status(), text })
    }
  })
  page.on('request', (request) => {
    // uni-image 在图片 load 回调中追加真实 IMG；仅等待 JS/CSS 会采到尚未完成的页面结构。
    if (['script', 'stylesheet', 'image', 'font'].includes(request.resourceType())) pending.add(request)
  })
  page.on('requestfinished', request => pending.delete(request))
  page.on('requestfailed', (request) => {
    pending.delete(request)
    errors.push(`${request.url()}: ${request.failure()?.errorText}`)
  })
  page.on('websocket', (socket) => {
    const version = documents
    socket.on('framereceived', ({ payload }) => {
      try {
        if (version === documents && ['connected', 'ok', 'still-ok', 'warnings'].includes(JSON.parse(String(payload)).type)) transportReady = true
      }
      catch { /* 业务 WebSocket 不参与构建工具的握手验证。 */ }
    })
  })
  return { pending, errors, messages, documents: () => documents, transportReady: () => transportReady,
    async linkedStyles(urls) {
      return Promise.all(urls.map(async url => {
        const response = styles.get(url)
        assert.ok(response && response.document === documents, `缺少本轮已挂载样式响应：${url}`)
        assert.ok(response.status >= 200 && response.status < 400, `样式响应失败：${url}`)
        const result = await response.text
        if (result.error) throw result.error
        assert.equal(response.document, documents, '读取样式期间主文档已切换')
        return result.text
      }))
    },
  }
}

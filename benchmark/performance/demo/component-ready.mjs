// 此函数在页面上下文中执行，不能引用 Node 模块或外层变量。
export async function waitForTaroComponents(timeout = 1000) {
  const elements = [...document.querySelectorAll('*')].filter(element => element.localName.startsWith('taro-'))
  const pending = []
  for (const element of elements) {
    const constructor = customElements.get(element.localName)
    if (!constructor) throw new Error('Taro 自定义元素尚未注册')
    if (typeof element.componentOnReady === 'function') pending.push(() => element.componentOnReady())
    else {
      // 现代适配器没有 componentOnReady；样式来自组件声明，不能猜测应有的 display 值。
      const css = constructor.style
      if (css !== undefined && typeof css !== 'string') throw new Error('无法核验 Taro 组件的样式声明')
      const sheets = [...document.styleSheets, ...(element.shadowRoot?.styleSheets ?? [])]
      if (css && !sheets.some(sheet => sheet.ownerNode?.textContent?.includes(css))) throw new Error(`Taro 组件样式尚未挂载：${element.localName}`)
    }
  }
  let timer
  try {
    // 网络空闲与 document.complete 不代表 Stencil 已渲染并挂载组件样式。
    await Promise.race([
      Promise.all(pending.map(ready => ready())),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Taro 组件尚未完成首轮渲染')), timeout) }),
    ])
  }
  finally { clearTimeout(timer) }
}

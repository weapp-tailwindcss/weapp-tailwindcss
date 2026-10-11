import { describe, expect, it, vi } from 'vitest'
import { removeRootSpecificityPlaceholders, removeSpecificityPlaceholders, removeTailwindContainerMaxWidthMediaRules, removeTailwindContainerWidthRules, removeUnsupportedBrowserSelectors } from '@/compat/mini-program-css/root-cleanups'
import { postcss } from '@/index'

describe('最终清理的选择器分配边界', () => {
  it('普通 class/id 无需拆分选择器，保持原始格式', () => {
    const root = postcss.parse('.safe{color:red}#target{color:blue}')
    const reads = root.nodes.map(rule => vi.spyOn(rule as postcss.Rule, 'selectors', 'get'))
    removeSpecificityPlaceholders(root)
    removeRootSpecificityPlaceholders(root)
    removeUnsupportedBrowserSelectors(root)
    removeTailwindContainerWidthRules(root)
    expect(root.toString()).toBe('.safe{color:red}#target{color:blue}')
    for (const read of reads) {
      expect(read).not.toHaveBeenCalled()
    }
  })

  it('占位符在复杂列表中仍全部清理，并保留属性中的逗号', () => {
    const root = postcss.parse('.a[data-x="a,b"]:not(#n),.b:not(#\\#){color:red}:host:not(.does-not-exist),page:not(.does-not-exist){color:blue}')
    removeSpecificityPlaceholders(root)
    removeRootSpecificityPlaceholders(root)
    expect(root.toString()).toBe('.a[data-x="a,b"],.b{color:red}:host,page{color:blue}')
  })

  it('复杂语法保留完整浏览器过滤，普通原生标签不被一并移除', () => {
    const root = postcss.parse('.a[data-x="a,b"],::placeholder{color:red}.hover\\:x:hover{color:blue}button{appearance:button}button{color:red}html,body{margin:0}')
    removeUnsupportedBrowserSelectors(root)
    expect(root.toString()).toBe('.a[data-x="a,b"]{color:red}.hover\\:x:hover{color:blue}button{color:red}body{margin:0}')
  })

  it('container 判断保留列表及空白语义，不能误伤其他类或复合选择器', () => {
    const root = postcss.parse('.container-wide{width:100%}.container:hover{width:100%}.container,.other{width:100%}.container ,{width:100%}@media (min-width:1px){.container{max-width:2px}.container2{max-width:2px}}')
    removeTailwindContainerWidthRules(root)
    removeTailwindContainerMaxWidthMediaRules(root)
    expect(root.toString()).toBe('.container-wide{width:100%}.container:hover{width:100%}.container,.other{width:100%}.container ,{width:100%}@media (min-width:1px){.container2{max-width:2px}}')
  })
})

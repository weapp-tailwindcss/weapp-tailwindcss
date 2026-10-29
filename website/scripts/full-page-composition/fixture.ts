import type { BrowserMonitor } from '../../tests/helpers/full-page/monitor/model'
import { runInNewContext } from 'node:vm'
import { installMonitor } from '../../tests/helpers/full-page/monitor/browser'

/** 白盒 DOM 只验证监控算法；真实合成与浏览器生命周期由 Playwright fixture 验收。 */
export function compositionFixture(linkCount = 1, propertyCount = 4) {
  const reads = new Map<ElementFixture, number>()
  const frames = new Map<number, () => void>()
  const records: MutationRecord[] = []
  let frame = 0
  let callback: (records: MutationRecord[]) => void
  class ElementFixture {
    parentElement: ElementFixture | null = null
    assignedSlot = null
    id = ''
    clientHeight = 3000
    scrollHeight = 3000
    offsetHeight = 3000
    scrollWidth = 1280
    scrollLeft = 0
    scrollTop = 0
    offsetWidth = 1280
    clientWidth = 1280
    attributes = new Map<string, string>()
    properties = new Map(Array.from({ length: propertyCount }, (_, index) => [`property-${index}`, 'initial']))
    animations: Array<{ playState: string, pending: boolean }> = []
    classList = { contains: (name: string) => this.kind === 'link' && name === 'table-of-contents__link--active' }
    rect = { x: 1000, y: 200, width: 80, height: 20, top: 200, bottom: 220 }
    constructor(readonly kind: string) {}
    getRootNode() {
      return document
    }
    getClientRects() {
      return [this.getBoundingClientRect()]
    }
    getBoundingClientRect() {
      return this.rect
    }
    getAnimations() {
      return this.animations
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null
    }
    matches(selector: string) {
      return this.kind === 'link' && selector === '.toc-highlight'
    }
    querySelector() {
      return null
    }
    contains() {
      return false
    }
  }
  const html = new ElementFixture('html')
  const body = new ElementFixture('body')
  const ancestor = new ElementFixture('ancestor')
  const toc = new ElementFixture('toc')
  const heading = new ElementFixture('heading')
  const navbar = new ElementFixture('navbar')
  body.parentElement = html
  ancestor.parentElement = body
  toc.parentElement = ancestor
  heading.parentElement = body
  heading.id = 'first'
  navbar.clientHeight = 63
  const links = Array.from({ length: linkCount }, () => {
    const link = new ElementFixture('link')
    link.parentElement = toc
    link.attributes.set('href', '#first')
    return link
  })
  const document = {
    body,
    documentElement: html,
    querySelectorAll: (selector: string) => selector === '.toc-highlight' ? links : [heading],
    querySelector: () => navbar,
    addEventListener() {},
  }
  class Observer {
    constructor(value: typeof callback) {
      callback = value
    }
    observe() {}
    disconnect() {}
    takeRecords() {
      return records.splice(0)
    }
  }
  const sandbox = {
    Element: ElementFixture,
    ShadowRoot: class {},
    document,
    MutationObserver: Observer,
    AbortController,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    location: { href: 'https://composition.fixture/' },
    getComputedStyle(node: ElementFixture) {
      reads.set(node, (reads.get(node) ?? 0) + 1)
      return Object.assign([...node.properties.keys()], {
        color: 'rgb(20,100,240)',
        opacity: '1',
        display: 'block',
        visibility: 'visible',
        getPropertyValue: (name: string) => node.properties.get(name) ?? '',
      })
    },
    requestAnimationFrame(fn: () => void) {
      frames.set(++frame, fn)
      return frame
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id)
    },
    addEventListener() {},
    window: undefined as unknown,
    monitor: undefined as unknown as BrowserMonitor,
  }
  sandbox.window = sandbox
  runInNewContext(`(${installMonitor.toString()})('composition-fixture');globalThis.monitor=Reflect.get(window,Symbol.for('composition-fixture'));`, sandbox)
  return {
    ancestor,
    toc,
    html,
    body,
    reads,
    tick() {
      const [id, fn] = frames.entries().next().value!
      frames.delete(id)
      fn()
    },
    attribute(name: string, oldValue: string | null) {
      records.push({ type: 'attributes', target: ancestor, attributeName: name, oldValue } as unknown as MutationRecord)
    },
    finish: () => sandbox.monitor.finish(),
  }
}

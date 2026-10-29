import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

interface CssRuleEvidence {
  identity: string
  classes: string[]
  conditions: string[]
  declarations: Array<{ property: string, value: string }>
}

export interface UniAppStyleParsers {
  parseScript: (source: string) => unknown
  cssRules: (source: string) => CssRuleEvidence[]
}

interface StyleNode {
  tag: string
  children: StyleNode[]
  parentNode?: StyleNode
  textContent?: string
  firstChild?: StyleNode
  appendChild: (child: StyleNode) => StyleNode
  removeChild: (child: StyleNode) => StyleNode
  setAttribute: (name: string, value: string) => void
}

function createStyleDocument() {
  const element = (tag: string): StyleNode => {
    const node: StyleNode = {
      tag,
      children: [],
      get firstChild() {
        return node.children[0]
      },
      appendChild(child) {
        child.parentNode = node
        node.children.push(child)
        return child
      },
      removeChild(child) {
        assert.ok(node.children.includes(child), '样式节点不属于当前父节点')
        node.children.splice(node.children.indexOf(child), 1)
        child.parentNode = undefined
        return child
      },
      setAttribute() {},
    }
    Object.defineProperty(node, 'childNodes', { get: () => node.children })
    return node
  }
  const head = element('head')
  return {
    head,
    createElement: element,
    createTextNode: (textContent: string) => ({ ...element('#text'), textContent }),
    getElementsByTagName: (name: string) => name === 'head' ? [head] : [],
    querySelector: (selector: string) => selector === 'head' ? head : null,
    addEventListener() {},
  }
}

/** 执行真实编译入口的样式注入；最小 DOM 不代表 WebView 或原生设备验收。 */
export function evaluateUniAppViewStyles(source: string, width = 375) {
  assert.ok(Number.isFinite(width) && width > 0, '视口宽度必须有效')
  const document = createStyleDocument()
  const routes: string[] = []
  const messages: string[] = []
  const context: Record<string, unknown> = {
    document,
    Vue: { component() {}, mixin() {}, prototype: {} },
    plus: {},
    uni: { canIUse: () => true, upx2px: (value: number) => value * width / 750 },
    __uniConfig: {},
    __definePage: (route: string) => routes.push(route),
    UniViewJSBridge: { publishHandler: (message: string) => messages.push(message) },
  }
  context.window = context
  runInNewContext(source, context, { timeout: 1_000, filename: 'app-view.js' })
  const styles = document.head.children
    .filter(node => node.tag === 'style')
    .map(node => node.children.map(child => child.textContent ?? '').join(''))
  return { styles, routes, messages }
}

function collectServiceClasses(ast: unknown) {
  const classes = new Set<string>()
  let staticClassCalls = 0
  const add = (value: string) => value.split(/\s+/).filter(Boolean).forEach(token => classes.add(token))
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value.type === 'CallExpression'
      && value.callee?.type === 'MemberExpression'
      && value.callee.property?.name === '_$s'
      && value.arguments?.[1]?.value === 'sc'
      && value.arguments?.[2]?.type === 'StringLiteral') {
      staticClassCalls++
      add(value.arguments[2].value)
    }
    if (value.type === 'ObjectProperty'
      && (value.key?.name ?? value.key?.value) === 'className'
      && value.value?.type === 'StringLiteral') {
      add(value.value.value)
    }
    Object.values(value).forEach(visit)
  }
  visit(ast)
  assert.ok(staticClassCalls > 0, '缺少实际 service 静态 class 协议')
  return classes
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function entryTags(html: string, name: 'script' | 'link') {
  const entryHtml = html.replace(/<!--[\s\S]*?-->/g, '')
  const entries: Array<Map<string, string>> = []
  const rawTextTags = new Set(['script', 'style', 'noscript', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext'])
  let rawText: string | undefined
  let templateDepth = 0
  // 只采集活动文档标签；原始文本和 template 内的伪入口不能充当执行证据。
  for (const match of entryHtml.matchAll(/<(\/?)([a-z][a-z\d:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const closing = match[1] === '/'
    const tag = match[2]!.toLowerCase()
    if (rawText) {
      if (closing && tag === rawText && rawText !== 'plaintext') {
        rawText = undefined
      }
      continue
    }
    if (tag === 'template') {
      templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1))
      continue
    }
    if (closing) {
      continue
    }
    if (rawTextTags.has(tag)) {
      rawText = tag
    }
    if (templateDepth > 0 || tag !== name) {
      continue
    }
    const attributes = new Map<string, string>()
    for (const attribute of match[3]!.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const key = attribute[1]!.toLowerCase()
      if (!attributes.has(key)) {
        attributes.set(key, attribute[2] ?? attribute[3] ?? attribute[4] ?? '')
      }
    }
    entries.push(attributes)
  }
  return entries
}

/** 按 HTML 入口、实际注入及双图 class 身份验收 Vue 2 App 编译产物。 */
export async function inspectUniAppWebpackAppStyles(
  outputRoot: string,
  parsers: UniAppStyleParsers,
  options: { width?: number, requiredClasses?: string[] } = {},
) {
  const files = ['manifest.json', '__uniappview.html', 'app-view.js', 'app-service.js', 'view.css']
  const contents = await Promise.all(files.map(file => readFile(path.join(outputRoot, file), 'utf8')))
  const [manifestText, html, view, service, frameworkCss] = contents as [string, string, string, string, string]
  assert.equal(JSON.parse(manifestText).launch_path, '__uniappview.html', 'manifest 必须绑定当前 view 入口')
  assert.ok(entryTags(html, 'script').some(attributes => attributes.get('src') === 'app-view.js'
    && ['', 'text/javascript', 'application/javascript'].includes((attributes.get('type') ?? '').trim().toLowerCase())
    && !attributes.has('nomodule') && !attributes.has('disabled')), 'HTML 未加载 app-view.js')
  assert.ok(entryTags(html, 'link').some(attributes => attributes.get('href') === 'view.css'
    && attributes.get('rel')?.toLowerCase().split(/\s+/).includes('stylesheet')), 'HTML 未加载框架 view.css')
  assert.ok(frameworkCss.trim(), '框架样式为空')
  const injection = evaluateUniAppViewStyles(view, options.width)
  assert.ok(injection.messages.includes('webviewReady'), 'view 入口没有完成初始化')
  assert.ok(injection.routes.includes('pages/index/index'), '未登记模板启动页面')
  const css = injection.styles.join('\n')
  assert.ok(css.trim(), '实际 view 入口没有注入应用 CSS')
  assert.doesNotMatch(css, /(?:^|[;{}\n])\s*@(import\s+["']tailwindcss|tailwind|apply|theme|source)\b/, '注入 CSS 残留 Tailwind 源指令')
  const serviceClasses = collectServiceClasses(parsers.parseScript(service))
  const rules = parsers.cssRules(css)
  const requiredClasses = options.requiredClasses ?? ['min-h-screen', 'p-[40rpx]', 'bg-[#877878]']
  assert.ok(requiredClasses.length > 0, '必须声明模板业务 class')
  const matches = requiredClasses.map((className) => {
    assert.ok(serviceClasses.has(className), `service 没有保留 Web class：${className}`)
    const escapedClass = Array.from(className, character => `\\${character.codePointAt(0)!.toString(16)} `).join('')
    const expectedIdentity = parsers.cssRules(`.${escapedClass}{}`)[0]?.identity
    assert.ok(expectedIdentity, `无法解析业务 class 身份：${className}`)
    const matchedRules = rules.filter(rule => rule.identity === expectedIdentity && rule.conditions.length === 0)
    assert.ok(matchedRules.length > 0, `注入 CSS 没有匹配 service class：${className}`)
    return { className, rules: matchedRules }
  })
  return {
    capability: 'app-view-style-injection-contract',
    files: files.map((file, index) => ({ file, bytes: Buffer.byteLength(contents[index]!), sha256: sha256(contents[index]!) })),
    routes: injection.routes,
    messages: injection.messages,
    styles: injection.styles.length,
    css,
    cssBytes: Buffer.byteLength(css),
    cssSha256: sha256(css),
    serviceClasses: [...serviceClasses],
    matches,
  }
}

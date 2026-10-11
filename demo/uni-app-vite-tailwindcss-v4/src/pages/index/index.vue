<template>
  <view class="flex flex-col">
    <view class="m-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[24rpx] leading-5 text-slate-900">
      <text class="font-semibold text-emerald-700">Special Class Probe:</text>
      <text selectable class="ml-2 break-all">{{ specialClassProbeSummary }}</text>
    </view>
    <view class="special-class-visual-probe dark m-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-slate-900">
      <text class="block text-[24rpx] font-semibold text-emerald-700">Special Class Visual Probe</text>
      <view class="mt-2 flex flex-col gap-2">
        <view :class="rawDarkProbeClass" class="rounded px-3 py-2 text-[24rpx]">
          raw dark class
        </view>
        <text :class="rawTextProbeClass" class="block">
          raw text class
        </text>
        <view :class="safeDarkProbeClass" class="rounded px-3 py-2 text-[24rpx]">
          safe dark class
        </view>
        <text :class="safeTextProbeClass" class="block">
          safe text class
        </text>
        <view class="css-variable-visual-probe rounded px-3 py-2 text-white">
          css variable class
        </view>
      </view>
    </view>
    <view class="template-corpus-card flex flex-col gap-3 rounded-[28rpx] border border-slate-200/80 bg-gradient-to-br from-slate-900/95 to-slate-700/95 p-4 text-white shadow-xl wx:bg-blue-500 not-wx:bg-red-500 any-hover:bg-slate-800">
      <view class="template-corpus-radial bg-[radial-gradient(circle_at_18%_20%,#e0f2fe,#fdf4ff_70%)] px-[48px] py-[24rpx] text-[#123456]">
        template corpus radial
      </view>
      <view class="template-corpus-space space-y-2">
        <view class="rounded-[20rpx] bg-white/70 px-3 py-1 text-[26rpx] text-slate-700">space item 1</view>
        <view :class="templateCorpusDynamicClass">space item 2</view>
      </view>
      <view class="template-corpus-apply">apply corpus</view>
      <view class="template-corpus-hover h-16 w-32 rounded-[20rpx] bg-green-200/70" hover-class="!bg-[gray] after:!content-['good_work!']">
        hover corpus
      </view>
    </view>
    <image class="w-20 h-20" src="/static/logo.png" />
    <view class="text-area aspect-(--my-aspect-ratio)">
      <text class="text-[#00f285] text-[102.43rpx] font-bold underline">{{ title }}</text>
    </view>
    <view :class="className" class="aspect-[calc(4*3+1)/3]">
      {{ className }}
    </view>
    <view class="i-[mdi--home]"></view>
    <view class="bg-midnight text-tahiti fill-bermuda">
      bg-midnight text-tahiti fill-bermuda
    </view>
    <view class="bg-neutral-1B">
      12345
    </view>
    <view class="mt-4 flex items-center gap-3">
      <view class="h-12 w-12 rounded-full bg-emerald-500"></view>
      <text class="text-sm text-neutral-66">rounded-full</text>
    </view>
    <view class="mt-6 rounded-xl bg-emerald-500 py-3 text-center text-white shadow-sm active:bg-emerald-600"
      @tap="goOrder">
      打开订单分包
    </view>
    <view class="theme-mode-demo mt-4 rounded bg-white px-4 py-3 text-slate-900 system-dark:bg-slate-900 system-dark:text-slate-100 dark:bg-zinc-900 dark:text-zinc-50">
      uni-app Vite Tailwind CSS v4 system dark
      <view class="theme-dark mt-2 rounded bg-white px-3 py-2 text-slate-900 dark:bg-zinc-950 dark:text-zinc-50">
        uni-app Vite Tailwind CSS v4 manual dark
      </view>
    </view>
    <t-button t-class="bg-[#0977ee] text-[31rpx]" t-class-content="px-[29rpx]">issue 977 t-class</t-button>
    <view class="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm">
      <view class="flex items-center justify-between gap-3">
        <text class="text-base font-semibold text-slate-900">App WebView Runtime</text>
        <view class="rounded bg-slate-900 px-3 py-1 text-[24rpx] text-white active:bg-slate-700" @tap="refreshWebviewInfo">
          刷新
        </view>
      </view>
      <view v-for="item in webviewInfoRows" :key="item.label" class="mt-3 border-t border-slate-200 pt-2">
        <text class="block text-xs text-slate-500">{{ item.label }}</text>
        <text selectable class="mt-1 block break-all text-[24rpx] leading-5 text-slate-800">{{ item.value }}</text>
      </view>
    </view>
    <view class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-slate-900 shadow-sm">
      <view class="flex items-center justify-between gap-3">
        <text class="text-base font-semibold text-slate-900">Special Class Probe</text>
        <view class="rounded bg-emerald-600 px-3 py-1 text-[24rpx] text-white active:bg-emerald-700" @tap="refreshSpecialClassProbe">
          重测
        </view>
      </view>
      <view v-for="item in specialClassProbeRows" :key="item.label" class="mt-3 border-t border-emerald-200 pt-2">
        <text class="block text-xs text-emerald-700">{{ item.label }}</text>
        <text selectable class="mt-1 block break-all text-[24rpx] leading-5 text-slate-800">{{ item.value }}</text>
      </view>
    </view>
    <div class="flex space-x-4 border" :class="{
      'space-x-reverse': reverseFlag,
      'flex-row-reverse': reverseFlag
    }">
      <div>01</div>
      <div>02</div>
      <div>03</div>
    </div>
    <div class="flex flex-col space-y-4 border" :class="{
      'space-y-reverse': reverseFlag,
      'flex-col-reverse': reverseFlag
    }">
      <div>01</div>
      <div>02</div>
      <div>03</div>
    </div>
    <div class="flex divide-x-4 border p-2 divide-[#d80c0c] divide-double" :class="{
      'divide-x-reverse': reverseFlag,
      'flex-row-reverse': reverseFlag
    }">
      <div>01</div>
      <div>02</div>
      <div>03</div>
    </div>

    <div class="flex flex-col divide-y-4 border p-2 divide-[#41eb04] divide-dotted" :class="{
      'divide-y-reverse': reverseFlag,
      'flex-col-reverse': reverseFlag
    }">
      <div>01</div>
      <div>02</div>
      <div>03</div>
    </div>
    <button @click="reverseFlag = !reverseFlag">reverseFlag</button>
    <input v-model="aaa" />
    <HelloWorld v-model="aaa"></HelloWorld>
  </view>
</template>

<script setup lang="ts">
import { twMerge } from '@weapp-tailwindcss/merge'
import { weappTwIgnore } from "weapp-tailwindcss/escape"
import HelloWorld from "@/components/HelloWorld.vue"
import TButton from "@/components/TButton.vue"
import { onMounted, ref } from 'vue'

interface WebviewInfoRow {
  label: string
  value: string
}

type GlobalWithPlus = typeof globalThis & {
  plus?: {
    navigator?: {
      getUserAgent?: () => string
    }
    os?: Record<string, unknown>
    runtime?: Record<string, unknown>
    webview?: {
      currentWebview?: () => {
        id?: string
        getURL?: () => string
      }
    }
  }
}

const title = ref('Hello')
const className = ref('bg-[#0000ff] text-[45rpx] text-white')
const templateCorpusDynamicClass = 'template-corpus-dynamic bg-[#68c828] text-[100rpx] w-[323px] h-[45px]'
const reverseFlag = ref(false)
const webviewInfoRows = ref<WebviewInfoRow[]>([
  { label: 'status', value: 'collecting App WebView runtime...' }
])
const specialClassProbeRows = ref<WebviewInfoRow[]>([
  { label: 'status', value: 'waiting for App WebView DOM...' }
])
const specialClassProbeSummary = ref('waiting')
const rawDarkProbeClass = ['dark', ':', 'bg-red-300'].join('')
const rawTextProbeClass = ['text-', '[', '45rpx', ']'].join('')
const safeDarkProbeClass = 'dark_cbg-red-300'
const safeTextProbeClass = 'text-_b45rpx_B'

const aaa = ref('111')
const world = {
  Accept: `text/event-stream`,
  CCC: `text` + `/evexstream`,
  BBB: weappTwIgnore`bg-[#123498]`
}
const vuexActionProbe = {
  dispatch(action: string) {
    return action
  }
}.dispatch('user/getUserInfo')
console.log(world, twMerge, vuexActionProbe)

function stringifyInfoValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function pushInfoRow(rows: WebviewInfoRow[], label: string, value: unknown) {
  const text = stringifyInfoValue(value)
  if (text) {
    rows.push({ label, value: text })
  }
}

function readRecordValue(record: Record<string, unknown> | undefined, key: string) {
  return record ? record[key] : undefined
}

function matchUserAgent(userAgent: string, pattern: RegExp) {
  return userAgent.match(pattern)?.[1]
}

function createWebviewEngineRows(userAgent: string) {
  const rows: WebviewInfoRow[] = []
  const isAndroid = /Android/i.test(userAgent)
  const isIOS = /\b(?:iPhone|iPad|iPod)\b/i.test(userAgent)
  const chromeVersion = matchUserAgent(userAgent, /\b(?:Chrome|Chromium|CriOS)\/([\d.]+)/i)
  const webkitVersion = matchUserAgent(userAgent, /\bAppleWebKit\/([\d.]+)/i)
  const safariVersion = matchUserAgent(userAgent, /\bVersion\/([\d.]+)/i)
    ?? matchUserAgent(userAgent, /\bSafari\/([\d.]+)/i)
  const mobileBuild = matchUserAgent(userAgent, /\bMobile\/([A-Za-z0-9]+)/i)
  const androidWebViewMarker = /\bwv\b/i.test(userAgent) || /\bVersion\/4\.0\b/i.test(userAgent)

  pushInfoRow(rows, 'webview.engine', isAndroid
    ? 'Android System WebView / Chromium'
    : isIOS
      ? 'iOS WKWebView / AppleWebKit'
      : 'Unknown WebView engine')
  pushInfoRow(rows, 'webview.androidChromiumVersion', chromeVersion)
  pushInfoRow(rows, 'webview.androidWebViewMarker', isAndroid ? String(androidWebViewMarker) : '')
  pushInfoRow(rows, 'webview.iosAppleWebKitVersion', webkitVersion)
  pushInfoRow(rows, 'webview.iosSafariVersion', isIOS ? safariVersion : '')
  pushInfoRow(rows, 'webview.iosMobileBuild', isIOS ? mobileBuild : '')
  return rows
}

function readUserAgent(plusObject: GlobalWithPlus['plus']) {
  try {
    const plusUserAgent = plusObject?.navigator?.getUserAgent?.()
    if (plusUserAgent) {
      return plusUserAgent
    }
  }
  catch {
  }
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function refreshWebviewInfo() {
  const rows: WebviewInfoRow[] = []
  const systemInfo = uni.getSystemInfoSync() as unknown as Record<string, unknown>
  const plusObject = (globalThis as GlobalWithPlus).plus
  const userAgent = readUserAgent(plusObject)
  let currentWebview: ReturnType<NonNullable<NonNullable<GlobalWithPlus['plus']>['webview']>['currentWebview']> | undefined

  try {
    currentWebview = plusObject?.webview?.currentWebview?.()
  }
  catch {
  }

  pushInfoRow(rows, 'uni.uniPlatform', readRecordValue(systemInfo, 'uniPlatform'))
  pushInfoRow(rows, 'uni.platform', readRecordValue(systemInfo, 'platform'))
  pushInfoRow(rows, 'uni.system', readRecordValue(systemInfo, 'system'))
  pushInfoRow(rows, 'uni.osName', readRecordValue(systemInfo, 'osName'))
  pushInfoRow(rows, 'uni.osVersion', readRecordValue(systemInfo, 'osVersion'))
  pushInfoRow(rows, 'device.brand', readRecordValue(systemInfo, 'brand') ?? readRecordValue(systemInfo, 'deviceBrand'))
  pushInfoRow(rows, 'device.model', readRecordValue(systemInfo, 'model') ?? readRecordValue(systemInfo, 'deviceModel'))
  pushInfoRow(rows, 'plus.os.name', plusObject?.os?.name)
  pushInfoRow(rows, 'plus.os.version', plusObject?.os?.version)
  pushInfoRow(rows, 'plus.runtime.version', plusObject?.runtime?.version)
  pushInfoRow(rows, 'plus.runtime.innerVersion', plusObject?.runtime?.innerVersion)
  pushInfoRow(rows, 'plus.runtime.appid', plusObject?.runtime?.appid)
  pushInfoRow(rows, 'plus.webview.id', currentWebview?.id)
  pushInfoRow(rows, 'plus.webview.url', currentWebview?.getURL?.())
  rows.push(...createWebviewEngineRows(userAgent))
  pushInfoRow(rows, 'navigator.userAgent', userAgent)

  webviewInfoRows.value = rows.length > 0 ? rows : [{ label: 'status', value: 'No WebView runtime info collected' }]
  console.log('[uni-app-vite] App WebView Runtime', Object.fromEntries(webviewInfoRows.value.map(item => [item.label, item.value])))
}

function readCssValue(element: Element, property: keyof CSSStyleDeclaration) {
  const view = element.ownerDocument.defaultView
  const value = view?.getComputedStyle(element)[property]
  return typeof value === 'string' ? value : ''
}

function colorIncludes(value: string, expected: string) {
  return value.replace(/\s+/g, '').includes(expected.replace(/\s+/g, ''))
}

function removeExistingSpecialClassProbe() {
  const existing = document.getElementById('uni-app-vite-special-class-probe')
  existing?.parentNode?.removeChild(existing)
}

function createSpecialClassProbeStyle(documentRef: Document) {
  const style = documentRef.createElement('style')
  const rawDarkClass = ['dark', ':', 'bg-red-300'].join('')
  const rawTextClass = ['text-', '[', '45rpx', ']'].join('')
  const safeDarkClass = 'dark_cbg-red-300'
  const safeTextClass = 'text-_b45rpx_B'
  style.textContent = [
    '#uni-app-vite-special-class-probe { position: absolute; left: -9999px; top: -9999px; width: 1px; height: 1px; overflow: hidden; }',
    `.dark .${rawDarkClass.replace(':', '\\:')} { background-color: rgb(252, 165, 165); }`,
    `.${rawTextClass.replace('[', '\\[').replace(']', '\\]')} { font-size: 45px; }`,
    `.dark .${safeDarkClass} { background-color: rgb(252, 165, 165); }`,
    `.${safeTextClass} { font-size: 45px; }`,
    '.css-variable-probe { --probe-bg: rgb(16, 185, 129); --probe-size: 45px; background-color: var(--probe-bg); font-size: var(--probe-size); }',
  ].join('\n')
  return style
}

function createSpecialClassProbeElement(documentRef: Document, className: string, text: string) {
  const element = documentRef.createElement('div')
  element.className = className
  element.textContent = text
  return element
}

function refreshSpecialClassProbe() {
  const rows: WebviewInfoRow[] = []
  try {
    if (typeof document === 'undefined') {
      specialClassProbeRows.value = [{ label: 'status', value: 'document is not available in this runtime' }]
      specialClassProbeSummary.value = 'document unavailable'
      return
    }

    removeExistingSpecialClassProbe()
    const host = document.createElement('div')
    host.id = 'uni-app-vite-special-class-probe'
    host.className = 'dark'
    host.appendChild(createSpecialClassProbeStyle(document))
    const rawDarkClass = ['dark', ':', 'bg-red-300'].join('')
    const rawTextClass = ['text-', '[', '45rpx', ']'].join('')
    const rawDarkElement = createSpecialClassProbeElement(document, rawDarkClass, 'raw dark:bg-red-300')
    const rawTextElement = createSpecialClassProbeElement(document, rawTextClass, 'raw text-[45rpx]')
    const safeDarkElement = createSpecialClassProbeElement(document, 'dark_cbg-red-300', 'safe dark_cbg-red-300')
    const safeTextElement = createSpecialClassProbeElement(document, 'text-_b45rpx_B', 'safe text-_b45rpx_B')
    const cssVariableElement = createSpecialClassProbeElement(document, 'css-variable-probe', 'css variable probe')
    host.appendChild(rawDarkElement)
    host.appendChild(rawTextElement)
    host.appendChild(safeDarkElement)
    host.appendChild(safeTextElement)
    host.appendChild(cssVariableElement)
    document.body.appendChild(host)

    const rawDarkBackground = readCssValue(rawDarkElement, 'backgroundColor')
    const rawTextFontSize = readCssValue(rawTextElement, 'fontSize')
    const safeDarkBackground = readCssValue(safeDarkElement, 'backgroundColor')
    const safeTextFontSize = readCssValue(safeTextElement, 'fontSize')
    const cssVariableBackground = readCssValue(cssVariableElement, 'backgroundColor')
    const cssVariableFontSize = readCssValue(cssVariableElement, 'fontSize')
    const rawDarkMatched = colorIncludes(rawDarkBackground, 'rgb(252,165,165)')
    const rawTextMatched = rawTextFontSize === '45px'
    const safeDarkMatched = colorIncludes(safeDarkBackground, 'rgb(252,165,165)')
    const safeTextMatched = safeTextFontSize === '45px'
    const cssVariableMatched = colorIncludes(cssVariableBackground, 'rgb(16,185,129)') && cssVariableFontSize === '45px'

    pushInfoRow(rows, 'raw.dark:bg-red-300.matched', rawDarkMatched)
    pushInfoRow(rows, 'raw.dark:bg-red-300.backgroundColor', rawDarkBackground)
    pushInfoRow(rows, 'raw.text-[45rpx].matchedViaEscapedSelector', rawTextMatched)
    pushInfoRow(rows, 'raw.text-[45rpx].fontSize', rawTextFontSize)
    pushInfoRow(rows, 'safe.dark_cbg-red-300.matched', safeDarkMatched)
    pushInfoRow(rows, 'safe.dark_cbg-red-300.backgroundColor', safeDarkBackground)
    pushInfoRow(rows, 'safe.text-_b45rpx_B.matched', safeTextMatched)
    pushInfoRow(rows, 'safe.text-_b45rpx_B.fontSize', safeTextFontSize)
    pushInfoRow(rows, 'css-var.backgroundColor', cssVariableBackground)
    pushInfoRow(rows, 'css-var.fontSize', cssVariableFontSize)
    pushInfoRow(rows, 'css-var.matched', cssVariableMatched)
    pushInfoRow(rows, 'conclusion', rawDarkMatched && rawTextMatched
      ? 'raw special class names are accepted by this WebView when CSS selectors are escaped'
      : 'raw special class names did not fully match in this WebView')

    specialClassProbeRows.value = rows
    specialClassProbeSummary.value = `raw=${rawDarkMatched && rawTextMatched ? 'pass' : 'fail'}, safe=${safeDarkMatched && safeTextMatched ? 'pass' : 'fail'}, cssVar=${cssVariableMatched ? 'pass' : 'fail'}`
    console.log('[uni-app-vite] Special Class Probe', Object.fromEntries(rows.map(item => [item.label, item.value])))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    specialClassProbeRows.value = [{ label: 'error', value: message }]
    specialClassProbeSummary.value = `error: ${message}`
    console.error('[uni-app-vite] Special Class Probe Error', error)
  }
}

onMounted(() => {
  refreshWebviewInfo()
  refreshSpecialClassProbe()
  setTimeout(refreshWebviewInfo, 300)
  setTimeout(refreshSpecialClassProbe, 300)
  if (!(globalThis as GlobalWithPlus).plus && typeof document !== 'undefined') {
    document.addEventListener('plusready', refreshWebviewInfo, { once: true })
    document.addEventListener('plusready', refreshSpecialClassProbe, { once: true })
  }
})

const goOrder = () => {
  uni.navigateTo({
    url: '/pages-order/pages/home/home'
  })
}
</script>

<style>
.special-class-visual-probe.dark [class~="dark:bg-red-300"] {
  background-color: rgb(252, 165, 165);
  color: #7f1d1d;
}

.special-class-visual-probe [class~="text-[45rpx]"] {
  color: #0f172a;
  font-size: 45px;
  line-height: 1;
}

.special-class-visual-probe.dark .dark_cbg-red-300 {
  background-color: rgb(252, 165, 165);
  color: #7f1d1d;
}

.special-class-visual-probe .text-_b45rpx_B {
  color: #0f172a;
  font-size: 45px;
  line-height: 1;
}

.special-class-visual-probe .css-variable-visual-probe {
  --visual-probe-bg: rgb(16, 185, 129);
  --visual-probe-size: 45px;
  background-color: var(--visual-probe-bg);
  font-size: var(--visual-probe-size);
  line-height: 1;
}
</style>

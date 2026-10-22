import type { ReactNode } from 'react'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/App'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string }

vi.mock('@weapp-tailwindcss/react-native/runtime', () => ({ tw: () => ({}) }))
vi.mock('@weapp-tailwindcss/react-native/env', () => ({}))
vi.mock('../src/compatibility/SemanticRun', () => ({ SemanticRun: () => null }))
vi.mock('react-native', async () => {
  const { createElement } = await import('react')
  const View = ({ children }: { children?: ReactNode }) => createElement('div', {}, children)
  return {
    View,
    Text: View,
    ScrollView: ({ children, scrollEnabled }: { children?: ReactNode, scrollEnabled: boolean }) => createElement('div', { 'data-scroll-enabled': String(scrollEnabled) }, children),
    StyleSheet: { flatten: (style: unknown) => style },
    useColorScheme: () => 'light',
  }
})

it.each(['', 'http://owned-report'])('实际 App 根节点按报告模式 %s 控制外层滚动，内部 ScrollView 夹具独立', (reportUrl) => {
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_URL', reportUrl)
  expect(renderToStaticMarkup(createElement(App))).toContain(`data-scroll-enabled="${String(!reportUrl)}"`)
})

afterEach(() => vi.unstubAllEnvs())

import path from 'node:path'
import { normalizePath } from 'vite'
import { isPreprocessorRequest, normalizeRelativeTailwindReferences, resolvePreprocessorTransform } from '@/uni-app-x/vite/style-request'

describe('uni-app-x vite style request', () => {
  const preprocessorLangs = ['scss', 'sass', 'less', 'styl', 'stylus'] as const

  it('resolves relative Tailwind references from the source SFC', () => {
    expect(normalizeRelativeTailwindReferences(
      '@reference "../../main.css";\n.card { @apply flex; }',
      `${normalizePath(path.resolve('/project/pages/index/index.uvue'))}?vue&type=style&index=0&lang.scss`,
    )).toContain(`@reference "${normalizePath(path.resolve('/project/main.css'))}";`)
  })

  it('normalizes Windows source paths as module ids', () => {
    expect(normalizeRelativeTailwindReferences(
      '@reference "..\\..\\main.css";',
      'C:\\project\\pages\\index\\index.uvue?vue&type=style',
    )).toBe('@reference "C:/project/main.css";')
  })

  it('preserves package, import-map, and absolute references', () => {
    const source = [
      '@reference "tailwindcss";',
      '@reference "#theme";',
      '@reference "/project/main.css";',
    ].join('\n')
    expect(normalizeRelativeTailwindReferences(source, '/project/pages/index.uvue')).toBe(source)
  })

  it.each(preprocessorLangs)('leaves %s requests to the framework preprocessor on non-Native targets', (lang) => {
    const id = `/project/components/up-checkbox.uvue?vue&type=style&index=0&lang=${lang}`
    expect(resolvePreprocessorTransform('.up-checkbox { @apply text-white; }', id, lang, {
      isIosPlatform: false,
      isNativeAppStyleTarget: false,
    })).toEqual({ result: undefined })
  })

  it.each(preprocessorLangs)('recognizes %s preprocessor request forms', (lang) => {
    expect(isPreprocessorRequest(`/project/components/up-checkbox.uvue?vue&type=style&index=0&lang.${lang}`)).toBe(true)
    expect(isPreprocessorRequest(`/project/components/up-checkbox.uvue?vue&type=style&index=0&lang=${lang}`)).toBe(true)
    expect(isPreprocessorRequest(`/project/components/up-checkbox.${lang}?direct`)).toBe(true)
  })

  it.each(preprocessorLangs)('keeps Native %s requests in the local @apply pipeline', (lang) => {
    expect(resolvePreprocessorTransform(
      '.up-checkbox { @apply text-white; }',
      `/project/components/up-checkbox.uvue?vue&type=style&index=0&lang=${lang}`,
      lang,
      {
        isIosPlatform: false,
        isNativeAppStyleTarget: true,
      },
    )).toBeUndefined()
  })
})

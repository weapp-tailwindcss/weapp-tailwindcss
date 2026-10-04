import type { Format, Locale } from '../src/config'
import { FORMATS, getFormat, getLocale, LOCALES } from '../src/config'

export function selection(args: string[], allowRenderModes = false) {
  let locale: Locale | 'all' = 'all'
  let format: Format | 'all' = 'all'
  let mode = 'all'
  const seen = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const value = args[i]
    if (value === '--locale' || value === '--format') {
      if (seen.has(value)) {
        throw new Error(`重复参数：${value}`)
      }
      seen.add(value)
      const next = args[++i]
      if (value === '--locale') {
        locale = next === 'all' ? 'all' : getLocale(next)
      }
      else {
        format = next === 'all' ? 'all' : getFormat(next)
      }
    }
    else if (['all', 'landscape', 'portrait', ...(allowRenderModes ? ['frames', 'covers'] : [])].includes(value) && !seen.has('mode')) {
      mode = value
      seen.add('mode')
    }
    else {
      throw new Error(`未知参数：${value}`)
    }
  }
  if (mode === 'landscape' || mode === 'portrait') {
    if (format !== 'all' && format !== mode) {
      throw new Error('画幅参数冲突')
    }
    format = mode
  }
  const locales: readonly Locale[] = locale === 'all' ? LOCALES : [locale]
  const formats: readonly Format[] = format === 'all' ? FORMATS : [format]
  return { mode, variants: locales.flatMap(locale => formats.map(format => ({ locale, format }))) }
}

import { chromium, firefox, webkit } from 'playwright'

export function reactNativeWebBrowser(name = 'chromium') {
  if (name !== 'chromium' && name !== 'firefox' && name !== 'webkit') {
    throw new Error(`Unsupported RN_WEB_BROWSER: ${name}`)
  }
  return { name, type: { chromium, firefox, webkit }[name] }
}

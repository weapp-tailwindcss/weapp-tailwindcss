import type { LaunchOptions } from 'playwright'

/** 单 alpha 像素协议要求灰度字缘，禁止使用 Linux LCD 分通道抗锯齿。 */
export function textPixelBrowserOptions(): LaunchOptions {
  return { headless: true, args: ['--disable-lcd-text'] }
}

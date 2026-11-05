import { createRequire } from 'node:module'
import path from 'node:path'

const demoRequire = createRequire(new URL('../../demo/uni-app-vite-tailwindcss-v4/package.json', import.meta.url))
const { hash } = demoRequire('@dcloudio/uni-cli-shared') as {
  hash: (source: string) => string
}

/** 只消除上游由绝对文件名生成的身份前缀，组件顺序和其它模板内容仍参与快照。 */
export function normalizeUniComponentIds(wxml: string, filename: string, expectedCount: number) {
  if (!path.posix.isAbsolute(filename) && !path.win32.isAbsolute(filename)) {
    throw new Error('组件身份校验必须使用绝对源码路径')
  }
  // 上游接收 Vite module id；在此明确将 Windows 文件路径转换为该逻辑身份。
  const moduleId = !path.posix.isAbsolute(filename) && path.win32.isAbsolute(filename) ? filename.replaceAll('\\', '/') : filename
  const prefix = hash(moduleId)
  let count = 0
  const normalized = wxml.replace(/(\s+u-i=")([^"]*)(")/g, (_attribute, before: string, value: string, after: string) => {
    const ownId = value.split(',')[0]
    if (ownId !== `${prefix}-${count}`) {
      throw new Error(`组件身份与源码或顺序不符：${filename}，${value}`)
    }
    count++
    return `${before}__SOURCE__${value.slice(prefix.length)}${after}`
  })
  if (count !== expectedCount) {
    throw new Error(`组件身份数量不符：${filename}，${count}/${expectedCount}`)
  }
  return normalized
}

import process from 'node:process'
import { loadNativeCssBinding } from '@/native/binding'

// 原生验收入口要求真实 ABI，不能用探测后 skip 代替失败。
if (process.env.WEAPP_TW_NATIVE !== 'required') {
  throw new Error('原生测试必须由 vitest.native.config.ts 强制 required 模式')
}
loadNativeCssBinding()

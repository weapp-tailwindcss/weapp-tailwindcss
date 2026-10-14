import { describe, expect, it } from 'vitest'
import { detectAppTypeFromPackageJson, isMpxPackage, isTaroPackage, isUniAppPackage, isUniAppXPackage, isWeappVitePackage } from '../src'

describe('script 信号只识别执行命令', () => {
  it('文件参数不能覆盖实际宿主依赖', () => {
    expect(detectAppTypeFromPackageJson({
      dependencies: { '@tarojs/runtime': '*' },
      scripts: { lint: 'eslint weapp-vite.config.ts' },
    })).toBe('taro')
    expect(detectAppTypeFromPackageJson({
      dependencies: { '@dcloudio/vite-plugin-uni': '*' },
      scripts: { test: 'node scripts/taro-smoke.js' },
    })).toBe('uni-app-vite')
  })

  it('谓词不把输出文本及配置文件名当作框架', () => {
    expect(isTaroPackage({ scripts: { lint: 'eslint taro.config.ts' } })).toBe(false)
    expect(isWeappVitePackage({ scripts: { test: 'echo weapp-vite' } })).toBe(false)
    expect(isMpxPackage({ scripts: { test: 'node mpx-cli-service.js' } })).toBe(false)
    expect(isUniAppPackage({ scripts: { test: 'echo uni' } })).toBe(false)
  })

  it('保留真实命令的框架优先级及 uni CLI 细化', () => {
    expect(detectAppTypeFromPackageJson({
      dependencies: { '@tarojs/runtime': '*' },
      scripts: { build: 'pnpm exec weapp-vite build' },
    })).toBe('weapp-vite')
    expect(detectAppTypeFromPackageJson({
      dependencies: { '@dcloudio/uni-app': '*' },
      scripts: { build: 'cross-env UNI_PLATFORM=h5 uni build' },
    })).toBe('uni-app-vite')
  })

  it('uni-app x 谓词只读取已有的依赖信号', () => {
    const pkg = {}
    Object.defineProperty(pkg, 'scripts', {
      get() {
        throw new Error('uni-app x 不应读取脚本')
      },
    })
    expect(isUniAppXPackage(pkg)).toBe(false)
  })
})

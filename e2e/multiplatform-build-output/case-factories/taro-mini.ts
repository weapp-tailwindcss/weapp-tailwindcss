import type { BuildOutputCase } from '../types'
import { rawTailwindDirectiveRE } from '../helpers'

export const taroMiniOutputByPlatform = {
  weapp: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.wxss',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.wxml',
    styleExtension: '.wxss',
  },
  alipay: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.acss',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.axml',
    styleExtension: '.acss',
  },
  tt: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.ttss',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.ttml',
    styleExtension: '.ttss',
  },
  swan: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.css',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.swan',
    styleExtension: '.css',
  },
  qq: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.qss',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.qml',
    styleExtension: '.qss',
  },
  jd: {
    appJson: 'dist/app.json',
    appStyle: 'dist/app.jxss',
    pageScript: 'dist/pages/index/index.js',
    pageTemplate: 'dist/pages/index/index.jxml',
    styleExtension: '.jxss',
  },
} as const

export type TaroMiniPlatform = keyof typeof taroMiniOutputByPlatform

export function taroMiniCase(options: {
  project: string
  packageName: string
  platform: TaroMiniPlatform
  styleContains: Array<string | RegExp>
  textContains: Array<string | RegExp>
  fileAssertions?: BuildOutputCase['fileAssertions']
  status?: BuildOutputCase['status']
  reason?: string
}): BuildOutputCase {
  const output = taroMiniOutputByPlatform[options.platform]
  return {
    name: `${options.project} ${options.platform}`,
    framework: 'taro',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', '--filter', options.packageName, 'run', `build:${options.platform}`],
    commandCwd: 'repo',
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.js',
      output.appJson,
      output.appStyle,
      output.pageTemplate,
    ],
    styleFiles: ['dist'],
    styleFileExtensions: [output.styleExtension],
    textFiles: [output.pageScript],
    styleContains: options.styleContains,
    forbidEmptyBlockAtRules: true,
    textContains: options.textContains,
    fileAssertions: [
      { file: output.pageTemplate, contains: [/<(?:import|template|view)\b/] },
      ...options.fileAssertions ?? [],
    ],
    notContains: [rawTailwindDirectiveRE],
    status: options.status ?? 'local',
    reason: options.reason ?? 'Taro 小程序目标通过多平台构建专项断言；本地 runner 可能因系统依赖挂起，不放入默认 vitest/execa 构建集合。',
  }
}

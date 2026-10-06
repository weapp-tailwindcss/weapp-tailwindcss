import type { TaroMiniPlatform } from './taro-mini'
import { taroMiniCase, taroMiniOutputByPlatform } from './taro-mini'

export function issue951MiniCase(platform: TaroMiniPlatform) {
  const extension = taroMiniOutputByPlatform[platform].styleExtension
  return taroMiniCase({
    project: 'issue-951-taro-vite-react-tailwindcss-v4',
    packageName: '@weapp-tailwindcss-demo/issue-951-taro-vite-react-tailwindcss-v4',
    platform,
    styleContains: ['.bg-issue-951-main', '.bg-issue-951-normal', '.bg-issue-951-independent'],
    textContains: ['bg-issue-951-main'],
    fileAssertions: [
      {
        file: `dist/app-origin${extension}`,
        contains: ['.bg-issue-951-main'],
        notContains: ['.bg-issue-951-normal', '.bg-issue-951-independent', '.issue-951-page-local'],
      },
      {
        file: `dist/app${extension}`,
        contains: [new RegExp(`@import\\s+["']\\./app-origin${extension.replace('.', '\\.')}["']`)],
        notContains: ['.bg-issue-951-normal', '.bg-issue-951-independent', '.issue-951-page-local'],
      },
      {
        file: `dist/pages/index/index${extension}`,
        contains: ['.issue-951-page-local'],
        notContains: ['.bg-issue-951-main', '.bg-issue-951-normal', '.bg-issue-951-independent'],
      },
      {
        file: `dist/sub-normal/pages/index${extension}`,
        contains: ['.bg-issue-951-normal'],
        notContains: ['.issue-951-page-local', '.bg-issue-951-main', '.bg-issue-951-independent'],
      },
      {
        file: `dist/sub-independent/pages/index${extension}`,
        contains: ['.bg-issue-951-independent'],
        notContains: ['.issue-951-page-local', '.bg-issue-951-main', '.bg-issue-951-normal'],
      },
    ],
    status: 'ci',
  })
}

import path from 'pathe'

export type RootStyleImportShellPlatform = 'mp-alipay' | 'mp-qq' | 'mp-toutiao' | 'mp-weixin'

export interface RootStyleImportShellHmrCase {
  name: string
  project: string
  projectRoot: string
  platform: RootStyleImportShellPlatform
  devScript: string
  sourceFile: string
  rootStyleFile: string
  watchStyleFiles: string[]
  probeClass: string
  probeValue: string
}

const styleExtensions: Record<RootStyleImportShellPlatform, string> = {
  'mp-alipay': 'acss',
  'mp-qq': 'qss',
  'mp-toutiao': 'ttss',
  'mp-weixin': 'wxss',
}

const projectConfigs = [
  {
    project: 'uni-app-vite-tailwindcss-v4',
    platforms: ['mp-weixin', 'mp-alipay', 'mp-qq', 'mp-toutiao'],
    sourceFile: 'src/App.vue',
    watchStyleFile: 'components/HelloWorld',
  },
  {
    project: 'subpackage-uni-app-vite-tailwindcss-v4',
    platforms: ['mp-weixin', 'mp-alipay', 'mp-toutiao'],
    sourceFile: 'src/pages/index/index.vue',
    watchStyleFile: 'pages/index/index',
  },
] as const satisfies ReadonlyArray<{
  project: string
  platforms: readonly RootStyleImportShellPlatform[]
  sourceFile?: string
  watchStyleFile: string
}>

export const ROOT_STYLE_IMPORT_SHELL_HMR_EXEMPTIONS = [
  {
    project: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    reason: '小程序 dev 编译依赖本机 HBuilderX，不进入托管 CI 的 uni CLI watch 矩阵。',
  },
  {
    project: 'uni-app-x-vdom-tailwindcss-v4',
    reason: 'uni-app x 小程序产物依赖本机 HBuilderX，不能由普通 Vite CI runner 生成。',
  },
  {
    project: 'taro-vite-react-tailwindcss-v4',
    reason: 'Taro app 样式是 import 与生成 CSS 合并产物，不是纯本地 import shell。',
  },
  {
    project: 'taro-vite-vue3-tailwindcss-v4',
    reason: 'Taro app 样式是 import 与生成 CSS 合并产物，不是纯本地 import shell。',
  },
  {
    project: 'issue-uview-plus-cssentries',
    reason: '该 demo 禁用 styleInjector，app 样式为空，Tailwind 输出位于 styles/tailwindcss.*。',
  },
] as const

export function createRootStyleImportShellHmrCases(repositoryRoot: string): RootStyleImportShellHmrCase[] {
  let probeIndex = 0

  return projectConfigs.flatMap(({ project, platforms, sourceFile, watchStyleFile }) => {
    const projectRoot = path.resolve(repositoryRoot, `demo/${project}`)
    return platforms.map((platform) => {
      probeIndex += 1
      const probeValue = `${198 + probeIndex}.31rpx`
      const extension = styleExtensions[platform]
      return {
        name: `${project}:${platform}`,
        project,
        projectRoot,
        platform,
        devScript: `dev:${platform}`,
        sourceFile: path.resolve(projectRoot, sourceFile),
        rootStyleFile: path.resolve(projectRoot, `dist/dev/${platform}/app.${extension}`),
        watchStyleFiles: [path.resolve(projectRoot, `dist/dev/${platform}/${watchStyleFile}.${extension}`)],
        probeClass: `text-[${probeValue}]`,
        probeValue,
      }
    })
  })
}

export function selectRootStyleImportShellHmrCases(
  cases: RootStyleImportShellHmrCase[],
  selection: string | undefined,
) {
  if (!selection || selection === 'ci' || selection === 'all') {
    return cases
  }

  const selected = new Set(selection.split(',').map(item => item.trim()).filter(Boolean))
  return cases.filter(item => selected.has(item.name) || selected.has(item.project))
}

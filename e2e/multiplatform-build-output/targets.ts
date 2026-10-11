import type { MultiplatformTarget } from './types'

const uniAppV4Platforms = [
  'app-android',
  'app-ios',
  'h5',
  'h5:ssr',
  'mp-alipay',
  'mp-baidu',
  'mp-jd',
  'mp-kuaishou',
  'mp-lark',
  'mp-qq',
  'mp-toutiao',
  'mp-weixin',
  'mp-xhs',
  'quickapp-webview',
  'quickapp-webview-huawei',
  'quickapp-webview-union',
]

const subpackageUniAppV4Platforms = [
  'app-android',
  'app-ios',
  'h5',
  'h5:ssr',
  'mp-alipay',
  'mp-toutiao',
  'mp-weixin',
]

const taroVitePlatforms = [
  'weapp',
  'swan',
  'alipay',
  'tt',
  'h5',
  'rn',
  'qq',
  'jd',
  'harmony-hybrid',
]

const taroWebpackV4Platforms = [
  'weapp',
  'swan',
  'alipay',
  'tt',
  'h5',
  'rn',
  'qq',
  'jd',
  'harmony-hybrid',
]

const subpackageTaroWebpackV4Platforms = [
  'weapp',
  'alipay',
  'tt',
  'h5',
  'rn',
  'android',
  'ios',
]

const mpxPlatforms = ['wx', 'ali', 'swan', 'tt', 'dd']

const uniAppXPlatforms = ['mp-weixin', 'app-android', 'app-ios', 'app-harmony']

function target(options: Omit<MultiplatformTarget, 'coverage'> & {
  coverage?: MultiplatformTarget['coverage']
}): MultiplatformTarget {
  return {
    coverage: 'local',
    ...options,
  }
}

function createUniAppTargets(project: string, platforms: string[]): MultiplatformTarget[] {
  return platforms.map((platform) => {
    const isApp = platform === 'app-android' || platform === 'app-ios'
    return target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform,
      coverage: isApp ? 'local' : 'default-ci',
      ...(isApp
        ? {
            reason: platform === 'app-android'
              ? 'Android 调试依赖本机 HBuilderX 与 Android 模拟器。'
              : 'iOS 调试依赖 macOS Simulator 与 HBuilderX。',
          }
        : {}),
    })
  })
}

function createGulpTargets(project: string): MultiplatformTarget[] {
  return [target({
    framework: 'gulp',
    projectDir: `demo/${project}`,
    platform: 'tt',
    coverage: 'default-ci',
    reason: 'Gulp 头条端作为原生小程序非微信产物回归，覆盖 .ttss/.ttml 转译结果。',
  })]
}

function createUniAppHBuilderXTargets(project: string): MultiplatformTarget[] {
  return [
    target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform: 'mp-weixin',
      coverage: 'default-ci',
    }),
    target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform: 'h5',
      coverage: 'local',
      reason: 'HBuilderX 版 uni-app H5 产物目前通过 watch-HMR webHmr 链路验证，默认多平台构建只执行 mp-weixin。',
    }),
    target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform: 'app',
      coverage: 'local',
      reason: 'HBuilderX 版 uni-app App 产物依赖本机 HBuilderX、Android 或 iOS SDK，普通 CI 不默认执行。',
    }),
    target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform: 'app-android',
      coverage: 'local',
      reason: 'Android 调试依赖本机 HBuilderX 与 Android 模拟器。',
    }),
    target({
      framework: 'uni-app',
      projectDir: `demo/${project}`,
      platform: 'app-ios',
      coverage: 'local',
      reason: 'iOS 调试依赖 macOS Simulator 与 HBuilderX。',
    }),
  ]
}

function createTaroTargets(project: string, platforms: string[]): MultiplatformTarget[] {
  return platforms.map((platform) => {
    const isTaroViteMiniCi = (
      project.startsWith('taro-vite-')
      || project === 'issue-951-taro-vite-react-tailwindcss-v4'
    ) && (platform === 'alipay' || platform === 'tt' || (project === 'issue-951-taro-vite-react-tailwindcss-v4' && (platform === 'weapp' || platform === 'h5')))
    const isSubpackageWebpackCi = project === 'subpackage-taro-webpack-react-tailwindcss-v4' && (platform === 'weapp' || platform === 'alipay' || platform === 'tt' || platform === 'h5')
    const isCiScript = project === 'taro-webpack-react-tailwindcss-v4' && platform === 'alipay'
    return target({
      framework: 'taro',
      projectDir: `demo/${project}`,
      platform,
      coverage: isTaroViteMiniCi || isSubpackageWebpackCi ? 'default-ci' : isCiScript ? 'ci-script' : 'local',
      reason: isTaroViteMiniCi
        ? 'Taro Vite 小程序与 H5 作为核心产物回归，覆盖平台样式后缀、H5 CSS chunk 与 Vite bundle asset 关系；issue951 同时覆盖微信。'
        : isSubpackageWebpackCi
          ? 'Taro Webpack subpackage Tailwind v4 回归默认覆盖 weapp/alipay/tt 小程序产物和 H5 产物。'
          : isCiScript
            ? '通过 pnpm e2e:multiplatform-build:taro-alipay 做专项构建与只读断言；本地 Taro runner 可能因系统依赖挂起。'
            : '当前 Taro 目标在本仓 demo 中存在 runner 兼容、平台 SDK 或产物残留问题，登记为全平台 local 候选。',
    })
  })
}

function createMpxTargets(project: string): MultiplatformTarget[] {
  return mpxPlatforms.map(platform => target({
    framework: 'mpx',
    projectDir: `demo/${project}`,
    platform,
    coverage: 'default-ci',
  }))
}

function createUniAppXTargets(project: string): MultiplatformTarget[] {
  return uniAppXPlatforms.map(platform => target({
    framework: 'uni-app-x',
    projectDir: `demo/${project}`,
    platform,
    coverage: 'local',
    reason: 'uni-app x 产物依赖本地 HBuilderX 与微信/Android/iOS/Harmony SDK，普通 CI 不默认执行。',
  }))
}

function createUniAppXVaporTargets(project: string): MultiplatformTarget[] {
  return [target({
    framework: 'uni-app-x',
    projectDir: `demo/${project}`,
    platform: 'app-harmony',
    coverage: 'local',
    reason: 'Harmony Vapor 产物依赖本地 HBuilderX 5.24 与在线 Harmony 设备，使用独立 Vapor case 验证。',
  })]
}

export const MULTIPLATFORM_TARGETS: MultiplatformTarget[] = [
  ...createGulpTargets('gulp-tailwindcss-v4'),
  ...createUniAppTargets('uni-app-vite-tailwindcss-v4', uniAppV4Platforms),
  ...createUniAppTargets('subpackage-uni-app-vite-tailwindcss-v4', subpackageUniAppV4Platforms),
  ...createUniAppHBuilderXTargets('uni-app-vite-vue3-hbuilderx-tailwindcss-v4'),
  ...createTaroTargets('taro-vite-react-tailwindcss-v4', taroVitePlatforms),
  ...createTaroTargets('issue-951-taro-vite-react-tailwindcss-v4', ['weapp', 'alipay', 'tt', 'h5']),
  ...createTaroTargets('taro-vite-vue3-tailwindcss-v4', taroVitePlatforms),
  ...createTaroTargets('taro-webpack-react-tailwindcss-v4', taroWebpackV4Platforms),
  ...createTaroTargets('subpackage-taro-webpack-react-tailwindcss-v4', subpackageTaroWebpackV4Platforms),
  ...createTaroTargets('taro-webpack-vue3-tailwindcss-v4', taroWebpackV4Platforms),
  ...createMpxTargets('mpx-tailwindcss-v4'),
  target({
    framework: 'uni-app',
    projectDir: 'demo/style-injector-uni-app',
    platform: 'mp-weixin',
    coverage: 'default-ci',
  }),
  target({
    framework: 'uni-app',
    projectDir: 'demo/style-injector-uni-app',
    platform: 'h5',
    coverage: 'default-ci',
  }),
  target({
    framework: 'mpx',
    projectDir: 'demo/style-injector-mpx',
    platform: 'wx',
    coverage: 'default-ci',
  }),
  target({
    framework: 'taro',
    projectDir: 'demo/style-injector-taro-webpack-react',
    platform: 'weapp',
    coverage: 'default-ci',
  }),
  target({
    framework: 'taro',
    projectDir: 'demo/style-injector-taro-webpack-react',
    platform: 'h5',
    coverage: 'default-ci',
  }),
  target({
    framework: 'taro',
    projectDir: 'demo/style-injector-taro-vite-react',
    platform: 'weapp',
    coverage: 'default-ci',
  }),
  target({
    framework: 'taro',
    projectDir: 'demo/style-injector-taro-vite-react',
    platform: 'h5',
    coverage: 'default-ci',
  }),
  ...createUniAppXTargets('uni-app-x-vdom-tailwindcss-v4'),
  ...createUniAppXVaporTargets('uni-app-x-vapor-tailwindcss-v4'),
]

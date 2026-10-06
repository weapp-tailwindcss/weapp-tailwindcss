import type { ClassMutationConfig, SubPackageMutationConfig, TaroMiniProgramWatchPlatform, UniAppMiniProgramWatchPlatform, WatchCase } from '../../types'
import path from 'node:path'
import {
  appendTrailingSnippet,
  createStyleRuleSnippet,
  insertBeforeClosingTag,
  insertIntoVueTemplateRoot,
  mutateScriptByDataAnchor,
  mutateScriptByDataAnchorWithCommentCarrier,
  mutateTsxScriptByReturnAnchor,
  mutateVueRefStringLiteral,
  replaceExactSnippet,
} from '../../text'
import { buildBaselineHexScriptRoundConfigs, buildHexScriptRoundConfigs, buildIssue33HighRiskRoundConfigs, buildTailwindV4JsContentRoundConfigs, MINI_PROGRAM_REMOVED_CSS_UTILITIES } from '../round-configs'

const taroWatchEnv = {
  TARO_BUILD_STRICT: '1',
  TARO_E2E_WATCH_NATIVE: '0',
  CHOKIDAR_USEPOLLING: '1',
  CHOKIDAR_INTERVAL: '50',
  WATCHPACK_POLLING: '50',
}

const mpxWatchEnv = {
  CHOKIDAR_USEPOLLING: '1',
  CHOKIDAR_INTERVAL: '50',
  WATCHPACK_POLLING: '50',
}

const taroViteWatchEnv = {
  TARO_BUILD_STRICT: '1',
  TARO_E2E_WATCH_NATIVE: '1',
  CHOKIDAR_USEPOLLING: '1',
  CHOKIDAR_INTERVAL: '50',
  NODE_ENV: 'development',
}

// Taro Vite 使用同一 compiler 的增量构建，预算覆盖 native watch 中的 CSS replay 与转译。
const taroViteNativeWatchPluginProcessBudgetMs = 10000
// Taro Webpack polling-build 每次变更都会启动新的完整构建，采样覆盖冷态多入口 CSS 生成与转译，
// 不等同于同一 compiler 内的增量插件耗时；预算按 hosted runner 的稳定 p95 保留余量。
const taroPollingBuildPluginProcessBudgetMs = 18000
const webDomMarkerAttr = 'data-tw-watch-web-dom="1"'
const taroMiniProgramPlatforms: TaroMiniProgramWatchPlatform[] = ['weapp', 'alipay', 'tt']
const uniAppMiniProgramPlatforms: UniAppMiniProgramWatchPlatform[] = ['mp-weixin', 'mp-alipay', 'mp-qq', 'mp-toutiao']
const taroOutputExtensions: Record<TaroMiniProgramWatchPlatform, {
  template: string
  style: string
}> = {
  weapp: {
    template: 'wxml',
    style: 'wxss',
  },
  alipay: {
    template: 'axml',
    style: 'acss',
  },
  tt: {
    template: 'ttml',
    style: 'ttss',
  },
}
const uniAppOutputExtensions: Record<UniAppMiniProgramWatchPlatform, {
  template: string
  style: string
}> = {
  'mp-weixin': {
    template: 'wxml',
    style: 'wxss',
  },
  'mp-alipay': {
    template: 'axml',
    style: 'acss',
  },
  'mp-qq': {
    template: 'qml',
    style: 'qss',
  },
  'mp-toutiao': {
    template: 'ttml',
    style: 'ttss',
  },
}

function normalizeExtension(version: 'v3' | 'v4') {
  return version === 'v3' ? 'scss' : 'css'
}

function replacePathSegment(filePath: string, from: string, to: string) {
  const normalizedFrom = from.replace(/^\/|\/$/g, '')
  const normalizedTo = to.replace(/^\/|\/$/g, '')
  return filePath
    .replaceAll(normalizedFrom.replaceAll('/', path.sep), normalizedTo.replaceAll('/', path.sep))
    .replaceAll(normalizedFrom.replaceAll('/', '/'), normalizedTo.replaceAll('/', '/'))
}

function replaceExtension(filePath: string, from: string, to: string) {
  return filePath.replace(new RegExp(`\\.${from.replace('.', '\\.')}(\\*?)$`), `.${to}$1`)
}

function createTaroPlatformCase(
  watchCase: WatchCase,
  platform: TaroMiniProgramWatchPlatform,
): WatchCase {
  if (platform === 'weapp') {
    return {
      ...watchCase,
      name: `${watchCase.name}:${platform}`,
      label: `${watchCase.label}:${platform}`,
      devScript: 'dev:e2e-watch',
    }
  }

  const outputExtensions = taroOutputExtensions[platform]
  const replaceOutputFile = (filePath: string) => {
    return replaceExtension(
      replaceExtension(filePath, 'wxml', outputExtensions.template),
      'wxss',
      outputExtensions.style,
    )
  }
  const replaceOutputFiles = (files: string[]) => files.map(replaceOutputFile)

  return {
    ...watchCase,
    name: `${watchCase.name}:${platform}`,
    label: `${watchCase.label}:${platform}`,
    devScript: 'dev:e2e-watch',
    env: {
      ...watchCase.env,
      TARO_E2E_WATCH_PLATFORM: platform,
    },
    outputWxml: replaceOutputFile(watchCase.outputWxml),
    outputStyleCandidates: replaceOutputFiles(watchCase.outputStyleCandidates),
    globalStyleCandidates: replaceOutputFiles(watchCase.globalStyleCandidates),
    subPackageMutations: watchCase.subPackageMutations?.map(mutation => ({
      ...mutation,
      outputWxml: replaceOutputFile(mutation.outputWxml),
      outputStyleCandidates: replaceOutputFiles(mutation.outputStyleCandidates),
      globalStyleCandidates: replaceOutputFiles(mutation.globalStyleCandidates),
    })),
  }
}

function createUniAppPlatformCase(
  watchCase: WatchCase,
  platform: UniAppMiniProgramWatchPlatform,
): WatchCase {
  const outputExtensions = uniAppOutputExtensions[platform]
  const replacePlatformPath = (filePath: string) => replacePathSegment(filePath, '/dist/dev/mp-weixin/', `/dist/build/${platform}/`)
  const replaceOutputFile = (filePath: string) => {
    return replaceExtension(
      replaceExtension(replacePlatformPath(filePath), 'wxml', outputExtensions.template),
      'wxss',
      outputExtensions.style,
    )
  }
  const replaceOutputFiles = (files: string[]) => files.map(replaceOutputFile)
  const buildOutputRoot = replacePlatformPath(path.resolve(watchCase.cwd, 'dist/dev/mp-weixin'))
  const buildGlobalStyleCandidates = [
    path.join(buildOutputRoot, `main.${outputExtensions.style}`),
    path.join(buildOutputRoot, `common.${outputExtensions.style}`),
    path.join(buildOutputRoot, `app.${outputExtensions.style}`),
  ]
  return {
    ...watchCase,
    name: `${watchCase.name}:${platform}`,
    label: `${watchCase.label}:${platform}`,
    devScript: 'dev:e2e-watch',
    env: {
      ...watchCase.env,
      UNI_E2E_WATCH_PLATFORM: platform,
    },
    outputWxml: replaceOutputFile(watchCase.outputWxml),
    outputJs: replacePlatformPath(watchCase.outputJs),
    outputStyleCandidates: buildGlobalStyleCandidates,
    globalStyleCandidates: buildGlobalStyleCandidates,
    outputIntegrityGuards: watchCase.outputIntegrityGuards?.map(guard => ({
      ...guard,
      ...(guard.file ? { file: replaceOutputFile(guard.file) } : {}),
      ...(guard.directory ? { directory: replacePlatformPath(guard.directory) } : {}),
    })),
    subPackageMutations: watchCase.subPackageMutations?.map(mutation => ({
      ...mutation,
      outputWxml: replaceOutputFile(mutation.outputWxml),
      outputJs: replacePlatformPath(mutation.outputJs),
      outputStyleCandidates: replaceOutputFiles(mutation.outputStyleCandidates),
      globalStyleCandidates: [
        ...replaceOutputFiles(mutation.globalStyleCandidates),
        ...buildGlobalStyleCandidates,
      ],
    })),
  }
}

function createPlatformCases(watchCase: WatchCase, platforms: readonly TaroMiniProgramWatchPlatform[]): WatchCase[]
function createPlatformCases(watchCase: WatchCase, platforms: readonly UniAppMiniProgramWatchPlatform[]): WatchCase[]
function createPlatformCases(watchCase: WatchCase, platforms: readonly (TaroMiniProgramWatchPlatform | UniAppMiniProgramWatchPlatform)[]) {
  if (watchCase.name.startsWith('uni-app-vite-tailwindcss-v4')) {
    return (platforms as readonly UniAppMiniProgramWatchPlatform[]).map(platform => createUniAppPlatformCase(watchCase, platform))
  }
  return (platforms as readonly TaroMiniProgramWatchPlatform[]).map(platform => createTaroPlatformCase(watchCase, platform))
}

function replaceWebDomSnippet(source: string, from: string, to: string) {
  return {
    next: replaceExactSnippet(source, from, to, 'web HMR source DOM replacement anchor'),
    from,
    to,
  }
}

function mutateVueScriptWithTemplateConsumer(
  source: string,
  payload: Parameters<NonNullable<WatchCase['scriptMutation']>['mutate']>[1],
) {
  return insertBeforeClosingTag(
    insertBeforeClosingTag(
      source,
      '</script>',
      `const ${payload.classVariableName} = '${payload.classLiteral}'\nconst __twWatchScriptMarker = '${payload.marker}'`,
    ),
    '</template>',
    `    <view hidden :class="${payload.classVariableName}">{{ __twWatchScriptMarker }}</view>`,
  )
}

function createSubPackageMutations(
  baseCwd: string,
  options: {
    project: string
    sourceRoot: string
    distRoot: string
    version: 'v3' | 'v4'
    pageKind: 'tsx' | 'vue' | 'mpx'
    styleExtension?: 'scss' | 'css'
    styleSourceFile?: (subPackage: 'sub-normal' | 'sub-independent') => string
    styleCandidates?: (subPackage: 'sub-normal' | 'sub-independent') => string[]
    globalStyleCandidates?: (subPackage: 'sub-normal' | 'sub-independent') => string[]
    styleMutationOptions?: Pick<NonNullable<WatchCase['subPackageMutations']>[number]['styleMutation'], 'validateApply' | 'validateFunction' | 'outputNeedles' | 'rollbackNeedles'>
    skipStyleMutation?: boolean
    templateVerifyEscapedIn?: Array<'wxml' | 'js'>
    templateVerifyClassLiteralIn?: Array<'wxml' | 'js'>
    templateVerifyAllClassLiterals?: boolean
    expectedRemovedCssUtilities?: ClassMutationConfig['expectedRemovedCssUtilities']
  },
): SubPackageMutationConfig[] {
  const styleExtension = options.styleExtension ?? normalizeExtension(options.version)
  return (['sub-normal', 'sub-independent'] as const).map((subPackage) => {
    const independent = subPackage === 'sub-independent'
    const label = independent ? 'independent' : 'normal'
    const sourceDir = path.resolve(baseCwd, `demo/${options.project}/${options.sourceRoot}/${subPackage}/pages`)
    const distDir = path.resolve(baseCwd, `demo/${options.project}/${options.distRoot}/${subPackage}/pages`)
    const pageSource = path.join(sourceDir, `index.${options.pageKind}`)
    const styleSource = options.styleSourceFile?.(subPackage) ?? path.join(sourceDir, `index.${styleExtension}`)
    const outputStyleCandidates = options.styleCandidates?.(subPackage) ?? [
      path.join(distDir, 'index.wxss'),
    ]
    const globalStyleCandidates = options.globalStyleCandidates?.(subPackage) ?? outputStyleCandidates
    const roundConfigs = buildHexScriptRoundConfigs()

    return {
      root: subPackage,
      independent,
      outputWxml: path.join(distDir, 'index.wxml'),
      outputJs: path.join(distDir, 'index.js'),
      outputStyleCandidates,
      globalStyleCandidates,
      ...(options.skipStyleMutation === undefined ? {} : { skipStyleMutation: options.skipStyleMutation }),
      templateMutation: {
        sourceFile: pageSource,
        verifyEscapedIn: options.templateVerifyEscapedIn
          ?? (options.pageKind === 'tsx' ? ['js'] : ['wxml']),
        verifyClassLiteralIn: options.templateVerifyClassLiteralIn
          ?? (options.pageKind === 'tsx' ? ['js'] : []),
        ...(options.templateVerifyAllClassLiterals === undefined
          ? {}
          : { verifyAllClassLiterals: options.templateVerifyAllClassLiterals }),
        roundConfigs,
        ...(options.expectedRemovedCssUtilities ? { expectedRemovedCssUtilities: options.expectedRemovedCssUtilities } : {}),
        mutate(source, payload) {
          if (options.pageKind === 'tsx') {
            const snippet = `  <View className="${payload.classLiteral}">${payload.marker}-${label}-subpackage</View>`
            return insertBeforeClosingTag(source, '</View>', snippet)
          }
          const snippet = `  <view class="${payload.classLiteral}">${payload.marker}-${label}-subpackage</view>`
          return insertBeforeClosingTag(source, '</template>', snippet)
        },
      },
      styleMutation: {
        sourceFile: styleSource,
        ...options.styleMutationOptions,
        mutate(source, payload) {
          return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
        },
      },
    }
  })
}

export function buildDemoExtendedCases(baseCwd: string): WatchCase[] {
  const uniAppTailwindcssV4Case: WatchCase = {
    name: 'uni-app-vite-tailwindcss-v4',
    label: 'demo/uni-app-vite-tailwindcss-v4',
    project: 'demo/uni-app-vite-tailwindcss-v4',
    group: 'demo',
    // uni-app Vite v4 的独立分包 HMR 会触发较重的 CSS 汇总阶段；
    // 这里保留 case 级预算，避免放宽其它 demo 的处理耗时约束。
    maxPluginProcessMs: 4000,
    requireInitialCompileSuccess: true,
    cwd: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4'),
    devScript: 'dev:mp-weixin',
    outputWxml: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/main.wxss'),
      path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/src/main.wxss'),
      path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/main.wxss'),
      path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
    ],
    outputIntegrityGuards: [{
      file: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/components/HelloWorld.wxss'),
      forbiddenFragments: [
        '.i-\\[',
        '.before\\:',
      ],
    }, {
      directory: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin'),
      forbidEmptyBlockAtRules: true,
    }],
    userReportedHotUpdate: {
      label: 'index text-[102.43rpx] to text-[103.43rpx]',
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/pages/index/index.vue'),
      before: 'text-[#00f285] text-[102.43rpx] font-bold underline',
      after: 'text-[#00f285] text-[103.43rpx] font-bold underline',
      beforeClassTokens: ['text-[102.43rpx]'],
      afterClassTokens: ['text-[103.43rpx]'],
      verifyEscapedIn: ['wxml'],
    },
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          'const className = ref(\'bg-[#0000ff] text-[45rpx] text-white\')',
          `const className = ref('${payload.classLiteral}')`,
          'uni-app-vite-tailwindcss-v4 script class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: [],
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      roundConfigs: [
        ...buildHexScriptRoundConfigs(),
        {
          name: 'named-arbitrary-colors',
          buildClassTokens(seed: string) {
            const numericSeed = seed.replace(/\D/g, '').padEnd(2, '0')
            return ['text-[yellow]', 'bg-[blue]', `h-[${Number(numericSeed.slice(0, 2)) + 31}px]`]
          },
        },
      ],
      mutate(source, payload) {
        const snippet = `    <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertIntoVueTemplateRoot(source, snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateVueRefStringLiteral(
          source,
          'className',
          payload,
        )
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/main.css'),
      importerFiles: [
        path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/main.ts'),
      ],
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'uni-app-vite-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist/dev/mp-weixin',
      version: 'v4',
      pageKind: 'vue',
      skipStyleMutation: true,
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, `demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/src/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
        ]
      },
    }),
    webHmr: {
      devScript: 'dev:h5',
      sourceFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/pages/index/index.vue'),
      cssEntryFile: path.resolve(baseCwd, 'demo/uni-app-vite-tailwindcss-v4/src/main.css'),
      injectMarkerElement: true,
      touchCssEntryOnSourceMutation: false,
      readySelector: 'uni-page[data-page="pages/index/index"]',
      initialMutationDelayMs: 1500,
      reloadOnHmrStall: true,
      hmrReloadStallMs: 5_000,
      mutate(source, payload) {
        return `${source}\n<!-- ${payload.marker} ${payload.classLiteral} -->`
      },
      sourceDomReplacementSequence: [
        {
          label: 'title and color text-[#00f285] to text-[#123456]',
          beforeSelector: '.text-\\[\\#00f285\\]',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `<text class="text-[#00f285] text-[102.43rpx] font-bold underline">{{ title }}</text>`,
              `<text ${webDomMarkerAttr} class="text-[#123456] text-[102.43rpx] font-bold underline">H5-HMR-UNI-V4</text>`,
            )
          },
          expectedText: 'H5-HMR-UNI-V4',
          expectedStyle: {
            color: 'rgb(18, 52, 86)',
          },
        },
        {
          label: 'vue script className bg-[#0000ff] to bg-[#55cc00]',
          selector: '[data-tw-watch-web-dom="script-class"]',
          mutate(source) {
            const mutation = replaceWebDomSnippet(
              source,
              `<view :class="className" class="aspect-[calc(4*3+1)/3]">`,
              `<view data-tw-watch-web-dom="script-class" :class="className" class="aspect-[calc(4*3+1)/3]">`,
            )
            return {
              ...mutation,
              next: replaceExactSnippet(
                mutation.next,
                `const className = ref('bg-[#0000ff] text-[45rpx] text-white')`,
                `const className = ref('bg-[#55cc00] text-[45rpx] text-white')`,
                'uni-app-vite-tailwindcss-v4 web script className anchor',
              ),
            }
          },
          expectedText: 'bg-[#55cc00] text-[45rpx] text-white',
          expectedStyle: {
            backgroundColor: 'rgb(85, 204, 0)',
          },
          expectedCssIncludes: ['.bg-\\[\\#55cc00\\]'],
        },
      ],
    },
  }

  const mpxTailwindcssV4Case: WatchCase = {
    name: 'mpx-tailwindcss-v4',
    label: 'demo/mpx-tailwindcss-v4',
    project: 'demo/mpx-tailwindcss-v4',
    group: 'demo',
    // Mpx v4 的 webpack watch 在完整主包/分包矩阵下会触发多轮较重的 CSS 汇总阶段。
    // 这里保留 case 级预算，避免放宽全局 500ms 守卫。
    maxPluginProcessMs: 8000,
    initialMutationDelayMs: 15_000,
    splitSubPackageWatchSessions: true,
    cwd: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4'),
    devScript: 'dev:e2e-watch',
    env: mpxWatchEnv,
    outputWxml: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/custom-tab-bar/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/custom-tab-bar/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/custom-tab-bar/index.wxss'),
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/styles/app*.wxss'),
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/styles/index*.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/styles/app*.wxss'),
      path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/styles/index*.wxss'),
    ],
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/src/custom-tab-bar/index.mpx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          '    clsnm: \'bg-[#010101] active:bg-[#989898]\'',
          `    clsnm: '${payload.classLiteral}'`,
          'mpx-tailwindcss-v4 script class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/src/custom-tab-bar/index.mpx'),
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: [],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `  <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertBeforeClosingTag(source, '</template>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/src/custom-tab-bar/index.mpx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildTailwindV4JsContentRoundConfigs(),
      mutate(source, payload) {
        return mutateScriptByDataAnchor(source, '  data: {', payload)
      },
      mutateCommentCarrier(source, payload) {
        return mutateScriptByDataAnchorWithCommentCarrier(source, '  data: {', payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/src/pages/component/index.mpx'),
      verifyOutputCandidates: [
        path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/pages/component/index.wxss'),
      ],
      validateApply: false,
      mutate(source, payload) {
        return insertBeforeClosingTag(source, '</style>', createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'mpx-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist/wx',
      version: 'v4',
      pageKind: 'mpx',
      styleSourceFile(subPackage) {
        return path.resolve(baseCwd, `demo/mpx-tailwindcss-v4/src/${subPackage}/index.css`)
      },
      styleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/mpx-tailwindcss-v4/dist/wx/${subPackage}/pages/index.js`),
        ]
      },
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/mpx-tailwindcss-v4/dist/wx/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, `demo/mpx-tailwindcss-v4/dist/wx/${subPackage}/styles/*.wxss`),
          path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/styles/*.wxss'),
          path.resolve(baseCwd, 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
        ]
      },
      styleMutationOptions: {
        validateApply: false,
        validateFunction: false,
      },
    }).map(mutation => ({
      ...mutation,
      templateMutation: {
        ...mutation.templateMutation,
        roundConfigs: buildBaselineHexScriptRoundConfigs(),
        skipExtendedHmr: true,
      },
      mainStyleMutation: {
        ...mutation.templateMutation,
        sourceFile: mutation.styleMutation.sourceFile,
        verifyEscapedIn: [],
        mutate(source, payload) {
          if (!payload.classLiteral.trim()) {
            return source
          }
          const inlineSource = payload.classLiteral.trim()
          const inlineDirective = `@source inline(${JSON.stringify(inlineSource)});`
          const markerRule = `\n/* ${payload.marker}-${mutation.root}-main-style */\n.tw-watch-${mutation.root}-main-style { color: transparent; }\n`
          return `${source}\n${inlineDirective}${markerRule}`
        },
      },
    })),
  }

  const taroViteTailwindcssV4Case: WatchCase = {
    name: 'taro-vite-react-tailwindcss-v4',
    label: 'demo/taro-vite-react-tailwindcss-v4',
    project: 'demo/taro-vite-react-tailwindcss-v4',
    group: 'demo',
    maxPluginProcessMs: taroViteNativeWatchPluginProcessBudgetMs,
    initialMutationDelayMs: 15_000,
    cwd: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4'),
    devScript: 'dev:e2e-watch',
    env: taroViteWatchEnv,
    requireInitialCompileSuccess: true,
    outputWxml: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/sub-independent/pages/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app-origin.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/sub-independent/pages/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app-origin.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app.wxss'),
    ],
    // Taro Vite v4 在轮询重建时会重写全局 wxss，保留 class 转义与回滚校验即可。
    requireStableGlobalStyleOnSameClassLiteral: false,
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          '      <div className=\'h-[300px] text-[#c31d6b] bg-[#123456]\'>短斤少两快点撒</div>',
          `      <div className='${payload.classLiteral}'>短斤少两快点撒</div>`,
          'taro-vite-react-tailwindcss-v4 jsx class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `      <View className={${JSON.stringify(payload.classLiteral)}}>${payload.marker}-template</View>`
        return insertBeforeClosingTag(source, '    </View>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateTsxScriptByReturnAnchor(source, payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/app.css'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'taro-vite-react-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'tsx',
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/taro-vite-react-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app-origin.wxss'),
          path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
    webHmr: {
      devScript: 'build:h5',
      devArgs: ['--watch'],
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/pages/index/index.tsx'),
      cssEntryFile: path.resolve(baseCwd, 'demo/taro-vite-react-tailwindcss-v4/src/app.css'),
      injectMarkerElement: true,
      // TSX 注释已携带待扫描 class；只写源码，避免 macOS watcher 合并相邻的源码与 CSS 原子替换事件。
      touchCssEntryOnSourceMutation: false,
      reloadOnHmrStall: true,
      hmrReloadStallMs: 5_000,
      env: {
        NODE_ENV: 'development',
      },
      mutate(source, payload) {
        return `${source}\n// ${payload.marker} ${payload.classLiteral}\n`
      },
      sourceDomReplacementSequence: [
        {
          label: 'bg-[red] to bg-[#00ff00]',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `      <View className='bg-[red]'>Hello world!</View>`,
              `      <View ${webDomMarkerAttr} className='bg-[#00ff00]'>Hello world!</View>`,
            )
          },
          expectedText: 'Hello world!',
          expectedStyle: {
            backgroundColor: 'rgb(0, 255, 0)',
          },
        },
        {
          label: 'bg-[#00ff00] to bg-[#0000ff]',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `      <View ${webDomMarkerAttr} className='bg-[#00ff00]'>Hello world!</View>`,
              `      <View ${webDomMarkerAttr} className='bg-[#0000ff]'>Hello world!</View>`,
            )
          },
          expectedText: 'Hello world!',
          expectedStyle: {
            backgroundColor: 'rgb(0, 0, 255)',
          },
        },
      ],
    },
  }

  const taroWebpackTailwindcssV4DemoCase: WatchCase = {
    name: 'taro-webpack-react-tailwindcss-v4',
    label: 'demo/taro-webpack-react-tailwindcss-v4',
    project: 'demo/taro-webpack-react-tailwindcss-v4',
    group: 'demo',
    maxPluginProcessMs: taroPollingBuildPluginProcessBudgetMs,
    // Taro webpack React v4 watch 在 e2e 轮询重建时会重写全局 wxss；
    // same-class-literal 仍校验 HMR 生效、回滚与 escaped class，不强制全局样式文本完全稳定。
    requireStableGlobalStyleOnSameClassLiteral: false,
    cwd: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4'),
    devScript: 'dev:e2e-watch',
    env: taroWatchEnv,
    requireInitialCompileSuccess: true,
    outputWxml: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/app.wxss'),
    ],
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          '      <View className=\'bg-[#534312] text-[#fff] text-[100rpx]\'>',
          `      <View className='${payload.classLiteral}'>`,
          'taro-webpack-react-tailwindcss-v4 jsx class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `      <View className={${JSON.stringify(payload.classLiteral)}}>${payload.marker}-template</View>`
        return insertBeforeClosingTag(source, '    </>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.tsx'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateTsxScriptByReturnAnchor(source, payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.css'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'taro-webpack-react-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'tsx',
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/taro-webpack-react-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
    webHmr: {
      devScript: 'dev:h5',
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.tsx'),
      cssEntryFile: path.resolve(baseCwd, 'demo/taro-webpack-react-tailwindcss-v4/src/app.css'),
      injectMarkerElement: true,
      readySelector: '#tw-watch-dom',
      waitForInitialCompileSettled: true,
      initialCompileSettleTimeoutMs: 900_000,
      compileSettleTimeoutMs: 180_000,
      env: {
        NODE_ENV: 'development',
      },
      mutate(source, payload) {
        return `${source}\n// ${payload.marker} ${payload.classLiteral}\n`
      },
      sourceDomReplacementSequence: [
        {
          label: 'bg-purple-800 to bg-[#123]',
          selector: '#tw-watch-dom',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `      <View id='tw-watch-dom' className='bg-purple-800 text-pink-200'>`,
              `      <View id='tw-watch-dom' className='bg-[#123] text-pink-200'>`,
            )
          },
          expectedText: '11',
          expectedStyle: {
            backgroundColor: 'rgb(17, 34, 51)',
          },
        },
        {
          label: 'bg-[#123] to bg-[#124]',
          selector: '#tw-watch-dom',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `      <View id='tw-watch-dom' className='bg-[#123] text-pink-200'>`,
              `      <View id='tw-watch-dom' className='bg-[#124] text-pink-200'>`,
            )
          },
          expectedText: '11',
          expectedStyle: {
            backgroundColor: 'rgb(17, 34, 68)',
          },
        },
        {
          label: 'bg-[#124] to bg-[#125]',
          selector: '#tw-watch-dom',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `      <View id='tw-watch-dom' className='bg-[#124] text-pink-200'>`,
              `      <View id='tw-watch-dom' className='bg-[#125] text-pink-200'>`,
            )
          },
          expectedText: '11',
          expectedStyle: {
            backgroundColor: 'rgb(17, 34, 85)',
          },
        },
      ],
    },
  }

  const taroViteVue3V4Case: WatchCase = {
    ...taroViteTailwindcssV4Case,
    name: 'taro-vite-vue3-tailwindcss-v4',
    label: 'demo/taro-vite-vue3-tailwindcss-v4',
    project: 'demo/taro-vite-vue3-tailwindcss-v4',
    cwd: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4'),
    outputWxml: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app-origin.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app-origin.wxss'),
      path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app.wxss'),
    ],
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          '<view class="h-[300px] text-[#c31d6b] bg-[#123456]">Taro Vite Vue3 Tailwind CSS v4</view>',
          `<view class="${payload.classLiteral}">Taro Vite Vue3 Tailwind CSS v4</view>`,
          'taro-vite-vue3-tailwindcss-v4 vue class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      verifyAllEscapedClasses: false,
      verifyAllClassLiterals: false,
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `    <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertBeforeClosingTag(source, '</template>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateVueScriptWithTemplateConsumer(source, payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/app.css'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'taro-vite-vue3-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'vue',
      templateVerifyEscapedIn: ['js'],
      templateVerifyClassLiteralIn: ['js'],
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/taro-vite-vue3-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app-origin.wxss'),
          path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
    webHmr: {
      devScript: 'build:h5',
      devArgs: ['--watch'],
      sourceFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      cssEntryFile: path.resolve(baseCwd, 'demo/taro-vite-vue3-tailwindcss-v4/src/app.css'),
      // Vue H5 通过同一个模板 HMR 同时携带 DOM 与 class，避免源码注释和 app.css 双更新竞态。
      injectMarkerElement: false,
      touchCssEntryOnSourceMutation: false,
      reloadOnHmrStall: true,
      hmrReloadStallMs: 5_000,
      env: {
        NODE_ENV: 'development',
      },
      mutate(source, payload) {
        const snippet = `    <view data-tw-watch-web="${payload.marker}" class="${payload.classLiteral}">${payload.marker}-web</view>`
        return insertBeforeClosingTag(source, '</template>', snippet)
      },
      sourceDomReplacementSequence: [
        {
          label: 'vue template bg-[#123456] to bg-[#00ff00]',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `    <view class="h-[300px] text-[#c31d6b] bg-[#123456]">Taro Vite Vue3 Tailwind CSS v4</view>`,
              `    <view ${webDomMarkerAttr} class="h-[300px] text-[#c31d6b] bg-[#00ff00]">Taro Vite Vue3 Tailwind CSS v4</view>`,
            )
          },
          expectedText: 'Taro Vite Vue3 Tailwind CSS v4',
          expectedStyle: {
            backgroundColor: 'rgb(0, 255, 0)',
          },
        },
      ],
    },
  }

  const taroWebpackVue3V4Case: WatchCase = {
    ...taroWebpackTailwindcssV4DemoCase,
    name: 'taro-webpack-vue3-tailwindcss-v4',
    label: 'demo/taro-webpack-vue3-tailwindcss-v4',
    project: 'demo/taro-webpack-vue3-tailwindcss-v4',
    // Taro webpack Vue watch 在 e2e 轮询重建时会重写全局 wxss；
    // same-class-literal 仍校验 HMR 生效、回滚与 escaped class，不强制全局样式文本完全稳定。
    requireStableGlobalStyleOnSameClassLiteral: false,
    cwd: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4'),
    outputWxml: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/app.wxss'),
    ],
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      forbidBgHexTruncationIn: ['js'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          '<view class="bg-[#534312] text-[#fff] text-[100rpx]">',
          `<view class="${payload.classLiteral}">`,
          'taro-webpack-vue3-tailwindcss-v4 vue class anchor',
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `    <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertBeforeClosingTag(source, '</template>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateVueScriptWithTemplateConsumer(source, payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.css'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'taro-webpack-vue3-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'vue',
      templateVerifyEscapedIn: ['js'],
      templateVerifyClassLiteralIn: ['js'],
      templateVerifyAllClassLiterals: false,
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/taro-webpack-vue3-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
    webHmr: {
      devScript: 'build:h5',
      devArgs: ['--watch'],
      sourceFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/pages/index/index.vue'),
      cssEntryFile: path.resolve(baseCwd, 'demo/taro-webpack-vue3-tailwindcss-v4/src/app.css'),
      injectMarkerElement: true,
      waitForInitialCompileSettled: true,
      initialCompileSettleTimeoutMs: 900_000,
      compileSettleTimeoutMs: 120_000,
      env: {
        NODE_ENV: 'development',
      },
      mutate(source, payload) {
        return `${source}\n<!-- ${payload.marker} ${payload.classLiteral} -->\n`
      },
      sourceDomReplacementSequence: [
        {
          label: 'vue template bg-purple-800 to bg-[#00ff00]',
          mutate(source) {
            return replaceWebDomSnippet(
              source,
              `    <view class="bg-purple-800 text-pink-200">Taro Webpack Vue3 Tailwind CSS v4</view>`,
              `    <view ${webDomMarkerAttr} class="bg-[#00ff00] text-pink-200">Taro Webpack Vue3 Tailwind CSS v4</view>`,
            )
          },
          expectedText: 'Taro Webpack Vue3 Tailwind CSS v4',
          expectedStyle: {
            backgroundColor: 'rgb(0, 255, 0)',
          },
        },
      ],
    },
  }

  return [
    uniAppTailwindcssV4Case,
    mpxTailwindcssV4Case,
    taroViteTailwindcssV4Case,
    ...createPlatformCases(taroViteTailwindcssV4Case, taroMiniProgramPlatforms),
    taroWebpackTailwindcssV4DemoCase,
    ...createPlatformCases(taroWebpackTailwindcssV4DemoCase, ['weapp']),
    taroViteVue3V4Case,
    ...createPlatformCases(taroViteVue3V4Case, taroMiniProgramPlatforms),
    taroWebpackVue3V4Case,
    ...createPlatformCases(taroWebpackVue3V4Case, ['weapp']),
    ...createPlatformCases(uniAppTailwindcssV4Case, uniAppMiniProgramPlatforms),
  ]
}

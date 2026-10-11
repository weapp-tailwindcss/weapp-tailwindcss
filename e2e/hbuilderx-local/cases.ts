import type { AppUpdateMode } from './hmr-lifecycle'
import type { AppRenderMode } from './render-mode'
import process from 'node:process'
import { issue1144InitialStyles, issue1144Steps } from './issue-1144'

export const rawTailwindDirectiveRE = /@(import\s+["']tailwindcss|tailwind|apply|theme|source)\b[^;\n{}]*[;{]/
const unsafeMiniProgramSelectorFragments = ['.i-\\[', '.before\\:'] as const
const safeMiniProgramGeneratedSelectors = [
  '.i-_bmdi--github-circle_B',
  '.i-_bmdi--star_B',
  '.i-_bsvg-spinners--180-ring-with-bg_B',
  '.before_ccontent-',
] as const

export interface MiniProgramCase {
  name: string
  platform: MiniProgramPlatform
  projectDir: string
  outputDir: string
  outputDirCandidates?: string[]
  cssExtensions: string[]
  requiredFiles: string[]
  cssContains: Array<string | RegExp>
  cssNotContains?: Array<string | RegExp>
  outputContains?: Record<string, Array<string | RegExp>>
  outputNotContains?: Record<string, Array<string | RegExp>>
  workflow: HBuilderXWorkflowCoverage
}

export type MiniProgramPlatform = 'mp-alipay' | 'mp-baidu' | 'mp-toutiao' | 'mp-weixin'
export type AppPlatform = 'app-android' | 'app-ios' | 'app-harmony'

export interface HmrSourceMutation {
  append?: string
  cssContains?: Array<string | RegExp>
  expectOutputRefresh?: boolean
  file: string
  replace?: {
    from: string
    to: string
  }
  touch?: boolean
}

export interface AppHmrStep {
  name: string
  markerClass: string
  markerTextClass?: string
  markerText: string
  transformedContains: Array<string | RegExp>
  transformedNotContains?: Array<string | RegExp>
  styleContains?: Array<string | RegExp>
  runtime?: AndroidRuntimeStyleExpectation
  sourceMutation?: HmrSourceMutation
}

export interface AndroidRuntimeStyleExpectation {
  backgroundColor: string
  height: number
  markerText: string
  textColor?: string
  width: number
}

export interface HarmonyRuntimeTextPair {
  tailwindText: string
  nativeText: string
  maxHeightDifference?: number
  tailwindLayoutNodeIndex?: number
  nativeLayoutNodeIndex?: number
}

export interface AppCase {
  name: string
  platform: AppPlatform
  /** 默认要求纯 HMR；只有确认上游更新机制的用例才允许原生热重载。 */
  updateMode?: AppUpdateMode
  projectDir: string
  outputDir: string
  outputDirCandidates?: string[]
  sourceFile: string
  markerAnchor: string
  markerAnchorCandidates?: string[]
  markerClass: string
  markerTextClass?: string
  markerText: string
  hmrMarkerClass: string
  hmrMarkerTextClass?: string
  hmrMarkerText: string
  hmrSteps?: AppHmrStep[]
  launchArgs?: string[]
  launchEnv?: Record<string, string>
  requiredFiles: string[]
  transformedFiles?: string[]
  transformedOutputFiles?: string[]
  /** 热更新移除断言应限定到实际发生变更的产物，避免被其他入口的同值声明干扰。 */
  hmrTransformedOutputFiles?: string[]
  transformedContains: Array<string | RegExp>
  compiledStyleContains?: Array<string | RegExp>
  transformedNotContains?: Array<string | RegExp>
  hmrTransformedContains: Array<string | RegExp>
  styleOutputFiles?: string[]
  styleContains?: Array<string | RegExp>
  styleNotContains?: Array<string | RegExp>
  hmrStyleContains?: Array<string | RegExp>
  runtimeLogContains?: Array<string | RegExp>
  runtimeLogNotContains?: Array<string | RegExp>
  renderMode?: AppRenderMode
  harmonyRuntimeTextPairs?: HarmonyRuntimeTextPair[]
  runtime?: AndroidRuntimeStyleExpectation
  logNotContains?: Array<string | RegExp>
}

export function resolveAppHmrSteps(item: AppCase): AppHmrStep[] {
  return item.hmrSteps ?? [{
    name: 'hot-update',
    markerClass: item.hmrMarkerClass,
    markerText: item.hmrMarkerText,
    transformedContains: item.hmrTransformedContains,
    ...(item.hmrMarkerTextClass ? { markerTextClass: item.hmrMarkerTextClass } : {}),
    ...(item.hmrStyleContains ? { styleContains: item.hmrStyleContains } : {}),
  }]
}

export interface WebCase {
  serverIdentityPath?: string
  name: string
  projectDir: string
  launchWithHBuilderX?: boolean
  sourceFile: string
  markerAnchor: string
  markerAnchorCandidates?: string[]
  initialCssPath: string
  hmrCssPath: string
  initialCssContains: Array<string | RegExp>
  initialTextContains?: string[]
  initialRuntimeStyles?: WebRuntimeStyleAssertion[]
  persistentRuntimeStyles?: WebRuntimeStyleAssertion[]
  nativeIdeVersionRequired?: boolean
  serverLogContains?: Array<string | RegExp>
  serverLogNotContains?: Array<string | RegExp>
  hmrSteps: WebHmrStep[]
  workflow: HBuilderXWorkflowCoverage
}

export interface HBuilderXWorkflowCoverage {
  staticTemplateClass: boolean
  dynamicClassBinding: boolean
  userAuthoredStyle: boolean
  thirdPartyOrExternalComponentStyle: boolean
  subpackageStyle: boolean
  webHmr: boolean
}

const uniAppHBuilderXWorkflow = {
  dynamicClassBinding: false,
  staticTemplateClass: true,
  subpackageStyle: true,
  thirdPartyOrExternalComponentStyle: false,
  userAuthoredStyle: false,
  webHmr: true,
} satisfies HBuilderXWorkflowCoverage

const uniAppXHBuilderXWorkflow = {
  dynamicClassBinding: true,
  staticTemplateClass: true,
  subpackageStyle: true,
  thirdPartyOrExternalComponentStyle: true,
  userAuthoredStyle: true,
  webHmr: true,
} satisfies HBuilderXWorkflowCoverage

export interface WebHmrStep {
  reload?: boolean
  markerClass: string
  markerText: string
  cssContains: Array<string | RegExp>
  runtimeStyles?: WebRuntimeStyleAssertion[]
  sourceMutation?: HmrSourceMutation
}

export interface WebRuntimeStyleAssertion {
  selector: string
  classFromText?: boolean
  scopeAttribute?: RegExp
  styles: Record<string, string | RegExp>
}

const issue1021CellRuntimeStyle = {
  selector: '.issue-1021-cell',
  styles: {
    alignItems: 'center',
    borderBottomColor: 'rgb(190, 18, 60)',
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: '56px',
    paddingLeft: '64px',
    paddingRight: '48px',
    paddingTop: '56px',
  },
} satisfies WebRuntimeStyleAssertion

const uniAppHBuilderXMiniProgramPlatforms = [
  'mp-weixin',
  'mp-alipay',
  'mp-baidu',
  'mp-toutiao',
] satisfies MiniProgramPlatform[]

const uniAppXHBuilderXMiniProgramPlatforms = [
  'mp-weixin',
] satisfies MiniProgramPlatform[]

export const uniAppXHBuilderXUnsupportedMiniProgramPlatforms = {
  'mp-alipay': 'HBuilderX stable/alpha 当前拒绝将 uni-app x 项目编译到支付宝小程序。',
  'mp-baidu': 'HBuilderX stable/alpha 当前拒绝将 uni-app x 项目编译到百度小程序。',
  'mp-toutiao': 'HBuilderX stable/alpha 当前拒绝将 uni-app x 项目编译到抖音小程序。',
} as const satisfies Partial<Record<MiniProgramPlatform, string>>

const miniProgramPlatformFiles = {
  'mp-alipay': {
    cssExtensions: ['.acss'],
    outputDir: 'unpackage/dist/dev/mp-alipay',
    requiredFiles: ['app.json', 'pages/index/index.json', 'sub-normal/pages/index.json', 'sub-independent/pages/index.json'],
    templateFiles: {
      main: 'pages/index/index.axml',
      independent: 'sub-independent/pages/index.axml',
      normal: 'sub-normal/pages/index.axml',
    },
  },
  'mp-baidu': {
    cssExtensions: ['.css'],
    outputDir: 'unpackage/dist/dev/mp-baidu',
    requiredFiles: ['app.json', 'pages/index/index.json', 'sub-normal/pages/index.json', 'sub-independent/pages/index.json'],
    templateFiles: {
      main: 'pages/index/index.swan',
      independent: 'sub-independent/pages/index.swan',
      normal: 'sub-normal/pages/index.swan',
    },
  },
  'mp-toutiao': {
    cssExtensions: ['.ttss'],
    outputDir: 'unpackage/dist/dev/mp-toutiao',
    requiredFiles: ['app.json', 'pages/index/index.json', 'sub-normal/pages/index.json', 'sub-independent/pages/index.json'],
    templateFiles: {
      main: 'pages/index/index.ttml',
      independent: 'sub-independent/pages/index.ttml',
      normal: 'sub-normal/pages/index.ttml',
    },
  },
  'mp-weixin': {
    cssExtensions: ['.wxss'],
    outputDir: 'unpackage/dist/dev/mp-weixin',
    requiredFiles: ['app.json', 'pages/index/index.json', 'sub-normal/pages/index.json', 'sub-independent/pages/index.json'],
    templateFiles: {
      main: 'pages/index/index.wxml',
      independent: 'sub-independent/pages/index.wxml',
      normal: 'sub-normal/pages/index.wxml',
    },
  },
} satisfies Record<MiniProgramPlatform, {
  cssExtensions: string[]
  outputDir: string
  requiredFiles: string[]
  templateFiles: {
    main: string
    independent: string
    normal: string
  }
}>

function createMiniProgramOutputDirCandidates(platform: MiniProgramPlatform) {
  return [
    `unpackage/dist/dev/${platform}`,
    `dist/dev/${platform}`,
  ]
}

function withMiniProgramPlatformName(name: string, platform: MiniProgramPlatform) {
  return platform === 'mp-weixin' ? name : `${name} ${platform}`
}

function createUniAppHBuilderXMiniProgramCase(options: {
  name: string
  platform: MiniProgramPlatform
  projectDir: string
  tailwindcss: 'v3' | 'v4'
}): MiniProgramCase {
  const platformFiles = miniProgramPlatformFiles[options.platform]
  const isTailwindV4 = options.tailwindcss === 'v4'
  const tailwindV4CssContains = [
    ...safeMiniProgramGeneratedSelectors,
    '.bg-_b_h123456_B',
    'background-color: #123456',
    '.bg-gradient-to-br',
    /--tw-gradient-position\s*:\s*to bottom right/,
    /background-image\s*:\s*linear-gradient\(var\(--tw-gradient-stops\)\)/,
    /background-image\s*:\s*radial-gradient\(circle at 18% 20%,#e0f2fe,#fdf4ff 70%\)/,
    /padding-top\s*:\s*24rpx/,
    /font-size\s*:\s*26rpx/,
    /border-radius\s*:\s*20rpx/,
    '.bg-_b_h68c828_B',
    '.text-_b100rpx_B',
    '.w-_b323px_B',
    '.h-_b45px_B',
    '.space-y-2>view+view',
    '.space-y-2>text+view',
    ...(options.platform === 'mp-weixin' ? ['.wx_cbg-blue-500'] : []),
    /normal[-_]subpackage/i,
    /independent[-_]subpackage/i,
  ]
  return {
    name: withMiniProgramPlatformName(options.name, options.platform),
    platform: options.platform,
    projectDir: options.projectDir,
    outputDir: platformFiles.outputDir,
    outputDirCandidates: createMiniProgramOutputDirCandidates(options.platform),
    cssExtensions: platformFiles.cssExtensions,
    requiredFiles: platformFiles.requiredFiles,
    cssContains: isTailwindV4
      ? tailwindV4CssContains
      : ['.bg-_b_h123456_B', /background-color:\s*rgba\(18,\s*52,\s*86/, /normal[-_]subpackage/i, /independent[-_]subpackage/i],
    cssNotContains: [rawTailwindDirectiveRE, ...unsafeMiniProgramSelectorFragments],
    outputContains: {
      // 百度和抖音小程序编译器会保留分包但不会输出 uni-app 的 independent 元数据。
      'app.json': [
        '"root": "sub-normal"',
        '"root": "sub-independent"',
        ...(['mp-baidu', 'mp-toutiao'].includes(options.platform) ? [] : ['"independent": true']),
      ],
      [platformFiles.templateFiles.main]: [
        'template-corpus-card',
        'template-corpus-radial',
        'template-corpus-space',
        'template-corpus-apply',
        'template-corpus-hover',
      ],
      [platformFiles.templateFiles.independent]: ['bg-independent-subpackage-marker'],
      [platformFiles.templateFiles.normal]: ['bg-normal-subpackage-marker'],
    },
    workflow: uniAppHBuilderXWorkflow,
  }
}

function createUniAppHBuilderXMiniProgramCases(options: {
  name: string
  projectDir: string
  tailwindcss: 'v3' | 'v4'
}) {
  return uniAppHBuilderXMiniProgramPlatforms.map(platform => createUniAppHBuilderXMiniProgramCase({
    ...options,
    platform,
  }))
}

function createUniAppXHBuilderXMiniProgramCase(options: {
  name: string
  platform: MiniProgramPlatform
  projectDir: string
}): MiniProgramCase {
  const platformFiles = miniProgramPlatformFiles[options.platform]
  const templateExtension = platformFiles.templateFiles.main.split('.').at(-1)!
  const componentOutputBase = 'uni_modules/uview-ultra/components/up-checkbox/up-checkbox'
  const componentStyleFile = `${componentOutputBase}${platformFiles.cssExtensions[0]}`
  return {
    name: withMiniProgramPlatformName(options.name, options.platform),
    platform: options.platform,
    projectDir: options.projectDir,
    outputDir: platformFiles.outputDir,
    outputDirCandidates: createMiniProgramOutputDirCandidates(options.platform),
    cssExtensions: platformFiles.cssExtensions,
    requiredFiles: ['app.json', 'pages/index/index.json', 'sub-normal/pages/index.json', 'sub-independent/pages/index.json'],
    cssContains: [
      ...safeMiniProgramGeneratedSelectors,
      '.bg-_b_h87add3_B',
      '.bg-_b_hd2e252_B',
      '.text-_b93_d54rpx_B',
      '.bg-_b_hf21903_B',
      '.text-_b_hda0e3c_B',
      '.bg-primary',
      /background-color:\s*var\(--theme-color,\s*#0957de\)/i,
      /--theme-color:\s*#16a34a/i,
      '.w-64',
    ],
    cssNotContains: [rawTailwindDirectiveRE, ...unsafeMiniProgramSelectorFragments],
    outputContains: {
      'app.json': ['"root": "sub-normal"', '"root": "sub-independent"', '"independent": true'],
      'components/BindClass.js': ['__scopeId', 'data-v-'],
      [`components/BindClass.${templateExtension}`]: ['issue-822-component-child', /data-v-[\da-f]+/],
      [`${componentOutputBase}.${templateExtension}`]: ['issue-1095-up-checkbox'],
      [componentStyleFile]: [/margin-right:\s*6px/, /color:\s*#fff/],
      [platformFiles.templateFiles.main]: ['issue-902-theme-probe'],
      [platformFiles.templateFiles.independent]: ['bg-independent-subpackage-marker'],
      [platformFiles.templateFiles.normal]: ['bg-normal-subpackage-marker'],
    },
    outputNotContains: {
      [componentStyleFile]: [
        /\$up-checkbox-icon-wrap-margin-right\s*:/,
        /!default/,
        /@apply/,
      ],
    },
    workflow: uniAppXHBuilderXWorkflow,
  }
}

function createUniAppXHBuilderXMiniProgramCases(options: {
  name: string
  projectDir: string
}) {
  return uniAppXHBuilderXMiniProgramPlatforms.map(platform => createUniAppXHBuilderXMiniProgramCase({
    ...options,
    platform,
  }))
}

export const miniProgramCases: MiniProgramCase[] = [
  ...createUniAppHBuilderXMiniProgramCases({
    name: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    projectDir: 'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    tailwindcss: 'v4',
  }),
  ...createUniAppXHBuilderXMiniProgramCases({
    name: 'uni-app-x-vdom-tailwindcss-v4',
    projectDir: 'demo/uni-app-x-vdom-tailwindcss-v4',
  }),
]

const defaultAndroidLaunchArgs = ['--deviceId', process.env['E2E_HBUILDERX_ANDROID_DEVICE_ID'] ?? 'emulator-5554']
const defaultIosLaunchArgs = ['--iosTarget', process.env['E2E_HBUILDERX_IOS_TARGET'] ?? 'simulator']
const harmonyDeviceId = process.env['E2E_HBUILDERX_HARMONY_DEVICE_ID'] ?? process.env['DEMO_VISUAL_HARMONY_DEVICE_ID']
const defaultHarmonyLaunchArgs = harmonyDeviceId ? ['--deviceId', harmonyDeviceId] : []
const harmonyInitialTransformedContains = [
  '"backgroundColor":"#68c828"',
  '"color":"#f7fbff"',
  '"width":173',
]
const harmonyHmrTransformedContains = [
  '"backgroundColor":"#3b0764"',
  '"color":"#fef08a"',
  '"height":41',
  '"marginTop":19',
]
const issue1002AppOutputNotContains = [
  '.tw-root',
  rawTailwindDirectiveRE,
  /@[\w-][^;{}]*\{\s*\}/,
  'calc(infinity',
  /calc\((?:1(?:\.\d+)?\s*\/|8rpx\s*\*)/,
]
const issue1002AppLogNotContains = [
  /unsupported utility:\s*tw-root/i,
  /calc\(infinity\s*\*\s*1px\)/i,
  /property value `calc\((?:1(?:\.\d+)?\s*\/|8rpx\s*\*)/i,
  /not supported for `border-(?:bottom|top)-(?:left|right)-radius`/i,
]
const iconifyNativeLogNotContains = [
  /property value [`']?1em[`']? (?:is )?not supported for [`']?(?:width|height)/i,
  /property value [`']?currentColor[`']? (?:is )?(?:invalid|not supported) for [`']?background-color/i,
  /(?:-webkit-)?mask-(?:image|repeat|size).*not supported/i,
]
const nativeScopedAuthorLogNotContains = [
  /property value [`']?\s*[`']? (?:is )?(?:invalid|not supported) for [`']?-webkit-transform/i,
  /transition-property.*(?:invalid|not supported)/i,
  /(?:selector|pseudo).*(?::is|:deep).*(?:invalid|not supported|parse)/i,
  /(?:@apply|@theme|@source).*(?:invalid|not supported|unknown)/i,
  /empty at-rule/i,
]
const issue1002HarmonyStyleNotContains = issue1002AppOutputNotContains
function createUniAppAppCases(options: {
  name: string
  projectDir: string
  sourceFile: string
  markerAnchor: string
  markerAnchorCandidates?: string[]
  version: 'v3' | 'v4'
  outputDir?: string
  outputDirCandidates?: string[]
  requiredFiles?: string[]
  transformedFiles?: string[]
  transformedOutputFiles?: string[]
  launchEnv?: Record<string, string>
  styleOutputFiles?: string[]
  styleContains?: Array<string | RegExp>
  hmrStyleContains?: Array<string | RegExp>
}) {
  const {
    name,
    projectDir,
    sourceFile,
    markerAnchor,
    markerAnchorCandidates,
    version,
    outputDir = 'dist/dev/app',
    outputDirCandidates,
    requiredFiles = ['manifest.json', 'app-service.js', 'app.css'],
    transformedFiles = [`${outputDir}/app-service.js`, `${outputDir}/app.css`],
    transformedOutputFiles,
    launchEnv,
    styleOutputFiles = ['app.css'],
    styleContains: extraStyleContains = [],
    hmrStyleContains: extraHmrStyleContains = [],
  } = options
  const markerClass = 'bg-[#102938] text-[#f7fbff] w-[173px]'
  const hmrMarkerClass = 'bg-[#3b0764] text-[#fef08a] h-[41px] mt-[19px]'
  const transformedClassNames = ['bg-_b_h102938_B', 'text-_b_hf7fbff_B', 'w-_b173px_B']
  const hmrTransformedClassNames = ['bg-_b_h3b0764_B', 'text-_b_hfef08a_B', 'h-_b41px_B', 'mt-_b19px_B']
  const styleContains = ['.bg-_b_h102938_B', '.text-_b_hf7fbff_B', '.w-_b173px_B', ...extraStyleContains]
  const hmrStyleContains = ['.bg-_b_h3b0764_B', '.text-_b_hfef08a_B', '.h-_b41px_B', '.mt-_b19px_B', ...extraHmrStyleContains]

  function createOutputDirCandidates(platform: AppPlatform) {
    const defaults = [
      outputDir,
      'dist/dev/app',
      'dist/dev/app-plus',
      `dist/dev/${platform}`,
      'unpackage/dist/dev/app',
      'unpackage/dist/dev/app-plus',
      `unpackage/dist/dev/${platform}`,
    ]
    return [...new Set(outputDirCandidates ?? defaults)]
  }

  function createCase(platform: AppPlatform, platformName: 'android' | 'ios'): AppCase {
    return {
      name: `${name} ${platformName}`,
      platform,
      updateMode: 'native-reload',
      projectDir,
      outputDir,
      outputDirCandidates: createOutputDirCandidates(platform),
      sourceFile,
      markerAnchor,
      markerAnchorCandidates,
      markerClass,
      markerText: `hbuilderx-app-dynamic-${version}-${platformName}`,
      hmrMarkerClass,
      hmrMarkerText: `hbuilderx-app-hmr-${version}-${platformName}`,
      launchArgs: platform === 'app-android' ? defaultAndroidLaunchArgs : defaultIosLaunchArgs,
      launchEnv,
      requiredFiles,
      transformedFiles,
      transformedOutputFiles,
      transformedContains: [...transformedClassNames, `hbuilderx-app-dynamic-${version}-${platformName}`],
      hmrTransformedContains: [...hmrTransformedClassNames, `hbuilderx-app-hmr-${version}-${platformName}`],
      styleOutputFiles,
      styleContains,
      hmrStyleContains,
    }
  }

  return [
    createCase('app-android', 'android'),
    createCase('app-ios', 'ios'),
  ] satisfies AppCase[]
}

export const uniAppAppCases: AppCase[] = [
  ...createUniAppAppCases({
    name: 'uni-app-vite-tailwindcss-v4',
    projectDir: 'demo/uni-app-vite-tailwindcss-v4',
    sourceFile: 'src/pages/index/index.vue',
    markerAnchor: '<view class="special-class-visual-probe',
    version: 'v4',
    launchEnv: {
      UNI_INPUT_DIR: 'src',
    },
    transformedFiles: [],
    transformedOutputFiles: ['app-service.js', 'app.css'],
    styleOutputFiles: ['app.css', 'pages/index/index.css'],
    styleContains: [
      '.bg-white_f70',
      /background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.7\)/,
      '.text-_b45rpx_B',
      '.dark_cbg-red-300',
      '.bg-_bradial-gradient_pcircle_at_18_v_20_v_m_he0f2fe_m_hfdf4ff_70_v_P_B',
      /background-image:\s*radial-gradient\(circle at 18% 20%,#e0f2fe,#fdf4ff 70%\)/,
      '.css-variable-visual-probe',
      '--visual-probe-bg: rgb(16, 185, 129)',
      'background-color: var(--visual-probe-bg)',
      'font-size: var(--visual-probe-size)',
    ],
    hmrStyleContains: [
      '.bg-white_f70',
      '.text-_b45rpx_B',
      '.dark_cbg-red-300',
      '.css-variable-visual-probe',
    ],
  }),
  ...createUniAppAppCases({
    name: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    projectDir: 'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    sourceFile: 'pages/index/index.vue',
    markerAnchor: '<view class="text-[#888800]">',
    markerAnchorCandidates: [
      '<view class="text-[#888800]">',
      '<view class="text-[red]">',
    ],
    version: 'v4',
    outputDir: 'unpackage/dist/dev/app',
    transformedFiles: [],
    transformedOutputFiles: ['app-service.js', 'app.css'],
  }),
]

export const uniAppXAppCases: AppCase[] = [
  {
    name: 'uni-app-x-vdom-tailwindcss-v4 android',
    platform: 'app-android',
    projectDir: 'demo/uni-app-x-vdom-tailwindcss-v4',
    outputDir: '.debug/bundle-post/asset',
    outputDirCandidates: [
      '.debug/bundle-post/asset',
      'unpackage/dist/dev/.tsc/app-android',
      'unpackage/dist/dev/.uvue/app-android',
      'unpackage/dist/dev/app-android',
    ],
    sourceFile: 'components/BindClass.uvue',
    markerAnchor: '<text :class="flag',
    markerClass: 'flex h-[41px] w-[173px] items-center justify-center rounded-[9998px] bg-[#102938]',
    markerTextClass: 'text-[39rpx] text-[#f7fbff]',
    markerText: 'hbuilderx-app-dynamic-v4-android',
    runtime: {
      backgroundColor: '#102938',
      height: 41,
      markerText: 'hbuilderx-app-dynamic-v4-android',
      textColor: '#f7fbff',
      width: 173,
    },
    hmrMarkerClass: 'mt-[19px] flex h-[41px] w-[173px] items-center justify-center rounded-[9997px] bg-[#3b0764] [transform:translate(10px,20px)]',
    hmrMarkerTextClass: 'text-[28rpx] text-blue-600 text-bule-600',
    hmrMarkerText: 'hbuilderx-app-hmr-v4-android',
    launchArgs: defaultAndroidLaunchArgs,
    requiredFiles: [
      'App.uvue.ts',
      'components/BindClass.uvue.ts',
      'pages/index/index.uvue.ts',
    ],
    transformedOutputFiles: [
      'App.uvue.ts',
      'components/BindClass.uvue.ts',
      'pages/index/index.uvue.ts',
    ],
    hmrTransformedOutputFiles: ['components/BindClass.uvue.ts'],
    transformedContains: ['hbuilderx-app-dynamic-v4-android'],
    compiledStyleContains: [
      'issue 822 component child',
      /\["issue-822-component-child",\s*_pS\(_uM\(\[\["borderTopWidth",\s*2\]/,
      /\["borderTopStyle",\s*"solid"\]/,
      /\["borderTopColor",\s*"#7c3aed"\]/,
      '["--theme-color", "#16a34a"]',
      '["backgroundColor", "var(--theme-color)"]',
      /\["wtu-[^"]+", _pS\(_uM\(\[\["width", "100%"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["height", 200\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["backgroundColor", "#87add3"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["color", "#111111"\]/,
      'issue-1002 text-xs',
      /\["wtu-[^"]+", _pS\(_uM\(\[\["fontSize", "24rpx"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["fontSize", "28rpx"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["fontSize", "32rpx"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["fontSize", "40rpx"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["color", "#ffffff"\]/,
      /\["wtu-[^"]+", _pS\(_uM\(\[\["borderTopLeftRadius", 9999\]/,
      '["issue-1002-apply", _pS(_uM([["borderTopLeftRadius", 9999]',
      '["lineHeight", 1.33333]',
    ],
    transformedNotContains: [
      ...issue1002AppOutputNotContains,
      /class: "[^"]*\btext-xs\b/,
      /class: "[^"]*\btext-white\b/,
      /class: "[^"]*\brounded-full\b/,
    ],
    hmrTransformedContains: [
      'hbuilderx-app-hmr-v4-android',
      /\["backgroundColor", "#3b0764"\]/,
      /\["color", "rgb\(21,93,252\)"\]/,
      /\["fontSize", "28rpx"\]/,
      /\["height", 41\]/,
      /\["marginTop", 19\]/,
      /\["transform", "translate\(10px 20px\)"\]/,
    ],
    hmrSteps: [
      {
        name: 'append-mt-200-to-existing-node',
        markerClass: 'mt-200 flex h-[41px] w-[173px] items-center justify-center rounded-[9998px] bg-[#102938]',
        markerTextClass: 'text-[39rpx] text-[#f7fbff]',
        markerText: 'hbuilderx-app-hmr-v4-android-mt-200',
        sourceMutation: {
          expectOutputRefresh: false,
          file: 'main.css',
          touch: true,
        },
        runtime: {
          backgroundColor: '#102938',
          height: 41,
          markerText: 'hbuilderx-app-hmr-v4-android-mt-200',
          textColor: '#f7fbff',
          width: 173,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android-mt-200',
          /\["backgroundColor", "#102938"\]/,
          /\["marginTop", "1600rpx"\]/,
        ],
      },
      {
        name: 'new-named-and-invalid-class',
        markerClass: 'mt-200 flex h-[41px] w-[173px] items-center justify-center rounded-[9997px] bg-issue-1021-hmr [transform:translate(10px,20px)]',
        markerTextClass: 'text-[28rpx] text-blue-600 text-bule-600',
        markerText: 'hbuilderx-app-hmr-v4-android',
        sourceMutation: {
          append: '@theme static { --color-issue-1021-hmr: #3b0764; }',
          file: 'main.css',
        },
        runtime: {
          backgroundColor: '#3b0764',
          height: 41,
          markerText: 'hbuilderx-app-hmr-v4-android',
          width: 173,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android',
          'text-bule-600',
          /\["backgroundColor", "#3b0764"\]/,
          /\["color", "rgb\(21,93,252\)"\]/,
          /\["fontSize", "28rpx"\]/,
          /\["height", 41\]/,
          /\["marginTop", "1600rpx"\]/,
          /\["transform", "translate\(10px 20px\)"\]/,
        ],
        transformedNotContains: [
          /\["text-bule-600",\s*_pS/,
        ],
      },
      {
        name: 'replace-with-new-arbitrary-classes',
        markerClass: 'mt-[23px] flex h-[47px] w-[181px] items-center justify-center rounded-[7777px] bg-[#0f766e]',
        markerTextClass: 'text-[31rpx] text-[#facc15]',
        markerText: 'hbuilderx-app-hmr-v4-android-round-2',
        runtime: {
          backgroundColor: '#0f766e',
          height: 47,
          markerText: 'hbuilderx-app-hmr-v4-android-round-2',
          textColor: '#facc15',
          width: 181,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android-round-2',
          /\["backgroundColor", "#0f766e"\]/,
          /\["color", "#facc15"\]/,
          /\["fontSize", "31rpx"\]/,
          /\["height", 47\]/,
          /\["marginTop", 23\]/,
          /\["width", 181\]/,
        ],
        transformedNotContains: [
          'hbuilderx-app-hmr-v4-android"',
          'text-bule-600',
          /\["backgroundColor", "#3b0764"\]/,
          /\["color", "rgb\(21,93,252\)"\]/,
          /\["transform", "translate\(10px 20px\)"\]/,
        ],
      },
      {
        name: 'arbitrary-background-and-color-opacity',
        markerClass: 'mt-[17px] flex h-[43px] w-[179px] items-center justify-center rounded-[6888px] bg-[#123456]',
        markerTextClass: 'text-[30rpx] text-blue-600/50',
        markerText: 'hbuilderx-app-hmr-v4-android-color-opacity',
        runtime: {
          backgroundColor: '#123456',
          height: 43,
          markerText: 'hbuilderx-app-hmr-v4-android-color-opacity',
          width: 179,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android-color-opacity',
          /\["backgroundColor", "#123456"\]/,
          /\["color", "rgba\(21,\s*93,\s*252,\s*0\.5\)"\]/,
          /\["fontSize", "30rpx"\]/,
          /\["height", 43\]/,
          /\["marginTop", 17\]/,
          /\["width", 179\]/,
        ],
        transformedNotContains: [
          'hbuilderx-app-hmr-v4-android-round-2',
          /\["backgroundColor", "#0f766e"\]/,
          /\["color", "#facc15"\]/,
          /\["fontSize", "31rpx"\]/,
          /\["height", 47\]/,
          /\["marginTop", 23\]/,
          /\["width", 181\]/,
        ],
      },
      {
        name: 'delete-new-classes',
        markerClass: 'flex h-[41px] w-[173px] items-center justify-center rounded-[9998px] bg-[#102938]',
        markerTextClass: 'text-[39rpx] text-[#f7fbff]',
        markerText: 'hbuilderx-app-hmr-v4-android-deleted',
        runtime: {
          backgroundColor: '#102938',
          height: 41,
          markerText: 'hbuilderx-app-hmr-v4-android-deleted',
          textColor: '#f7fbff',
          width: 173,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android-deleted',
          /\["backgroundColor", "#102938"\]/,
          /\["color", "#f7fbff"\]/,
          /\["fontSize", "39rpx"\]/,
          /\["height", 41\]/,
          /\["width", 173\]/,
        ],
        transformedNotContains: [
          'hbuilderx-app-hmr-v4-android-color-opacity',
          /\["backgroundColor", "#0f766e"\]/,
          /\["color", "#facc15"\]/,
          /\["color", "rgba\(21,\s*93,\s*252,\s*0\.5\)"\]/,
          /\["fontSize", "30rpx"\]/,
          /\["fontSize", "31rpx"\]/,
          /\["height", 43\]/,
          /\["height", 47\]/,
          /\["marginTop", 17\]/,
          /\["marginTop", 23\]/,
          /\["width", 179\]/,
          /\["width", 181\]/,
        ],
      },
      {
        name: 'rollback-to-first-new-classes',
        markerClass: 'mt-200 flex h-[41px] w-[173px] items-center justify-center rounded-[9997px] bg-[#3b0764] [transform:translate(10px,20px)]',
        markerTextClass: 'text-[28rpx] text-blue-600 text-bule-600',
        markerText: 'hbuilderx-app-hmr-v4-android-rollback',
        runtime: {
          backgroundColor: '#3b0764',
          height: 41,
          markerText: 'hbuilderx-app-hmr-v4-android-rollback',
          width: 173,
        },
        transformedContains: [
          'hbuilderx-app-hmr-v4-android-rollback',
          'text-bule-600',
          /\["backgroundColor", "#3b0764"\]/,
          /\["color", "rgb\(21,93,252\)"\]/,
          /\["fontSize", "28rpx"\]/,
          /\["height", 41\]/,
          /\["marginTop", "1600rpx"\]/,
          /\["transform", "translate\(10px 20px\)"\]/,
        ],
        transformedNotContains: [
          'hbuilderx-app-hmr-v4-android-deleted',
          /\["text-bule-600",\s*_pS/,
          /\["color", "rgba\(21,\s*93,\s*252,\s*0\.5\)"\]/,
          /\["backgroundColor", "#0f766e"\]/,
          /\["color", "#facc15"\]/,
          /\["fontSize", "31rpx"\]/,
          /\["height", 47\]/,
          /\["marginTop", 23\]/,
          /\["width", 181\]/,
        ],
      },
    ],
    runtimeLogContains: ['App Launch'],
    logNotContains: [
      ...issue1002AppLogNotContains,
      ...iconifyNativeLogNotContains,
      ...nativeScopedAuthorLogNotContains,
      /Cannot read properties of null \(reading ['"]replace['"]\)/i,
      /property value .*translate.*not supported for .*transform/i,
    ],
  },
  {
    name: 'uni-app-x-vdom-tailwindcss-v4 ios',
    platform: 'app-ios',
    projectDir: 'demo/uni-app-x-vdom-tailwindcss-v4',
    outputDir: '.debug/bundle-post/chunk',
    outputDirCandidates: [
      '.debug/bundle-post/chunk',
      'unpackage/dist/dev/app-ios',
    ],
    sourceFile: 'components/BindClass.uvue',
    markerAnchor: '<text :class="flag',
    markerClass: 'flex h-[41px] w-[173px] items-center justify-center rounded-full bg-[#102938]',
    markerTextClass: 'text-xl text-white',
    markerText: 'hbuilderx-app-dynamic-v4-ios',
    hmrMarkerClass: 'mt-[19px] flex h-[41px] w-[173px] items-center justify-center rounded-full bg-[#3b0764]',
    hmrMarkerTextClass: 'text-sm text-white',
    hmrMarkerText: 'hbuilderx-app-hmr-v4-ios',
    launchArgs: defaultIosLaunchArgs,
    requiredFiles: [
      'app-service.js',
    ],
    transformedOutputFiles: [
      'app-service.js',
    ],
    transformedContains: [
      'bg-_b_h102938_B',
      'text-_b_hf7fbff_B',
      'w-_b173px_B',
      'hbuilderx-app-dynamic-v4-ios',
      /"issue-822-component-child"\s*:\s*\{\s*""\s*:\s*\{\s*"borderTopWidth"\s*:\s*2/,
      /"borderTopColor"\s*:\s*"#7c3aed"/,
      /--theme-color["']?\s*[:,]\s*["']?#16a34a/i,
      /backgroundColor["']?\s*[:,]\s*["']var\(--theme-color\)/i,
      'issue 822 component child',
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"width"\s*:\s*"100%"/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"height"\s*:\s*200/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"backgroundColor"\s*:\s*"#87add3"/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"color"\s*:\s*"#111111"/,
    ],
    transformedNotContains: issue1002AppOutputNotContains,
    hmrTransformedContains: [
      'hbuilderx-app-hmr-v4-ios',
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"marginTop"\s*:\s*19/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"height"\s*:\s*41/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"backgroundColor"\s*:\s*"#3b0764"/,
      /"wtu-[^"]+"\s*:\s*\{\s*""\s*:\s*\{\s*"color"\s*:\s*"#ffffff"/,
    ],
    runtimeLogContains: ['App Launch'],
    logNotContains: [...issue1002AppLogNotContains, ...iconifyNativeLogNotContains, ...nativeScopedAuthorLogNotContains],
  },
  {
    name: 'uni-app-x-vdom-tailwindcss-v4 harmony',
    renderMode: 'vdom',
    platform: 'app-harmony',
    projectDir: 'demo/uni-app-x-vdom-tailwindcss-v4',
    outputDir: 'unpackage/dist/dev/.app-harmony',
    outputDirCandidates: [
      'unpackage/dist/dev/.app-harmony',
      'unpackage/dist/dev/app-harmony',
      'unpackage/cache/.app-harmony/sourcemap',
    ],
    sourceFile: 'pages/index/index.uvue',
    markerAnchor: '<Issue1019Button>',
    markerClass: 'flex h-[41px] w-[173px] items-center justify-center rounded-full bg-[#68c828]',
    markerTextClass: 'text-xl text-white text-[#f7fbff]',
    markerText: 'hbuilderx-app-dynamic-v4-harmony',
    hmrMarkerClass: 'mt-[19px] flex h-[41px] w-[173px] items-center justify-center rounded-full bg-[#3b0764]',
    hmrMarkerTextClass: 'text-sm text-white text-[#fef08a]',
    hmrMarkerText: 'hbuilderx-app-hmr-v4-harmony',
    launchArgs: defaultHarmonyLaunchArgs,
    requiredFiles: [
      'manifest.json',
      'app-service.js',
      'assets/components/BindClass.js',
      'assets/pages/index/index.js',
    ],
    transformedFiles: [
      'unpackage/dist/dev/.app-harmony/app-service.js',
      'unpackage/dist/dev/.app-harmony/assets/App.js',
      'unpackage/dist/dev/.app-harmony/assets/pages/index/index.js',
    ],
    transformedOutputFiles: [
      'assets/components/BindClass.js',
    ],
    transformedContains: [
      ...harmonyInitialTransformedContains,
      'hbuilderx-app-dynamic-v4-harmony',
      'issue-1125-tailwind',
      /"issue-822-component-child"\s*:\s*\{\s*""\s*:\s*\{\s*"borderTopWidth"\s*:\s*2/,
      /"borderTopStyle"\s*:\s*"solid"/,
      /"borderTopColor"\s*:\s*"#7c3aed"/,
      /--theme-color["']?\s*[:,]\s*["']?#16a34a/i,
      /backgroundColor["']?\s*[:,]\s*["']var\(--theme-color\)/i,
    ],
    compiledStyleContains: [
      /"issue-1002-apply":\{"":\{[^}]*"borderRadius":9999/,
      /"wtu-[^"]+":\{"":\{[^}]*"borderRadius":9999/,
      /"fontSize":"24rpx"/,
      /"fontSize":"28rpx"/,
      /"fontSize":"32rpx"/,
      /"fontSize":"40rpx"/,
      /"color":"#fff(?:fff)?"/,
      /"wtu-[^"]+":\{"":\{[^}]*"--tw-leading":"26px"[^}]*"lineHeight":"26px"[^}]*"-TwLeading":26/,
      /"lineHeight":"52rpx"/,
      /"lineHeight":"1\.625"/,
      /"lineHeight":"1\.42857"/,
      /"width":220/,
      /"issue-1125-local-merge":\{"":\{[^}]*"paddingLeft":3/,
    ],
    transformedNotContains: [
      ...issue1002HarmonyStyleNotContains,
      'leading-[26px]',
      'leading-[52rpx]',
      'leading-[1.625]',
    ],
    hmrTransformedContains: [
      ...harmonyHmrTransformedContains,
      'hbuilderx-app-hmr-v4-harmony',
      /"lineHeight":"26px"/,
      /"lineHeight":"52rpx"/,
      /"lineHeight":"1\.625"/,
    ],
    harmonyRuntimeTextPairs: [{
      tailwindText: 'issue-1125 Tailwind line 1 issue-1125 Tailwind line 2',
      nativeText: 'issue-1125 native line 1 issue-1125 native line 2',
      tailwindLayoutNodeIndex: 18,
      nativeLayoutNodeIndex: 19,
    }],
    runtimeLogContains: ['App Launch'],
    logNotContains: [...issue1002AppLogNotContains, ...iconifyNativeLogNotContains, ...nativeScopedAuthorLogNotContains],
  },
  {
    name: 'uni-app-x-vapor-tailwindcss-v4 harmony vapor',
    renderMode: 'vapor',
    platform: 'app-harmony',
    projectDir: 'demo/uni-app-x-vapor-tailwindcss-v4',
    outputDir: 'unpackage/dist/dev/.app-harmony',
    outputDirCandidates: [
      'unpackage/dist/dev/.app-harmony',
      'unpackage/dist/dev/app-harmony',
    ],
    sourceFile: 'pages/index/index.uvue',
    markerAnchor: '<view class="issue-1125-vapor-probe',
    markerClass: 'hbuilderx-app-native-hmr-probe flex h-[41px] w-[173px] items-center justify-center bg-[#0e7490]',
    markerTextClass: 'text-[18px] leading-[26px] text-white',
    markerText: 'issue-1125-vapor-leading-26px',
    hmrMarkerClass: 'hbuilderx-app-native-hmr-probe mt-[19px] flex h-[41px] w-[173px] items-center justify-center bg-[#164e63]',
    hmrMarkerTextClass: 'text-[18px] leading-[26px] text-white',
    hmrMarkerText: 'issue-1125-vapor-hmr-leading-26px',
    launchArgs: defaultHarmonyLaunchArgs,
    launchEnv: {
      UNI_APP_X_DOM2: 'true',
    },
    requiredFiles: [
      'manifest.json',
      'app-service.js',
      'App.uvue',
      'assets/pages/index/index.js',
      'bytes/GenPagesIndexIndexSharedData.bytes',
      'bytes/GenPagesIndexIndexSharedData.style.bytes',
    ],
    transformedFiles: [
      'unpackage/dist/dev/.app-harmony/App.uvue',
    ],
    transformedOutputFiles: [
      'assets/pages/index/index.js',
      'bytes/GenPagesIndexIndexSharedData.bytes',
    ],
    transformedContains: [
      'issue-1125-vapor-leading-26px',
      /\.leading-_b26px_B\s*\{[\s\S]*?--tw-leading:\s*26px;[\s\S]*?line-height:\s*26px;/,
      /--tw-leading:\s*52rpx;[\s\S]*?line-height:\s*52rpx;/,
      /--tw-leading:\s*1\.625;[\s\S]*?line-height:\s*1\.625;/,
      /width:\s*220px/,
    ],
    transformedNotContains: [
      'leading-[26px]',
      'leading-[52rpx]',
      'leading-[1.625]',
    ],
    styleOutputFiles: [
      'bytes/GenPagesIndexIndexSharedData.style.bytes',
    ],
    styleContains: [
      'wtu-',
      '--tw-leading',
      '26px',
      '52rpx',
      '1.625',
      'issue-1125-local-merge',
    ],
    styleNotContains: [
      'leading-[26px]',
      'leading-[52rpx]',
      'leading-[1.625]',
    ],
    hmrTransformedContains: [
      'issue-1125-vapor-hmr-leading-26px',
      'wtu-',
      /line-height:\s*26px/,
      /line-height:\s*52rpx/,
      /line-height:\s*1\.625/,
    ],
    hmrStyleContains: ['--tw-leading', '26px', '52rpx', '1.625', 'issue-1125-local-merge'],
    harmonyRuntimeTextPairs: [{
      tailwindText: 'issue-1125 Vapor Tailwind line 1 issue-1125 Vapor Tailwind line 2',
      nativeText: 'issue-1125 Vapor native line 1 issue-1125 Vapor native line 2',
      tailwindLayoutNodeIndex: 18,
      nativeLayoutNodeIndex: 19,
    }],
    runtimeLogContains: ['App Launch'],
    logNotContains: [...issue1002AppLogNotContains, ...iconifyNativeLogNotContains, ...nativeScopedAuthorLogNotContains],
  },
]

export const webCases: WebCase[] = [
  {
    name: 'issue-1144-uni-app-x-web',
    serverIdentityPath: '/__issue1144_identity',
    projectDir: 'demo/issue-1144-uni-app-x-web',
    launchWithHBuilderX: true,
    sourceFile: 'pages/index/index.uvue',
    markerAnchor: '<text class="text-content text-2xl font-bold text-white/70 text-blue-300/35">',
    initialCssPath: '/main.css?direct',
    hmrCssPath: '/main.css?direct',
    initialCssContains: [
      'weapp-tailwindcss uni-app-x web preflight reset',
      'uni-app uni-view',
      /\.bg-page\s*\{/,
    ],
    initialTextContains: ['全端主题'],
    initialRuntimeStyles: issue1144InitialStyles,
    persistentRuntimeStyles: [{
      selector: '.issue-1144-important-probe',
      styles: { marginTop: '24px' },
    }],
    nativeIdeVersionRequired: true,
    serverLogContains: [
      /(?:编译器版本：|Compiler version: )5\.\d+\s*[（(]uni-app x[）)]\s*VDOM模式/,
    ],
    serverLogNotContains: ['Unknown word', '[plugin:vite:css]', 'reading \'scoped\''],
    hmrSteps: issue1144Steps(),
    workflow: uniAppXHBuilderXWorkflow,
  },
  {
    name: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    projectDir: 'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    sourceFile: 'pages/index/index.vue',
    markerAnchor: '<view class="text-[#888800]">',
    markerAnchorCandidates: [
      '<view class="text-[#888800]">',
      '<view class="text-[red]">',
    ],
    initialCssPath: '/main.css?direct',
    hmrCssPath: '/main.css?direct',
    initialCssContains: [/background-color:\s*#123456/],
    workflow: uniAppHBuilderXWorkflow,
    hmrSteps: [
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#0f5132] text-[#f8fafc] w-[188px]',
        markerText: 'hbuilderx-web-hmr-v4-step-1',
        cssContains: [/background-color:\s*#0f5132/, /color:\s*#f8fafc/, /width:\s*188px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(15, 81, 50)', color: 'rgb(248, 250, 252)', width: '188px' },
        }],
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#7c2d12] text-[#ecfeff] h-[37px] mt-[11px]',
        markerText: 'hbuilderx-web-hmr-v4-step-2',
        cssContains: [/background-color:\s*#7c2d12/, /color:\s*#ecfeff/, /height:\s*37px/, /margin-top:\s*11px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(124, 45, 18)', color: 'rgb(236, 254, 255)', height: '37px', marginTop: '11px' },
        }],
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#4338ca] text-[#fef3c7] w-[221px] rounded-[13px]',
        markerText: 'hbuilderx-web-hmr-v4-step-3',
        cssContains: [/background-color:\s*#4338ca/, /color:\s*#fef3c7/, /width:\s*221px/, /border-radius:\s*13px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(67, 56, 202)', borderRadius: '13px', color: 'rgb(254, 243, 199)', width: '221px' },
        }],
      },
    ],
  },
  {
    name: 'uni-app-x-vdom-tailwindcss-v4',
    projectDir: 'demo/uni-app-x-vdom-tailwindcss-v4',
    sourceFile: 'pages/index/index.uvue',
    markerAnchor: '<BindClass />',
    initialCssPath: '/main.css?direct',
    hmrCssPath: '/main.css?direct',
    initialCssContains: [
      '--text-xl',
      '--color-white',
      /background-color:\s*#f21903/,
      /\.bg-primary\s*\{[^}]*background-color:\s*var\(--theme-color,\s*#0957de\)/i,
      'weapp-tailwindcss uni-app-x web preflight reset',
      'uni-app uni-view',
    ],
    initialRuntimeStyles: [
      {
        selector: 'uni-app uni-view',
        styles: {
          borderBottomWidth: '0px',
          borderLeftWidth: '0px',
          borderRightWidth: '0px',
          borderTopWidth: '0px',
        },
      },
      {
        selector: '.issue-902-theme-probe',
        styles: {
          backgroundColor: 'rgb(22, 163, 74)',
        },
      },
      {
        selector: '.issue-1091-probe',
        styles: {
          backgroundColor: 'rgb(52, 152, 219)',
        },
      },
      {
        selector: '.issue-navbar-left',
        styles: {
          backgroundColor: 'rgb(9, 87, 222)',
          height: '50px',
          paddingLeft: '15px',
          paddingRight: '15px',
          width: '50px',
        },
      },
      {
        selector: '.issue-navbar-right',
        styles: {
          backgroundColor: 'rgb(16, 41, 56)',
          height: '50px',
          paddingBottom: '6px',
          paddingLeft: '6px',
          paddingRight: '6px',
          paddingTop: '6px',
          width: '50px',
        },
      },
      {
        selector: '.issue-navbar-image',
        styles: {
          borderRadius: '5px',
          height: '50px',
          width: '50px',
        },
      },
      {
        selector: '.issue-822-component-child',
        styles: {
          borderTopColor: 'rgb(124, 58, 237)',
          borderTopStyle: 'solid',
          borderTopWidth: '2px',
        },
      },
      {
        selector: '.issue-1019-up-button',
        scopeAttribute: /^data-v-[\da-f]+$/,
        styles: {
          alignItems: 'center',
          backgroundColor: 'rgb(9, 87, 222)',
          borderBottomColor: 'rgb(7, 59, 154)',
          borderBottomStyle: 'solid',
          borderBottomWidth: '2px',
          borderRadius: '9px',
          color: 'rgb(255, 255, 255)',
          display: 'flex',
          height: '44px',
          justifyContent: 'center',
          transform: 'matrix(1, 0, 0, 1, 0, 0)',
          transitionProperty: 'transform, opacity',
          width: '184px',
        },
      },
      {
        selector: '.issue-1019-up-button .up-button__text',
        scopeAttribute: /^data-v-[\da-f]+$/,
        styles: {
          color: 'rgb(255, 255, 255)',
          fontSize: '16px',
        },
      },
      {
        selector: '.issue-1019-style-key',
        scopeAttribute: /^data-v-[\da-f]+$/,
        styles: {
          borderBottomColor: 'rgb(190, 18, 60)',
          borderBottomStyle: 'solid',
          borderBottomWidth: '2px',
          height: '4px',
          marginTop: '8px',
          transform: 'matrix(1, 0, 0, 0.5, 0, 0)',
          width: '184px',
        },
      },
      issue1021CellRuntimeStyle,
      {
        selector: '.issue-1019-z-paging',
        scopeAttribute: /^data-v-[\da-f]+$/,
        styles: {
          borderTopColor: 'rgb(14, 116, 144)',
          minHeight: '48px',
          transform: 'matrix(1, 0, 0, 1, 0, 0)',
          transitionProperty: 'transform, opacity',
          width: '184px',
        },
      },
      {
        selector: '.issue-1019-z-paging .z-paging__content',
        styles: {
          backgroundColor: 'rgb(236, 254, 255)',
          color: 'rgb(22, 78, 99)',
        },
      },
    ],
    persistentRuntimeStyles: [issue1021CellRuntimeStyle],
    workflow: uniAppXHBuilderXWorkflow,
    hmrSteps: [
      {
        markerClass: 'hbuilderx-web-hmr-probe mt-200 bg-[#102938] text-[#f7fbff] w-[173px]',
        markerText: 'hbuilderx-web-hmr-v4-mt-200',
        cssContains: [/margin-top:\s*(?:calc\((?:0\.25rem|var\(--spacing\))\s*\*\s*200\)|800px)/, /background-color:\s*#102938/, /width:\s*173px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(16, 41, 56)', color: 'rgb(247, 251, 255)', marginTop: '800px', width: '173px' },
        }],
        sourceMutation: {
          file: 'pages/index/index.uvue',
          replace: {
            from: '@reference "../../main.css";',
            to: '@import "../../main.css";',
          },
        },
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe mt-200 bg-issue-1021-hmr text-[#f8fafc] w-[188px]',
        markerText: 'hbuilderx-web-hmr-v4-step-1',
        cssContains: [/\.bg-issue-1021-hmr\s*\{/, /color:\s*#f8fafc/, /width:\s*188px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(15, 81, 50)', color: 'rgb(248, 250, 252)', marginTop: '800px', width: '188px' },
        }],
        sourceMutation: {
          append: '@theme static { --color-issue-1021-hmr: #0f5132; }',
          cssContains: ['--color-issue-1021-hmr: #0f5132'],
          file: 'main.css',
        },
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#7c2d12] text-[#ecfeff] h-[37px] mt-[11px]',
        markerText: 'hbuilderx-web-hmr-v4-step-2',
        cssContains: [/background-color:\s*#7c2d12/, /color:\s*#ecfeff/, /height:\s*37px/, /margin-top:\s*11px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(124, 45, 18)', color: 'rgb(236, 254, 255)', height: '37px', marginTop: '11px' },
        }],
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#4338ca] text-[#fef3c7] w-[221px] rounded-[13px]',
        markerText: 'hbuilderx-web-hmr-v4-step-3',
        cssContains: [/background-color:\s*#4338ca/, /color:\s*#fef3c7/, /width:\s*221px/, /border-radius:\s*13px/],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(67, 56, 202)', borderRadius: '13px', color: 'rgb(254, 243, 199)', width: '221px' },
        }],
      },
      {
        markerClass: 'hbuilderx-web-hmr-probe bg-[#0e7490] mt-[10rpx] text-xs',
        markerText: 'hbuilderx-web-hmr-v4-rem-rpx',
        cssContains: [
          /background-color:\s*#0e7490/,
          /\.mt-(?:_b10rpx_B|\\\[10rpx\\\])\s*\{[\s\S]*margin-top:\s*0\.3125rem/,
          /\.text-xs\s*\{[\s\S]*font-size:\s*(?:var\(--text-xs\)|0\.75rem)/,
        ],
        runtimeStyles: [{
          selector: '.hbuilderx-web-hmr-probe',
          styles: { backgroundColor: 'rgb(14, 116, 144)', fontSize: '12px', marginTop: '5px' },
        }],
      },
    ],
  },
]

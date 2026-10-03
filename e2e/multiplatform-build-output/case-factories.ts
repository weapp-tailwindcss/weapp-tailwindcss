import type { BuildOutputCase } from './types'
import { taroMiniOutputByPlatform } from './case-factories/taro-mini'
import { rawTailwindDirectiveRE } from './helpers'

export { taroMiniCase } from './case-factories/taro-mini'

const miniStyleFileByPlatform: Record<string, string> = {
  'mp-alipay': 'app.acss',
  'mp-baidu': 'app.css',
  'mp-jd': 'app.jxss',
  'mp-kuaishou': 'app.css',
  'mp-lark': 'app.ttss',
  'mp-qq': 'app.qss',
  'mp-toutiao': 'app.ttss',
  'mp-weixin': 'app.wxss',
  'mp-xhs': 'app.css',
}

const miniTemplateFileByPlatform: Record<string, string> = {
  'mp-alipay': 'pages/index/index.axml',
  'mp-baidu': 'pages/index/index.swan',
  'mp-jd': 'pages/index/index.jxml',
  'mp-kuaishou': 'pages/index/index.ksml',
  'mp-lark': 'pages/index/index.ttml',
  'mp-qq': 'pages/index/index.qml',
  'mp-toutiao': 'pages/index/index.ttml',
  'mp-weixin': 'pages/index/index.wxml',
  'mp-xhs': 'pages/index/index.xml',
}

function cssMarker(value: string) {
  return `.${value}`
}

function createSubpackageCssAssertions(options: {
  appStyleFile: string
  normalStyleFile: string
  independentStyleFile: string
  normalEntryStyleFile?: string
  independentEntryStyleFile?: string
  mainMarker: string
  normalMarker: string
  independentMarker: string
  normalLocalSelector: string
  independentLocalSelector: string
  singleEntry: boolean
}) {
  const allMarkers = [
    cssMarker(options.mainMarker),
    cssMarker(options.normalMarker),
    cssMarker(options.independentMarker),
  ]

  if (options.singleEntry) {
    return [
      {
        file: options.appStyleFile,
        contains: allMarkers,
        notContains: [rawTailwindDirectiveRE],
      },
    ]
  }

  return [
    {
      file: options.appStyleFile,
      contains: [cssMarker(options.mainMarker)],
      notContains: [cssMarker(options.normalMarker), cssMarker(options.independentMarker), rawTailwindDirectiveRE],
    },
    {
      file: options.normalStyleFile,
      contains: options.normalEntryStyleFile
        ? [parentImportPathTo(`index${options.normalEntryStyleFile.slice(options.normalEntryStyleFile.lastIndexOf('.'))}`), options.normalLocalSelector]
        : [cssMarker(options.normalMarker)],
      notContains: [
        cssMarker(options.mainMarker),
        ...(options.normalEntryStyleFile ? [cssMarker(options.normalMarker)] : []),
        cssMarker(options.independentMarker),
        rawTailwindDirectiveRE,
      ],
    },
    {
      file: options.independentStyleFile,
      contains: options.independentEntryStyleFile
        ? [parentImportPathTo(`index${options.independentEntryStyleFile.slice(options.independentEntryStyleFile.lastIndexOf('.'))}`), options.independentLocalSelector]
        : [cssMarker(options.independentMarker)],
      notContains: [
        cssMarker(options.mainMarker),
        cssMarker(options.normalMarker),
        ...(options.independentEntryStyleFile ? [cssMarker(options.independentMarker)] : []),
        rawTailwindDirectiveRE,
      ],
    },
    ...(options.normalEntryStyleFile
      ? [{
          file: options.normalEntryStyleFile,
          contains: [cssMarker(options.normalMarker)],
          notContains: [importPathTo(`pages/index${options.normalEntryStyleFile.slice(options.normalEntryStyleFile.lastIndexOf('.'))}`), cssMarker(options.mainMarker), cssMarker(options.independentMarker), rawTailwindDirectiveRE],
        }]
      : []),
    ...(options.independentEntryStyleFile
      ? [{
          file: options.independentEntryStyleFile,
          contains: [cssMarker(options.independentMarker)],
          notContains: [importPathTo(`pages/index${options.independentEntryStyleFile.slice(options.independentEntryStyleFile.lastIndexOf('.'))}`), cssMarker(options.mainMarker), cssMarker(options.normalMarker), rawTailwindDirectiveRE],
        }]
      : []),
  ] satisfies BuildOutputCase['fileAssertions']
}

export function uniAppMiniCase(options: {
  project: string
  platform: keyof typeof miniStyleFileByPlatform
  styleContains: Array<string | RegExp>
  textFile?: string
  textContains?: Array<string | RegExp>
}): BuildOutputCase {
  const outputDir = `dist/build/${options.platform}`
  const styleFile = miniStyleFileByPlatform[options.platform]
  return {
    name: `${options.project} ${options.platform}`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', 'run', `build:${options.platform}`],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/${styleFile}`,
    ],
    styleFiles: [outputDir],
    styleFileExtensions: [styleFile.slice(styleFile.lastIndexOf('.'))],
    textFiles: options.textFile ? [`${outputDir}/${options.textFile}`] : undefined,
    styleContains: options.styleContains,
    forbidEmptyBlockAtRules: true,
    textContains: options.textContains,
    notContains: [rawTailwindDirectiveRE],
    env: options.project === 'uni-app-vite-tailwindcss-v4'
      ? { WEAPP_TW_ISSUE_1005_FINAL_CSS_FIXTURE: '1' }
      : undefined,
    status: 'ci',
  }
}

export function uniAppH5Case(options: {
  project: string
  styleContains: Array<string | RegExp>
}): BuildOutputCase {
  return {
    name: `${options.project} h5`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: 'h5',
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist/build/h5',
    requiredFiles: ['dist/build/h5/index.html'],
    styleFiles: ['dist/build/h5'],
    styleFileExtensions: ['.css'],
    textFiles: ['dist/build/h5/index.html'],
    styleContains: options.styleContains,
    textContains: ['<html'],
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function uniAppH5SsrCase(options: {
  project: string
  styleContains: Array<string | RegExp>
}): BuildOutputCase {
  return {
    name: `${options.project} h5:ssr`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: 'h5:ssr',
    command: ['pnpm', 'run', 'build:h5:ssr'],
    outputDir: 'dist/build/h5',
    requiredFiles: [
      'dist/build/h5/client/index.html',
      'dist/build/h5/client/ssr-manifest.json',
      'dist/build/h5/server/entry-server.js',
      'dist/build/h5/server/index.html',
    ],
    styleFiles: ['dist/build/h5/client'],
    styleFileExtensions: ['.css'],
    textFiles: ['dist/build/h5/client/index.html', 'dist/build/h5/server/index.html'],
    styleContains: options.styleContains,
    textContains: ['<html'],
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function uniAppSubpackageMiniCase(options: {
  project: string
  platform: keyof typeof miniStyleFileByPlatform
  mode: 'isolated' | 'single'
  markers: {
    main: string
    normal: string
    independent: string
  }
}): BuildOutputCase {
  const outputDir = `dist/build/${options.platform}`
  const appStyleFile = miniStyleFileByPlatform[options.platform]
  const extension = appStyleFile.slice(appStyleFile.lastIndexOf('.'))
  const entryExtension = extension
  const singleEntry = options.mode === 'single'
  const mainStyleFile = singleEntry ? `main.single${entryExtension}` : `main${entryExtension}`
  const normalEntryStyleFile = singleEntry ? undefined : `${outputDir}/sub-normal/index${entryExtension}`
  const independentEntryStyleFile = singleEntry ? undefined : `${outputDir}/sub-independent/index${entryExtension}`
  return {
    name: `${options.project} ${options.platform} ${options.mode}`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', 'run', `build:${options.platform}`],
    env: { E2E_TW_CSS_ENTRY_MODE: options.mode },
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/${appStyleFile}`,
      `${outputDir}/${mainStyleFile}`,
      `${outputDir}/${miniTemplateFileByPlatform[options.platform]}`,
      ...(!singleEntry
        ? [
            `${outputDir}/sub-normal/pages/index${entryExtension}`,
            `${outputDir}/sub-independent/pages/index${entryExtension}`,
            normalEntryStyleFile!,
            independentEntryStyleFile!,
          ]
        : []),
    ],
    styleFiles: [outputDir],
    styleFileExtensions: [extension, entryExtension],
    textFiles: [outputDir],
    styleContains: singleEntry
      ? [cssMarker(options.markers.main), cssMarker(options.markers.normal), cssMarker(options.markers.independent)]
      : [cssMarker(options.markers.main), cssMarker(options.markers.normal), cssMarker(options.markers.independent)],
    forbidEmptyBlockAtRules: true,
    textContains: [options.markers.main, options.markers.normal, options.markers.independent],
    fileAssertions: createSubpackageCssAssertions({
      appStyleFile: `${outputDir}/${mainStyleFile}`,
      normalStyleFile: `${outputDir}/sub-normal/pages/index${entryExtension}`,
      independentStyleFile: `${outputDir}/sub-independent/pages/index${entryExtension}`,
      normalEntryStyleFile,
      independentEntryStyleFile,
      mainMarker: options.markers.main,
      normalMarker: options.markers.normal,
      independentMarker: options.markers.independent,
      normalLocalSelector: '.normal-page-local',
      independentLocalSelector: '.independent-page-local',
      singleEntry,
    }),
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function uniAppSubpackageH5Case(options: {
  project: string
  mode: 'isolated' | 'single'
  ssr?: boolean
  markers: {
    main: string
    normal: string
    independent: string
  }
}): BuildOutputCase {
  const platform = options.ssr ? 'h5:ssr' : 'h5'
  return {
    name: `${options.project} ${platform} ${options.mode}`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform,
    command: ['pnpm', 'run', options.ssr ? 'build:h5:ssr' : 'build:h5'],
    env: { E2E_TW_CSS_ENTRY_MODE: options.mode },
    outputDir: 'dist/build/h5',
    requiredFiles: options.ssr
      ? [
          'dist/build/h5/client/index.html',
          'dist/build/h5/client/ssr-manifest.json',
          'dist/build/h5/server/entry-server.js',
          'dist/build/h5/server/index.html',
        ]
      : ['dist/build/h5/index.html'],
    styleFiles: [options.ssr ? 'dist/build/h5/client' : 'dist/build/h5'],
    styleFileExtensions: ['.css'],
    textFiles: options.ssr
      ? ['dist/build/h5/client/index.html', 'dist/build/h5/server/index.html']
      : ['dist/build/h5/index.html'],
    styleContains: [cssMarker(options.markers.main), cssMarker(options.markers.normal), cssMarker(options.markers.independent)],
    textContains: ['<div id="app"></div>'],
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function uniAppQuickappCase(options: {
  project: string
  platform: 'quickapp-webview' | 'quickapp-webview-huawei' | 'quickapp-webview-union'
  styleContains: Array<string | RegExp>
}): BuildOutputCase {
  const outputDir = `dist/build/${options.platform}`
  return {
    name: `${options.project} ${options.platform}`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', 'run', `build:${options.platform}`],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/app.css`,
    ],
    styleFiles: [outputDir],
    styleFileExtensions: ['.css'],
    styleContains: options.styleContains,
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function uniAppHBuilderXMiniCase(options: {
  project: string
  version: 'v3' | 'v4'
}): BuildOutputCase {
  const outputDir = 'dist/build/mp-weixin'
  return {
    name: `${options.project} mp-weixin`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: 'mp-weixin',
    command: ['pnpm', 'run', 'build:mp-weixin'],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/app.wxss`,
      `${outputDir}/pages/index/index.wxml`,
    ],
    styleFiles: [outputDir],
    styleFileExtensions: ['.wxss'],
    textFiles: [`${outputDir}/pages/index/index.wxml`],
    styleContains: [
      '.bg-_b_h123456_B',
      '.text-_b_h888800_B',
      '.w-_b120px_B',
      '.h-_b6rem_B',
    ],
    forbidEmptyBlockAtRules: true,
    textContains: [
      'bg-_b_h123456_B',
      'text-_b_h888800_B',
      'w-_b120px_B',
      'h-_b6rem_B',
    ],
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function mpxCase(options: {
  project: string
  version: 'v3' | 'v4'
  platform: 'wx' | 'ali' | 'swan' | 'tt' | 'dd'
  command: string[]
  env?: Record<string, string>
}): BuildOutputCase {
  const isV4 = options.version === 'v4'
  const normalMarker = '.bg-normal-subpackage-marker'
  const independentMarker = '.bg-independent-subpackage-marker'
  return {
    name: `${options.project} ${options.platform}`,
    framework: 'mpx',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: options.command,
    env: options.env,
    outputDir: 'dist/wx',
    requiredFiles: [
      'dist/wx/app.js',
      'dist/wx/app.json',
      'dist/wx/pages/index.wxml',
      ...(isV4
        ? [
            'dist/wx/sub-normal/pages/index.wxss',
            'dist/wx/sub-independent/pages/index.wxss',
          ]
        : []),
    ],
    styleFiles: isV4 ? ['dist/wx'] : ['dist/wx/styles'],
    styleFileExtensions: ['.wxss'],
    textFiles: isV4 ? ['dist/wx'] : ['dist/wx/pages/index.wxml'],
    styleContains: isV4
      ? [
          '.bg-_b_h123456_B',
          '.w-_b300rpx_B',
          '.text-_b_hbada55_B',
          '.before_ccontent',
          normalMarker,
          independentMarker,
        ]
      : [
          '.bg-_b_h123456_B',
          '.before_ccontent',
        ],
    forbidEmptyBlockAtRules: true,
    textContains: isV4
      ? [
          'bg-_b_h123456_B',
          'text-_b_hbada55_B',
          'bg-normal-subpackage-marker',
          'bg-independent-subpackage-marker',
        ]
      : [
          'bg-_b_h123456_B',
          'before_ccontent',
        ],
    fileAssertions: isV4
      ? [
          {
            file: 'dist/wx/sub-normal/pages/index.wxss',
            contains: [importPathTo('.wxss')],
            notContains: [normalMarker, independentMarker, rawTailwindDirectiveRE],
          },
          {
            file: 'dist/wx/sub-normal/styles',
            contains: [normalMarker],
            notContains: [independentMarker, rawTailwindDirectiveRE],
          },
          {
            file: 'dist/wx/sub-independent/pages/index.wxss',
            contains: [importPathTo('.wxss')],
            notContains: [normalMarker, independentMarker, rawTailwindDirectiveRE],
          },
          {
            file: 'dist/wx/sub-independent/styles',
            contains: [independentMarker],
            notContains: [normalMarker, rawTailwindDirectiveRE],
          },
        ]
      : undefined,
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function taroSubpackageMiniCase(options: {
  project: string
  packageName: string
  platform: keyof typeof taroMiniOutputByPlatform
  mode: 'isolated' | 'single'
  markers: {
    main: string
    normal: string
    independent: string
  }
}): BuildOutputCase {
  const output = taroMiniOutputByPlatform[options.platform]
  const extension = output.styleExtension
  const singleEntry = options.mode === 'single'
  return {
    name: `${options.project} ${options.platform} ${options.mode}`,
    framework: 'taro',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', '--filter', options.packageName, 'run', `build:${options.platform}`],
    commandCwd: 'repo',
    env: { E2E_TW_CSS_ENTRY_MODE: options.mode },
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.js',
      output.appJson,
      output.appStyle,
      output.pageTemplate,
      ...(!singleEntry
        ? [
            `dist/sub-normal/pages/index${extension}`,
            `dist/sub-independent/pages/index${extension}`,
          ]
        : []),
    ],
    styleFiles: ['dist'],
    styleFileExtensions: [extension],
    textFiles: ['dist'],
    styleContains: [cssMarker(options.markers.main), cssMarker(options.markers.normal), cssMarker(options.markers.independent)],
    forbidEmptyBlockAtRules: true,
    textContains: [options.markers.main, options.markers.normal, options.markers.independent],
    fileAssertions: createSubpackageCssAssertions({
      appStyleFile: output.appStyle,
      normalStyleFile: `dist/sub-normal/pages/index${extension}`,
      independentStyleFile: `dist/sub-independent/pages/index${extension}`,
      normalEntryStyleFile: undefined,
      independentEntryStyleFile: undefined,
      mainMarker: options.markers.main,
      normalMarker: options.markers.normal,
      independentMarker: options.markers.independent,
      singleEntry,
    }),
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function taroSubpackageH5Case(options: {
  project: string
  packageName: string
  mode: 'isolated' | 'single'
  markers: {
    main: string
    normal: string
    independent: string
  }
}): BuildOutputCase {
  return {
    name: `${options.project} h5 ${options.mode}`,
    framework: 'taro',
    projectDir: `demo/${options.project}`,
    platform: 'h5',
    command: ['pnpm', '--filter', options.packageName, 'run', 'build:h5'],
    commandCwd: 'repo',
    env: { E2E_TW_CSS_ENTRY_MODE: options.mode },
    outputDir: 'dist',
    requiredFiles: [
      'dist/js/app.js',
    ],
    styleFiles: ['dist'],
    styleFileExtensions: ['.css'],
    styleContains: [cssMarker(options.markers.main), cssMarker(options.markers.normal), cssMarker(options.markers.independent)],
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

export function gulpMiniCase(options: {
  project: string
  platform: 'tt'
  styleContains: Array<string | RegExp>
  textContains: Array<string | RegExp>
}): BuildOutputCase {
  return {
    name: `${options.project} ${options.platform}`,
    framework: 'gulp',
    projectDir: `demo/${options.project}`,
    platform: options.platform,
    command: ['pnpm', 'run', `build:${options.platform}`],
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.ttss',
      'dist/pages/index/index.ttml',
      'dist/pages/index/index.ttss',
      'dist/sub-normal/pages/index.ttml',
      'dist/sub-normal/pages/index.ttss',
    ],
    styleFiles: ['dist'],
    styleFileExtensions: ['.ttss'],
    textFiles: ['dist'],
    styleContains: options.styleContains,
    forbidEmptyBlockAtRules: true,
    textContains: options.textContains,
    notContains: [rawTailwindDirectiveRE],
    status: 'ci',
  }
}

function importPathTo(scopeFile: string) {
  return new RegExp(`@import\\s+["'][^"']*${scopeFile.replace('.', '\\.')}["']`)
}

function parentImportPathTo(scopeFile: string) {
  return new RegExp(`@import\\s+["']\\.\\./${scopeFile.replace('.', '\\.')}["']`)
}

function cssSelector(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?=[\\s,{.:#>+~\\[]|$)`)
}

export function styleInjectorUniAppMiniCase(options: {
  project: string
}): BuildOutputCase {
  const outputDir = 'dist/build/mp-weixin'
  return {
    name: `${options.project} mp-weixin`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: 'mp-weixin',
    command: ['pnpm', 'run', 'build:mp-weixin'],
    outputDir,
    requiredFiles: [
      `${outputDir}/app.js`,
      `${outputDir}/app.json`,
      `${outputDir}/app.wxss`,
      `${outputDir}/sub-normal/index.wxss`,
      `${outputDir}/sub-normal/page.wxss`,
      `${outputDir}/sub-normal/scss.wxss`,
      `${outputDir}/sub-normal/less.wxss`,
      `${outputDir}/sub-normal/component.wxss`,
      `${outputDir}/sub-normal/weapp.wxss`,
      `${outputDir}/sub-normal/ali.wxss`,
      `${outputDir}/sub-normal/pages/index.wxss`,
      `${outputDir}/sub-normal/pages/index.weapp.wxss`,
      `${outputDir}/sub-normal/pages/index.ali.wxss`,
      `${outputDir}/sub-normal/components/NormalBadge.wxss`,
      `${outputDir}/sub-independent/index.wxss`,
      `${outputDir}/sub-independent/pages/index.wxss`,
    ],
    styleFiles: [outputDir],
    styleFileExtensions: ['.wxss'],
    textFiles: [outputDir],
    styleContains: [
      '.injector-uni-normal',
      '.injector-uni-normal-page-entry',
      '.injector-uni-scss-entry',
      '.injector-uni-less-entry',
      '.injector-uni-normal-component-entry',
      '.injector-uni-weapp-entry',
      '.injector-uni-ali-entry',
      '.injector-uni-independent',
    ],
    forbidEmptyBlockAtRules: true,
    textContains: [
      'injector-uni-normal',
      'injector-uni-independent',
    ],
    fileAssertions: [
      {
        file: `${outputDir}/app.wxss`,
        notContains: [cssSelector('.injector-uni-normal'), cssSelector('.injector-uni-independent')],
      },
      {
        file: `${outputDir}/sub-normal/pages/index.wxss`,
        contains: [importPathTo('index.wxss'), importPathTo('page.wxss'), importPathTo('scss.wxss'), importPathTo('less.wxss')],
        notContains: [importPathTo('component.wxss'), cssSelector('.injector-uni-main'), cssSelector('.injector-uni-independent')],
      },
      {
        file: `${outputDir}/sub-normal/components/NormalBadge.wxss`,
        contains: [importPathTo('index.wxss'), importPathTo('component.wxss')],
        notContains: [importPathTo('page.wxss'), cssSelector('.injector-uni-main'), cssSelector('.injector-uni-independent')],
      },
      {
        file: `${outputDir}/sub-normal/index.wxss`,
        contains: ['.injector-uni-normal'],
        notContains: ['@import', cssSelector('.injector-uni-normal-page-entry'), cssSelector('.injector-uni-normal-component-entry'), cssSelector('.injector-uni-main'), cssSelector('.injector-uni-independent')],
      },
      {
        file: `${outputDir}/sub-normal/page.wxss`,
        contains: ['.injector-uni-normal-page-entry'],
        notContains: ['@import', cssSelector('.injector-uni-normal'), cssSelector('.injector-uni-normal-component-entry')],
      },
      {
        file: `${outputDir}/sub-normal/scss.wxss`,
        contains: ['.injector-uni-scss-entry', '#0891b2'],
      },
      {
        file: `${outputDir}/sub-normal/less.wxss`,
        contains: ['.injector-uni-less-entry', '#9333ea'],
      },
      {
        file: `${outputDir}/sub-normal/component.wxss`,
        contains: ['.injector-uni-normal-component-entry'],
        notContains: ['@import', cssSelector('.injector-uni-normal'), cssSelector('.injector-uni-normal-page-entry')],
      },
      {
        file: `${outputDir}/sub-normal/pages/index.weapp.wxss`,
        contains: [importPathTo('weapp.wxss')],
        notContains: [importPathTo('ali.wxss'), importPathTo('page.wxss'), importPathTo('component.wxss')],
      },
      {
        file: `${outputDir}/sub-normal/pages/index.ali.wxss`,
        contains: [importPathTo('ali.wxss')],
        notContains: [importPathTo('weapp.wxss'), importPathTo('page.wxss'), importPathTo('component.wxss')],
      },
      {
        file: `${outputDir}/sub-normal/weapp.wxss`,
        contains: ['.injector-uni-weapp-entry'],
        notContains: ['@import', cssSelector('.injector-uni-ali-entry')],
      },
      {
        file: `${outputDir}/sub-normal/ali.wxss`,
        contains: ['.injector-uni-ali-entry'],
        notContains: ['@import', cssSelector('.injector-uni-weapp-entry')],
      },
      {
        file: `${outputDir}/sub-independent/pages/index.wxss`,
        contains: [importPathTo('index.wxss')],
        notContains: [cssSelector('.injector-uni-main'), cssSelector('.injector-uni-normal')],
      },
      {
        file: `${outputDir}/sub-independent/index.wxss`,
        contains: ['.injector-uni-independent'],
        notContains: ['@import', cssSelector('.injector-uni-main'), cssSelector('.injector-uni-normal')],
      },
    ],
    status: 'ci',
  }
}

export function styleInjectorUniAppH5Case(options: {
  project: string
}): BuildOutputCase {
  return {
    name: `${options.project} h5`,
    framework: 'uni-app',
    projectDir: `demo/${options.project}`,
    platform: 'h5',
    command: ['pnpm', 'run', 'build:h5'],
    outputDir: 'dist/build/h5',
    requiredFiles: ['dist/build/h5/index.html'],
    styleFiles: ['dist/build/h5'],
    styleFileExtensions: ['.css'],
    textFiles: ['dist/build/h5/index.html'],
    styleContains: [
      '.injector-uni-normal',
      '.injector-uni-normal-page-entry',
      '.injector-uni-scss-entry',
      '.injector-uni-less-entry',
      '.injector-uni-normal-component-entry',
      '.injector-uni-weapp-entry',
      '.injector-uni-ali-entry',
      '.injector-uni-independent',
    ],
    textContains: ['<html'],
    fileAssertions: [
      {
        file: 'dist/build/h5/sub-normal/pages/index.css',
        contains: [importPathTo('index.css'), importPathTo('page.css'), importPathTo('scss.css'), importPathTo('less.css'), '.injector-uni-normal-page'],
        notContains: [importPathTo('component.css')],
      },
      {
        file: 'dist/build/h5/sub-normal/components/NormalBadge.css',
        contains: [importPathTo('index.css'), importPathTo('component.css'), '.injector-uni-normal-component-local'],
        notContains: [importPathTo('page.css')],
      },
      {
        file: 'dist/build/h5/sub-normal/page.css',
        contains: ['.injector-uni-normal-page-entry'],
        notContains: ['@import'],
      },
      {
        file: 'dist/build/h5/sub-normal/scss.css',
        contains: ['.injector-uni-scss-entry', '#0891b2'],
      },
      {
        file: 'dist/build/h5/sub-normal/less.css',
        contains: ['.injector-uni-less-entry', '#9333ea'],
      },
      {
        file: 'dist/build/h5/sub-normal/component.css',
        contains: ['.injector-uni-normal-component-entry'],
        notContains: ['@import', cssSelector('.injector-uni-normal-page-entry')],
      },
      {
        file: 'dist/build/h5/sub-normal/pages/index.weapp.css',
        contains: [importPathTo('weapp.css')],
        notContains: [importPathTo('ali.css'), importPathTo('page.css'), importPathTo('component.css')],
      },
      {
        file: 'dist/build/h5/sub-normal/pages/index.ali.css',
        contains: [importPathTo('ali.css')],
        notContains: [importPathTo('weapp.css'), importPathTo('page.css'), importPathTo('component.css')],
      },
      {
        file: 'dist/build/h5/sub-normal/weapp.css',
        contains: ['.injector-uni-weapp-entry'],
        notContains: ['@import', cssSelector('.injector-uni-ali-entry')],
      },
      {
        file: 'dist/build/h5/sub-normal/ali.css',
        contains: ['.injector-uni-ali-entry'],
        notContains: ['@import', cssSelector('.injector-uni-weapp-entry')],
      },
    ],
    status: 'ci',
  }
}

export function styleInjectorMpxMiniCase(options: {
  project: string
}): BuildOutputCase {
  return {
    name: `${options.project} wx`,
    framework: 'mpx',
    projectDir: `demo/${options.project}`,
    platform: 'wx',
    command: ['pnpm', 'run', 'build'],
    env: {
      MPX_CURRENT_TARGET_MODE: 'wx',
    },
    outputDir: 'dist/wx',
    requiredFiles: [
      'dist/wx/app.js',
      'dist/wx/app.json',
      'dist/wx/app.wxss',
      'dist/wx/sub-normal/index.wxss',
      'dist/wx/sub-normal/scss.wxss',
      'dist/wx/sub-normal/less.wxss',
      'dist/wx/sub-normal/pages/index.wxss',
      'dist/wx/sub-independent/index.wxss',
      'dist/wx/sub-independent/pages/index.wxss',
    ],
    styleFiles: ['dist/wx'],
    styleFileExtensions: ['.wxss'],
    textFiles: ['dist/wx'],
    styleContains: [
      '.injector-mpx-normal',
      '.injector-mpx-scss-entry',
      '.injector-mpx-less-entry',
      '.injector-mpx-independent',
    ],
    forbidEmptyBlockAtRules: true,
    textContains: [
      'injector-mpx-normal',
      'injector-mpx-independent',
    ],
    fileAssertions: [
      {
        file: 'dist/wx/app.wxss',
        notContains: [cssSelector('.injector-mpx-normal'), cssSelector('.injector-mpx-independent')],
      },
      {
        file: 'dist/wx/sub-normal/pages/index.wxss',
        contains: [importPathTo('index.wxss'), importPathTo('scss.wxss'), importPathTo('less.wxss')],
        notContains: [cssSelector('.injector-mpx-main'), cssSelector('.injector-mpx-independent')],
      },
      {
        file: 'dist/wx/sub-normal/index.wxss',
        contains: ['.injector-mpx-normal'],
        notContains: ['@import', cssSelector('.injector-mpx-main'), cssSelector('.injector-mpx-independent')],
      },
      {
        file: 'dist/wx/sub-normal/scss.wxss',
        contains: ['#0891b2', '.injector-mpx-scss-entry'],
      },
      {
        file: 'dist/wx/sub-normal/less.wxss',
        contains: ['#9333ea', '.injector-mpx-less-entry'],
      },
      {
        file: 'dist/wx/sub-independent/pages/index.wxss',
        contains: [importPathTo('index.wxss')],
        notContains: [cssSelector('.injector-mpx-main'), cssSelector('.injector-mpx-normal')],
      },
      {
        file: 'dist/wx/sub-independent/index.wxss',
        contains: ['.injector-mpx-independent'],
        notContains: ['@import', cssSelector('.injector-mpx-main'), cssSelector('.injector-mpx-normal')],
      },
    ],
    status: 'ci',
  }
}

export function styleInjectorTaroMiniCase(options: {
  project: string
  packageName: string
  markerPrefix: string
  bundler: 'webpack' | 'vite'
}): BuildOutputCase {
  const normalMarker = `.injector-${options.markerPrefix}-normal`
  const scssMarker = `.injector-${options.markerPrefix}-scss-entry`
  const lessMarker = `.injector-${options.markerPrefix}-less-entry`
  const independentMarker = `.injector-${options.markerPrefix}-independent`
  const isVite = options.bundler === 'vite'
  return {
    name: `${options.project} weapp`,
    framework: 'taro',
    projectDir: `demo/${options.project}`,
    platform: 'weapp',
    command: ['pnpm', '--filter', options.packageName, 'run', 'build:weapp'],
    commandCwd: 'repo',
    outputDir: 'dist',
    requiredFiles: [
      'dist/app.js',
      'dist/app.json',
      'dist/app.wxss',
      ...(isVite ? ['dist/app-origin.wxss'] : []),
      'dist/sub-normal/index.wxss',
      'dist/sub-normal/scss.wxss',
      'dist/sub-normal/less.wxss',
      'dist/sub-normal/pages/index/index.wxss',
      ...(isVite
        ? ['dist/sub-independent/index.wxss', 'dist/sub-independent/pages/index/index.wxss']
        : [
            'dist/sub-independent/index.wxss',
            'dist/sub-independent/pages/index/index.wxss',
          ]),
    ],
    styleFiles: ['dist'],
    styleFileExtensions: ['.wxss'],
    textFiles: ['dist'],
    styleContains: [
      normalMarker,
      scssMarker,
      lessMarker,
      independentMarker,
    ],
    forbidEmptyBlockAtRules: true,
    textContains: [
      `injector-${options.markerPrefix}-normal`,
      `injector-${options.markerPrefix}-independent`,
    ],
    fileAssertions: [
      {
        file: isVite ? 'dist/app-origin.wxss' : 'dist/app.wxss',
        notContains: [cssSelector(normalMarker), cssSelector(independentMarker)],
      },
      {
        file: 'dist/sub-normal/pages/index/index.wxss',
        contains: [importPathTo('index.wxss'), importPathTo('scss.wxss'), importPathTo('less.wxss')],
        notContains: [cssSelector(independentMarker)],
      },
      {
        file: 'dist/sub-normal/index.wxss',
        contains: [normalMarker],
        notContains: ['@import', cssSelector(independentMarker)],
      },
      {
        file: 'dist/sub-normal/scss.wxss',
        contains: ['#0891b2', scssMarker],
      },
      {
        file: 'dist/sub-normal/less.wxss',
        contains: ['#9333ea', lessMarker],
      },
      {
        file: 'dist/sub-independent/pages/index/index.wxss',
        contains: [importPathTo('index.wxss')],
        notContains: [cssSelector(normalMarker)],
      },
      {
        file: 'dist/sub-independent/index.wxss',
        contains: [independentMarker],
        notContains: ['@import', cssSelector(normalMarker)],
      },
    ],
    status: 'ci',
  }
}

export function styleInjectorTaroH5Case(options: {
  project: string
  packageName: string
  markerPrefix: string
  bundler: 'webpack' | 'vite'
}): BuildOutputCase {
  return {
    name: `${options.project} h5`,
    framework: 'taro',
    projectDir: `demo/${options.project}`,
    platform: 'h5',
    command: ['pnpm', '--filter', options.packageName, 'run', 'build:h5'],
    commandCwd: 'repo',
    outputDir: 'dist',
    requiredFiles: options.bundler === 'webpack'
      ? ['dist/js/app.js']
      : ['dist/index.html'],
    styleFiles: ['dist'],
    styleFileExtensions: ['.css'],
    styleContains: [
      `.injector-${options.markerPrefix}-normal`,
      `.injector-${options.markerPrefix}-scss-entry`,
      `.injector-${options.markerPrefix}-less-entry`,
      `.injector-${options.markerPrefix}-independent`,
    ],
    status: 'ci',
  }
}

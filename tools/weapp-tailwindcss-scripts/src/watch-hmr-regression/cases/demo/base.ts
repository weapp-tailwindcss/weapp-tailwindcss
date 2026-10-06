import type { ClassMutationConfig, SubPackageMutationConfig, WatchCase } from '../../types'
import path from 'node:path'
import {
  appendTrailingSnippet,
  createStyleRuleSnippet,
  insertBeforeClosingTag,
  mutateScriptByDataAnchor,
  mutateScriptByDataAnchorWithCommentCarrier,
  replaceExactSnippet,
} from '../../text'
import { buildHexScriptRoundConfigs, buildIssue33HighRiskRoundConfigs, buildTailwindV4JsContentRoundConfigs, MINI_PROGRAM_REMOVED_CSS_UTILITIES } from '../round-configs'

const gulpWatchEnv = {
  CHOKIDAR_USEPOLLING: '1',
  CHOKIDAR_INTERVAL: '50',
}

function createSubPackageMutations(
  baseCwd: string,
  options: {
    project: string
    sourceRoot: string
    distRoot: string
    version: 'v3' | 'v4'
    pageKind: 'wxml' | 'tsx' | 'vue' | 'mpx'
    styleExtension?: 'scss' | 'css'
    styleCandidates?: (subPackage: 'sub-normal' | 'sub-independent') => string[]
    globalStyleCandidates?: (subPackage: 'sub-normal' | 'sub-independent') => string[]
    styleMutationOptions?: Pick<NonNullable<WatchCase['subPackageMutations']>[number]['styleMutation'], 'validateApply' | 'validateFunction' | 'outputNeedles' | 'rollbackNeedles'>
    skipStyleMutation?: boolean
    templateVerifyEscapedIn?: Array<'wxml' | 'js'>
    templateVerifyClassLiteralIn?: Array<'wxml' | 'js'>
    expectedRemovedCssUtilities?: ClassMutationConfig['expectedRemovedCssUtilities']
  },
): SubPackageMutationConfig[] {
  const styleExtension = options.styleExtension ?? 'css'
  const sourceRoot = options.sourceRoot === '.' ? '' : `${options.sourceRoot}/`
  const distRoot = options.distRoot === '.' ? '' : `${options.distRoot}/`
  return (['sub-normal', 'sub-independent'] as const).map((subPackage) => {
    const independent = subPackage === 'sub-independent'
    const label = independent ? 'independent' : 'normal'
    const sourceDir = path.resolve(baseCwd, `demo/${options.project}/${sourceRoot}${subPackage}/pages`)
    const distDir = path.resolve(baseCwd, `demo/${options.project}/${distRoot}${subPackage}/pages`)
    const pageSource = path.join(sourceDir, options.pageKind === 'wxml' ? 'index.wxml' : `index.${options.pageKind}`)
    const styleSource = path.join(sourceDir, `index.${styleExtension}`)
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
          ?? (options.pageKind === 'wxml' || options.pageKind === 'mpx' || options.pageKind === 'vue' ? ['wxml'] : ['js']),
        verifyClassLiteralIn: options.templateVerifyClassLiteralIn
          ?? (options.pageKind === 'tsx' ? ['js'] : []),
        ...(options.expectedRemovedCssUtilities ? { expectedRemovedCssUtilities: options.expectedRemovedCssUtilities } : {}),
        roundConfigs,
        mutate(source, payload) {
          if (options.pageKind === 'wxml') {
            return appendTrailingSnippet(
              source,
              `<view class="${payload.classLiteral}">${payload.marker}-${label}-subpackage</view>`,
            )
          }
          if (options.pageKind === 'tsx') {
            const snippet = `  <View className="${payload.classLiteral}">${payload.marker}-${label}-subpackage</View>`
            return insertBeforeClosingTag(source, '</View>', snippet)
          }
          if (options.pageKind === 'vue') {
            const snippet = `  <view class="${payload.classLiteral}">${payload.marker}-${label}-subpackage</view>`
            return insertBeforeClosingTag(source, '</template>', snippet)
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

export function buildDemoBaseCases(baseCwd: string): WatchCase[] {
  const gulpV4Case: WatchCase = {
    name: 'gulp-tailwindcss-v4',
    label: 'demo/gulp-tailwindcss-v4',
    project: 'demo/gulp-tailwindcss-v4',
    group: 'demo',
    requireInitialCompileSuccess: true,
    initialMutationDelayMs: 5_000,
    cwd: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4'),
    devScript: 'dev',
    env: gulpWatchEnv,
    outputWxml: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/app.wxss'),
    ],
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/src/pages/index/index.wxml'),
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: [],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `        <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertBeforeClosingTag(source, '      </view>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/src/pages/index/index.ts'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      roundConfigs: buildTailwindV4JsContentRoundConfigs(),
      mutate(source, payload) {
        return mutateScriptByDataAnchor(source, '  data: {', payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/src/app.css'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'gulp-tailwindcss-v4',
      sourceRoot: 'src',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'wxml',
      styleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, `demo/gulp-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/gulp-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
  }

  const weappViteV4Case: WatchCase = {
    name: 'weapp-vite-tailwindcss-v4',
    label: 'demo/weapp-vite-tailwindcss-v4',
    project: 'demo/weapp-vite-tailwindcss-v4',
    group: 'demo',
    requireInitialCompileSuccess: false,
    requireInitialTemplateOutput: false,
    requireStableGlobalStyleOnSameClassLiteral: false,
    maxPluginProcessMs: 1_000,
    initialBuildScript: 'build',
    initialMutationDelayMs: 3_000,
    cwd: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4'),
    devScript: 'dev:e2e-watch',
    env: {
      WEAPP_VITE_E2E_WATCH_HMR_RUNTIME: 'classic',
    },
    outputWxml: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/pages/index/index.wxml'),
    outputJs: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/pages/index/index.js'),
    outputStyleCandidates: [
      path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/tailwind.wxss'),
      path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
    ],
    contentMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/pages/index/index.wxml'),
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: ['wxml'],
      forbidBgHexTruncationIn: ['wxml'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return replaceExactSnippet(
          source,
          'bg-[#68c828] text-[100px] text-[#123456] w-[323px]',
          payload.classLiteral,
          'weapp-vite-tailwindcss-v4 content class anchor',
        )
      },
    },
    userReportedHotUpdate: {
      label: 'wxml expression bg-[#111111] to bg-[#f40909]',
      sourceFile: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/pages/index/index.wxml'),
      before: `mode === 'light'?'bg-[#111111] text-slate-800':'bg-gray-900 text-slate-200'`,
      after: `mode === 'light'?'bg-[#f40909] text-slate-800':'bg-gray-900 text-slate-200'`,
      beforeClassTokens: ['bg-[#111111]'],
      afterClassTokens: ['bg-[#f40909]'],
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: ['wxml'],
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/pages/index/index.wxml'),
      verifyEscapedIn: ['wxml'],
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        const snippet = `  <view class="${payload.classLiteral}">${payload.marker}-template</view>`
        return insertBeforeClosingTag(source, '</scroll-view>', snippet)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/pages/index/index.ts'),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: ['js'],
      // Tailwind v4 的 JS 候选扫描只读取字符串，注释载体只验证 HMR marker。
      commentCarrierMinRequiredGlobalStyleEscapedClasses: 0,
      roundConfigs: buildTailwindV4JsContentRoundConfigs(),
      mutate(source, payload) {
        return mutateScriptByDataAnchor(source, '  data: {', payload)
      },
      mutateCommentCarrier(source, payload) {
        return mutateScriptByDataAnchorWithCommentCarrier(source, '  data: {', payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/pages/index/index.scss'),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    subPackageMutations: createSubPackageMutations(baseCwd, {
      project: 'weapp-vite-tailwindcss-v4',
      sourceRoot: '.',
      distRoot: 'dist',
      version: 'v4',
      pageKind: 'wxml',
      skipStyleMutation: true,
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      globalStyleCandidates(subPackage) {
        return [
          path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/tailwind.wxss'),
          path.resolve(baseCwd, `demo/weapp-vite-tailwindcss-v4/dist/${subPackage}/pages/index.wxss`),
          path.resolve(baseCwd, 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
        ]
      },
    }),
  }

  return [
    gulpV4Case,
    weappViteV4Case,
  ]
}

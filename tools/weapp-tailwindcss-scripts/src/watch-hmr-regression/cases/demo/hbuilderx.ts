import type { WatchCase } from '../../types'
import path from 'node:path'
import {
  appendTrailingSnippet,
  createStyleRuleSnippet,
  insertBeforeAnchor,
  insertBeforeClosingTag,
} from '../../text'
import { buildHexScriptRoundConfigs, buildIssue33HighRiskRoundConfigs, MINI_PROGRAM_REMOVED_CSS_UTILITIES } from '../round-configs'

const webDomMarkerAttr = 'data-tw-watch-web-dom="1"'

function mutateVueOptionsDataWithTemplateConsumer(
  source: string,
  payload: Parameters<NonNullable<WatchCase['scriptMutation']>['mutate']>[1],
) {
  const titleMatched = source.match(/title:\s*'[^']*'/)
  if (!titleMatched) {
    throw new Error('vue options data title anchor not found')
  }

  return insertBeforeClosingTag(
    source.replace(
      titleMatched[0],
      `${titleMatched[0]},\n\t\t\t\t${payload.classVariableName}: '${payload.classLiteral}',\n\t\t\t\t__twWatchScriptMarker: '${payload.marker}'`,
    ),
    '</template>',
    `\t\t<view hidden :class="${payload.classVariableName}">{{ __twWatchScriptMarker }}</view>`,
  )
}

function createUniAppHBuilderXVue3Case(baseCwd: string): WatchCase {
  const version = 'v4'
  const projectName = `uni-app-vite-vue3-hbuilderx-tailwindcss-${version}` as const
  const outputRoot = `demo/${projectName}/unpackage/dist/dev/mp-weixin`

  return {
    name: projectName,
    label: `demo/${projectName}`,
    project: `demo/${projectName}`,
    group: 'demo',
    cwd: path.resolve(baseCwd, `demo/${projectName}`),
    devScript: 'dev:mp-weixin',
    initialMutationDelayMs: 5000,
    requireStableGlobalStyleOnSameClassLiteral: false,
    skipWebHmrInFullRun: true,
    outputWxml: path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxml`),
    outputJs: path.resolve(baseCwd, `${outputRoot}/pages/index/index.js`),
    outputStyleCandidates: [
      path.resolve(baseCwd, `${outputRoot}/app.wxss`),
      path.resolve(baseCwd, `${outputRoot}/main.css`),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, `${outputRoot}/app.wxss`),
    ],
    outputIntegrityGuards: [
      path.resolve(baseCwd, `${outputRoot}/main.wxss`),
      path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxss`),
    ].map(file => ({
      file,
      forbiddenFragments: ['.i-\\[', '.before\\:'],
    })),
    contentMutation: {
      sourceFile: path.resolve(baseCwd, `demo/${projectName}/pages/index/index.vue`),
      verifyEscapedIn: ['wxml'],
      roundConfigs: buildIssue33HighRiskRoundConfigs(),
      mutate(source, payload) {
        return insertBeforeClosingTag(
          source,
          '</template>',
          `<view class="${payload.classLiteral}">${payload.marker}-content</view>`,
        )
      },
    },
    templateMutation: {
      sourceFile: path.resolve(baseCwd, `demo/${projectName}/pages/index/index.vue`),
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: [],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return insertBeforeClosingTag(source, '</template>', `\t\t<view class="${payload.classLiteral}">${payload.marker}-template</view>`)
      },
    },
    scriptMutation: {
      sourceFile: path.resolve(baseCwd, `demo/${projectName}/pages/index/index.vue`),
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: [],
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateVueOptionsDataWithTemplateConsumer(source, payload)
      },
    },
    styleMutation: {
      sourceFile: path.resolve(baseCwd, `demo/${projectName}/main.css`),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
    webHmr: {
      devScript: 'dev:h5',
      sourceFile: path.resolve(baseCwd, `demo/${projectName}/pages/index/index.vue`),
      cssEntryFile: path.resolve(baseCwd, `demo/${projectName}/main.css`),
      readySelector: 'uni-page[data-page="pages/index/index"]',
      initialMutationDelayMs: 1500,
      injectMarkerElement: true,
      mutate(source, payload) {
        return `${source}\n<!-- ${payload.marker} ${payload.classLiteral} -->`
      },
      sourceDomReplacementSequence: [
        {
          label: 'title and color to text-[red]',
          mutate(source) {
            const classMatched = source.match(/class="text-\[(?:#[0-9a-fA-F]{6}|red)\]"/)
            const titleMatched = source.match(/title:\s*'[^']*'/)
            if (!classMatched || !titleMatched) {
              throw new Error('HBuilderX web HMR source DOM anchor not found')
            }
            const next = source
              .replace(classMatched[0], `${webDomMarkerAttr} class="text-[red]"`)
              .replace(titleMatched[0], `title: 'H5-HMR-HBUILDERX-${version.toUpperCase()}'`)
            return {
              next,
              from: `${classMatched[0]} ${titleMatched[0]}`,
              to: `${webDomMarkerAttr} class="text-[red]" title: 'H5-HMR-HBUILDERX-${version.toUpperCase()}'`,
            }
          },
          expectedText: `H5-HMR-HBUILDERX-${version.toUpperCase()}`,
          expectedStyle: {
            color: 'rgb(255, 0, 0)',
          },
        },
      ],
    },
  }
}

function mutateUniAppXOptionsDataWithTemplateConsumer(
  source: string,
  payload: Parameters<NonNullable<WatchCase['scriptMutation']>['mutate']>[1],
) {
  const dataAnchor = 'globalNum: 0,'
  if (!source.includes(dataAnchor)) {
    throw new Error('uni-app-x options data globalNum anchor not found')
  }

  return insertBeforeAnchor(
    source.replace(
      dataAnchor,
      `${dataAnchor}\n\t\t\t\t${payload.classVariableName}: '${payload.classLiteral}',\n\t\t\t\t__twWatchScriptMarker: '${payload.marker}',`,
    ),
    '<BindClass />',
    `\t\t<view hidden :class="${payload.classVariableName}">{{ __twWatchScriptMarker }}</view>\n\t\t`,
  )
}

function createUniAppXHBuilderXCase(baseCwd: string): WatchCase {
  const version = 'v4'
  const projectName = `uni-app-x-vdom-tailwindcss-${version}` as const
  const outputRoot = `demo/${projectName}/unpackage/dist/dev/mp-weixin`
  const pageSource = path.resolve(baseCwd, `demo/${projectName}/pages/index/index.uvue`)

  return {
    name: projectName,
    label: `demo/${projectName}`,
    project: `demo/${projectName}`,
    group: 'demo',
    cwd: path.resolve(baseCwd, `demo/${projectName}`),
    devScript: 'dev:mp-weixin',
    initialMutationDelayMs: 5000,
    skipStyleMutation: true,
    outputWxml: path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxml`),
    outputJs: path.resolve(baseCwd, `${outputRoot}/pages/index/index.js`),
    outputStyleCandidates: [
      path.resolve(baseCwd, `${outputRoot}/app.wxss`),
      path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxss`),
      path.resolve(baseCwd, `${outputRoot}/main.css`),
    ],
    globalStyleCandidates: [
      path.resolve(baseCwd, `${outputRoot}/app.wxss`),
      path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxss`),
    ],
    outputIntegrityGuards: [
      path.resolve(baseCwd, `${outputRoot}/uvue.wxss`),
      path.resolve(baseCwd, `${outputRoot}/pages/index/index.wxss`),
    ].map(file => ({
      file,
      forbiddenFragments: ['.i-\\[', '.before\\:'],
    })),
    userReportedHotUpdate: {
      label: 'index text-xs to text-[29px]',
      sourceFile: pageSource,
      before: 'class="text-xs text-white">issue-1002 text-xs',
      after: 'class="text-[29px] text-white">issue-1002 text-[29px]',
      beforeClassTokens: ['text-xs'],
      afterClassTokens: ['text-[29px]'],
      verifyEscapedIn: ['wxml'],
    },
    templateMutation: {
      sourceFile: pageSource,
      verifyEscapedIn: ['wxml'],
      verifyClassLiteralIn: [],
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return insertBeforeAnchor(source, '<BindClass />', `\t\t<view class="${payload.classLiteral}">${payload.marker}-template</view>\n\t\t`)
      },
    },
    scriptMutation: {
      sourceFile: pageSource,
      verifyEscapedIn: ['js'],
      verifyClassLiteralIn: [],
      expectedRemovedCssUtilities: MINI_PROGRAM_REMOVED_CSS_UTILITIES,
      roundConfigs: buildHexScriptRoundConfigs(),
      mutate(source, payload) {
        return mutateUniAppXOptionsDataWithTemplateConsumer(source, payload)
      },
    },
    styleMutation: {
      sourceFile: version === 'v4'
        ? path.resolve(baseCwd, `demo/${projectName}/main.css`)
        : path.resolve(baseCwd, `demo/${projectName}/uni.scss`),
      mutate(source, payload) {
        return appendTrailingSnippet(source, createStyleRuleSnippet(payload))
      },
    },
  }
}

export function buildUniAppHBuilderXCases(baseCwd: string): WatchCase[] {
  return [
    createUniAppHBuilderXVue3Case(baseCwd),
    createUniAppXHBuilderXCase(baseCwd),
  ]
}

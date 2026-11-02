import type { AppCase } from './hbuilderx-local/cases'
import { it } from 'vitest'
import { hbuilderxAppTimeoutMs } from './hbuilderx-local/process'
import { verifyAppHmrWithHBuilderX } from './hbuilderx-local/runner'

const nativeControl = process.env['E2E_HBUILDERX_LOCAL'] === '1' && process.env['E2E_HBUILDERX_ISSUE1325_CONTROL'] === '1' ? it : it.skip

nativeControl('Issue 1325 无插件 Vapor 原生更新对照', async () => {
  const item: AppCase = {
    name: 'issue-1325-no-plugin-ios-vapor-native-reload-control',
    renderMode: 'vapor',
    platform: 'app-ios',
    updateMode: 'native-reload',
    projectDir: 'e2e/fixtures/issue-1325-vapor-native-control',
    outputDir: 'unpackage/dist/dev/app-ios',
    sourceFile: 'pages/index/index.uvue',
    markerAnchor: '<view id="control-anchor"',
    markerClass: 'h-[41px] w-[173px] bg-[#6d28d9]',
    markerTextClass: 'control-marker-text',
    markerText: 'control-initial',
    hmrMarkerClass: 'h-[41px] w-[173px] bg-[#9a3412]',
    hmrMarkerText: 'control-add-style',
    launchArgs: ['--iosTarget', 'simulator'],
    launchEnv: { UNI_APP_X_DOM2: 'true' },
    requiredFiles: ['manifest.json', 'app-service.js'],
    transformedOutputFiles: ['app-service.js'],
    transformedContains: ['1325-no-plugin-control'],
    hmrTransformedContains: ['1325-no-plugin-control'],
    hmrSteps: [{ name: 'add-style', markerClass: 'h-[41px] w-[173px] bg-[#9a3412]', markerTextClass: 'control-marker-text', markerText: 'control-add-style', transformedContains: ['1325-no-plugin-control'], sourceMutation: { file: 'pages/index/index.uvue', replace: { from: 'background-color: #6d28d9', to: 'background-color: #9a3412' }, append: '<style>.control-author { color: #111827; }</style>' } }],
    runtimeLogContains: ['App Launch'],
    logNotContains: [/TypeError/, /SyntaxError/],
  }
  await verifyAppHmrWithHBuilderX(item)
}, hbuilderxAppTimeoutMs * 2 + 30_000)

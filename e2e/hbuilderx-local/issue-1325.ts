import type { AppCase, HmrSourceMutation } from './cases'

const initial = '<style>\n.issue-1325-none-author { color: #111827; }\n</style>'
const replaced = initial.replace('#111827', '#334155')
const file = 'components/issue-1325/none.uvue'
const marker = 'flex h-[41px] w-[173px] items-center justify-center'

/** 产物入口只声明已核实的编译器契约；样式由真实节点与设备截图验收。 */
export function createIssue1325IosCase(launchArgs: string[]): AppCase {
  const steps: Array<{ name: string, color: string, mutation: HmrSourceMutation }> = [
    { name: 'add-author-style', color: '#9a3412', mutation: { file, append: initial } },
    { name: 'replace-author-style', color: '#166534', mutation: { file, replace: { from: initial, to: replaced } } },
    { name: 'delete-author-style', color: '#1e40af', mutation: { file, replace: { from: replaced, to: '' } } },
    { name: 'restore-author-style', color: '#9f1239', mutation: { file, append: initial } },
  ]
  return {
    name: 'uni-app-x-vapor-tailwindcss-v4 ios vapor',
    renderMode: 'vapor',
    platform: 'app-ios',
    projectDir: 'demo/uni-app-x-vapor-tailwindcss-v4',
    outputDir: 'unpackage/dist/dev/app-ios',
    sourceFile: file,
    markerAnchor: '<view id="issue-1325-none"',
    markerClass: `${marker} bg-[#6d28d9]`,
    markerTextClass: 'text-[18px] text-white',
    markerText: 'issue-1325-initial',
    hmrMarkerClass: `${marker} bg-[#9f1239]`,
    hmrMarkerText: 'issue-1325-restored',
    launchArgs,
    launchEnv: { UNI_APP_X_DOM2: 'true' },
    requiredFiles: ['manifest.json', 'app-service.js'],
    transformedOutputFiles: ['app-service.js'],
    // 此字符串来自实际被模板消费的 UTS 常量；静态模板文字可能进入 bytecode。
    transformedContains: ['issue-1125 Vapor line-height probe'],
    hmrTransformedContains: ['issue-1125 Vapor line-height probe'],
    runtimeNodes: ['page', 'none', 'plain', 'scoped', 'multiple', 'native'].map(name => ({
      id: `issue-1325-${name}`,
      width: 120,
      height: 32,
    })),
    hmrSteps: steps.map(step => ({
      name: step.name,
      markerClass: `${marker} bg-[${step.color}]`,
      markerTextClass: 'text-[18px] text-white',
      markerText: `issue-1325-${step.name}`,
      transformedContains: ['issue-1125 Vapor line-height probe'],
      sourceMutation: step.mutation,
    })),
    runtimeLogContains: ['App Launch'],
    logNotContains: [/TypeError/, /SyntaxError/],
  }
}

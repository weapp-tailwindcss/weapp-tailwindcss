import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(scriptDirectory, '..')
const repoRoot = path.resolve(websiteRoot, '..')

const paths = {
  adapter: path.join(repoRoot, 'packages', 'lynx', 'package.json'),
  core: path.join(repoRoot, 'packages', 'weapp-tailwindcss', 'package.json'),
  example: path.join(repoRoot, 'examples', 'react-lynx', 'package.json'),
  baseline: path.join(repoRoot, 'examples', 'react-lynx', 'src', 'compatibility', 'baseline.json'),
  workflow: path.join(repoRoot, '.github', 'workflows', 'lynx-native.yml'),
}

const docPaths = [
  path.join(repoRoot, 'packages', 'lynx', 'README.md'),
  path.join(repoRoot, 'packages', 'lynx', 'README.zh-CN.md'),
  path.join(websiteRoot, 'docs', 'config', 'react-lynx.md'),
  path.join(websiteRoot, 'docs', 'quick-start', 'frameworks', 'lynx.md'),
  path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current', 'config', 'react-lynx.md'),
  path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current', 'quick-start', 'frameworks', 'lynx.md'),
]

function addFinding(findings, file, message) {
  findings.push(`${path.relative(repoRoot, file)}: ${message}`)
}

function requireText(findings, file, source, expected) {
  if (!source.includes(expected)) {
    addFinding(findings, file, `缺少事实 “${expected}”`)
  }
}

function checkPackageFacts(findings, adapter, core, example) {
  const adapterNode = adapter.engines?.node
  const coreNode = core.engines?.node
  if (adapter.version !== '0.4.4') {
    addFinding(findings, paths.adapter, `adapter version 应为 0.4.4，实际为 ${adapter.version}`)
  }
  if (adapterNode !== '>=22.12.0') {
    addFinding(findings, paths.adapter, `adapter Node 要求应为 >=22.12.0，实际为 ${adapterNode}`)
  }
  if (adapter.peerDependencies?.['@lynx-js/rspeedy'] !== '>=0.16.0') {
    addFinding(findings, paths.adapter, 'Rspeedy peer 范围已漂移')
  }
  if (adapter.peerDependencies?.tailwindcss !== '>=4.0.0') {
    addFinding(findings, paths.adapter, 'Tailwind peer 范围已漂移')
  }
  if (core.version !== '5.6.3') {
    addFinding(findings, paths.core, `core version 应为 5.6.3，实际为 ${core.version}`)
  }
  if (coreNode !== '^22.18.0 || >=24.11.0') {
    addFinding(findings, paths.core, `core Node 要求应为 ^22.18.0 || >=24.11.0，实际为 ${coreNode}`)
  }

  const expectedExample = {
    '@lynx-js/rspeedy': '0.17.2',
    '@lynx-js/react-rsbuild-plugin': '0.20.2',
    '@lynx-js/react': '0.126.1',
    'tailwindcss': '4.3.3',
  }
  for (const [name, expected] of Object.entries(expectedExample)) {
    const actual = example.dependencies?.[name] ?? example.devDependencies?.[name]
    if (actual !== expected) {
      addFinding(findings, paths.example, `${name} 应为 ${expected}，实际为 ${actual}`)
    }
  }
}

function collectBaselineFacts(findings, baseline) {
  const android = baseline.environments?.android ?? {}
  const ios = baseline.environments?.ios ?? {}
  const facts = {
    verifiedAt: baseline.verifiedAt,
    catalogHash: baseline.catalogHash,
    tailwindcss: baseline.versions?.tailwindcss,
    lynxEngine: baseline.versions?.lynxEngine,
    engineVersion: baseline.versions?.engineVersion,
    cssDefines: baseline.versions?.cssDefines,
    android: android.deviceName,
    androidOs: android.osName,
    androidVersion: android.osVersion,
    androidAbi: android.abi,
    iosDevice: ios.deviceName,
    iosOs: ios.osName,
    iosVersion: ios.osVersion,
    iosAbi: ios.abi,
  }
  const required = []
  for (const [name, value] of Object.entries(facts)) {
    if (typeof value !== 'string' || !value.trim()) {
      addFinding(findings, paths.baseline, `${name} 缺少有效的基线事实`)
    }
    else {
      required.push(value)
    }
  }
  if (!Number.isInteger(android.apiLevel) || android.apiLevel <= 0) {
    addFinding(findings, paths.baseline, 'androidApi 缺少有效的基线事实')
  }
  else {
    required.push(`API ${android.apiLevel}`)
  }
  return required
}

function checkWorkflowFacts(findings, workflow) {
  const required = [
    'runs-on: ubuntu-latest',
    'api-level: 30',
    'arch: x86_64',
    'profile: pixel_2',
    'runs-on: macos-15',
    `xcrun simctl create LynxCompatibility 'iPhone 16 Pro' 'com.apple.CoreSimulator.SimRuntime.iOS-18-5'`,
  ]
  for (const expected of required) {
    requireText(findings, paths.workflow, workflow, expected)
  }
}

export function collectLynxContractFindings({ readFile = file => fs.readFileSync(file, 'utf8') } = {}) {
  const findings = []
  const readJson = file => JSON.parse(readFile(file))
  const adapter = readJson(paths.adapter)
  const core = readJson(paths.core)
  const example = readJson(paths.example)
  const baseline = readJson(paths.baseline)
  const workflow = readFile(paths.workflow)
  checkPackageFacts(findings, adapter, core, example)
  const baselineFacts = collectBaselineFacts(findings, baseline)
  checkWorkflowFacts(findings, workflow)

  const sources = new Map(docPaths.map(file => [file, readFile(file)]))
  const commonFacts = [
    '0.4.4',
    '>=22.12.0',
    '5.6.3',
    '^22.18.0 || >=24.11.0',
    '0.17.2',
    '0.20.2',
    '0.126.1',
    'Pixel 2',
    'iPhone 16 Pro',
    ...baselineFacts,
    'capture-only',
  ]
  for (const [file, source] of sources) {
    for (const expected of commonFacts) {
      requireText(findings, file, source, expected)
    }
    requireText(findings, file, source, 'diagnostics')
    requireText(findings, file, source, 'var()')
  }
  const configDocs = docPaths.filter(file => file.endsWith(`${path.sep}config${path.sep}react-lynx.md`))
  for (const file of configDocs) {
    const source = sources.get(file)
    requireText(findings, file, source, 'strict')
    requireText(findings, file, source, 'unknown')
  }
  return findings
}

export function main() {
  const findings = collectLynxContractFindings()
  if (findings.length > 0) {
    console.error('Lynx 文档与运行契约不一致：')
    console.error(findings.join('\n'))
    return 1
  }
  console.log('Lynx documentation contract check passed.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

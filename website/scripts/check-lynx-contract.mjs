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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

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

function checkBaselineFacts(findings, baseline) {
  const expected = {
    verifiedAt: '2026-10-06T01:38:07.800Z',
    catalogHash: 'a8c3b45f993d9aa28782f308fc959a09e160d67a9097d11b1bc6a8a38b93c886',
    tailwindcss: '4.3.3',
    lynxEngine: '4.0.1',
    engineVersion: '3.9',
    cssDefines: '0.0.16',
  }
  for (const [name, value] of Object.entries(expected)) {
    const actual = name in baseline ? baseline[name] : baseline.versions?.[name]
    if (actual !== value) {
      addFinding(findings, paths.baseline, `${name} 应为 ${value}，实际为 ${actual}`)
    }
  }
  const android = baseline.environments?.android ?? {}
  const ios = baseline.environments?.ios ?? {}
  for (const [name, value] of Object.entries({
    android: 'sdk_gphone_arm64',
    androidOs: 'Android 11',
    androidApi: 30,
    androidAbi: 'arm64-v8a',
    iosDevice: 'iPhone 17 Pro iOS 26.5',
    iosOs: 'iOS',
    iosVersion: '26.5',
    iosAbi: 'arm64',
  })) {
    const actual = name === 'android'
      ? android.deviceName
      : name === 'androidOs'
        ? `${android.osName} ${android.osVersion}`
        : name === 'androidApi'
          ? android.apiLevel
          : name === 'androidAbi'
            ? android.abi
            : name === 'iosDevice'
              ? ios.deviceName
              : name === 'iosOs'
                ? ios.osName
                : name === 'iosVersion'
                  ? ios.osVersion
                  : ios.abi
    if (actual !== value) {
      addFinding(findings, paths.baseline, `${name} 应为 ${value}，实际为 ${actual}`)
    }
  }
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
  const adapter = readJson(paths.adapter)
  const core = readJson(paths.core)
  const example = readJson(paths.example)
  const baseline = readJson(paths.baseline)
  const workflow = readFile(paths.workflow)
  checkPackageFacts(findings, adapter, core, example)
  checkBaselineFacts(findings, baseline)
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
    '4.3.3',
    '4.0.1',
    '3.9',
    '0.0.16',
    'Pixel 2',
    'iPhone 16 Pro',
    'iPhone 17 Pro',
    'sdk_gphone_arm64',
    '2026-10-06T01:38:07.800Z',
    'a8c3b45f993d9aa28782f308fc959a09e160d67a9097d11b1bc6a8a38b93c886',
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

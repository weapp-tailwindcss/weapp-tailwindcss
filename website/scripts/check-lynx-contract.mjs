import fs from 'node:fs'
import { findPackageJSON } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getWorkspacePackages } from 'repoctl'
import semver from 'semver'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(scriptDirectory, '..')
const repoRoot = path.resolve(websiteRoot, '..')

const workspaceManifests = new Map((await getWorkspacePackages(repoRoot)).map(pkg => [pkg.manifest.name, path.join(pkg.rootDir, 'package.json')]))

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

function checkPackageFacts(findings, adapter, core, example, readJson, resolveManifest) {
  const node = adapter.engines?.node
  if (!semver.validRange(node)) {
    addFinding(findings, paths.adapter, 'Node engines 必须为有效范围')
    return
  }
  const visited = new Set()
  function checkMandatory(file, manifest) {
    if (visited.has(file)) {
      return
    }
    visited.add(file)
    const required = manifest.engines?.node
    if (required && (!semver.validRange(required) || !semver.subset(node, required))) {
      addFinding(findings, paths.adapter, `Node ${node} 超出必装依赖 ${manifest.name} 的 ${required}`)
    }
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (Object.hasOwn(manifest.optionalDependencies ?? {}, name)) {
        continue
      }
      try {
        const dependencyFile = resolveManifest(name, file, manifest.dependencies[name])
        if (!dependencyFile) {
          throw new Error('找不到 metadata')
        }
        checkMandatory(dependencyFile, readJson(dependencyFile))
      }
      catch (error) {
        addFinding(findings, file, `无法检查必装依赖 ${name}：${error.message}`)
      }
    }
  }
  checkMandatory(paths.adapter, adapter)

  for (const [name, minimum] of Object.entries({
    '@lynx-js/rspeedy': '>=0.16.0',
    '@lynx-js/react-rsbuild-plugin': '>=0.12.4',
    'tailwindcss': '>=4.0.0',
  })) {
    const range = adapter.peerDependencies?.[name]
    if (!range || !semver.validRange(range) || !semver.subset(range, minimum)) {
      addFinding(findings, paths.adapter, `${name} peer 必须满足最低契约 ${minimum}`)
    }
    const actual = example.dependencies?.[name] ?? example.devDependencies?.[name]
    if (!actual || !semver.satisfies(actual, range ?? '<0')) {
      addFinding(findings, paths.example, `${name} ${actual} 不满足 adapter peer ${range}`)
    }
  }
  if (!adapter.dependencies?.[core.name] || Object.hasOwn(adapter.optionalDependencies ?? {}, core.name)) {
    addFinding(findings, paths.adapter, '缺少必装核心依赖')
  }
  if (adapter.peerDependenciesMeta?.['@lynx-js/react-rsbuild-plugin']?.optional !== true) {
    addFinding(findings, paths.adapter, 'builder peer 必须保留 optional 安装语义')
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

export function collectLynxContractFindings({
  readFile = file => fs.readFileSync(file, 'utf8'),
  resolveManifest = (name, owner, specifier) => specifier.startsWith('workspace:')
    ? workspaceManifests.get(name)
    : findPackageJSON(name, pathToFileURL(fs.realpathSync(owner)).href),
} = {}) {
  const findings = []
  const readJson = file => JSON.parse(readFile(file))
  const adapter = readJson(paths.adapter)
  const core = readJson(paths.core)
  const example = readJson(paths.example)
  const baseline = readJson(paths.baseline)
  const workflow = readFile(paths.workflow)
  checkPackageFacts(findings, adapter, core, example, readJson, resolveManifest)
  const baselineFacts = collectBaselineFacts(findings, baseline)
  checkWorkflowFacts(findings, workflow)

  const sources = new Map(docPaths.map(file => [file, readFile(file)]))
  const commonFacts = [
    adapter.version,
    adapter.engines.node,
    core.version,
    core.engines.node,
    example.devDependencies['@lynx-js/rspeedy'],
    example.dependencies?.['@lynx-js/react-rsbuild-plugin'] ?? example.devDependencies?.['@lynx-js/react-rsbuild-plugin'],
    example.dependencies?.['@lynx-js/react'] ?? example.devDependencies?.['@lynx-js/react'],
    example.dependencies?.tailwindcss ?? example.devDependencies?.tailwindcss,
    '@lynx-js/react-rsbuild-plugin',
    adapter.peerDependencies['@lynx-js/react-rsbuild-plugin'],
    '>=3.6',
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
    requireText(findings, file, source, 'inline style')
    requireText(findings, file, source, 'stylesheet')
    if (/应用自定义变量不会被静态化|application (?:custom )?variables (?:are never|will not be) (?:inlined|statically resolved)/i.test(source)) {
      addFinding(findings, file, '存在无条件的应用变量静态化承诺')
    }
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

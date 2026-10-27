import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { verifyBinding } from '../../packages/weapp-tailwindcss/native/distribution.mjs'
import { bindingFileName, hostNativeTarget, nativeTargets } from '../../packages/weapp-tailwindcss/native/targets.mjs'
import { installPublishedNightly } from './installation/index.mjs'
import { nativeRoots } from './native-inputs.mjs'

const json = async file => JSON.parse(await readFile(file, 'utf8'))
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

async function writeConsumerReport(status, error) {
  const directory = path.join(process.env.RUNNER_TEMP, 'nightly-consumer-reports')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${process.env.NIGHTLY_EXPECTED_SUFFIX}-${process.versions.node}.json`), `${JSON.stringify({
    status,
    commit: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    suffix: process.env.NIGHTLY_EXPECTED_SUFFIX,
    node: process.versions.node,
    cssOnly: process.argv.includes('--css-only'),
    ...(error && { error: error.message }),
  }, null, 2)}\n`)
}

export function requirePublication(report, commit, env) {
  assert.equal(report.status, 'published', 'Nightly must be published before platform consumption')
  assert.equal(report.confirmed, true)
  assert.equal(report.consumer?.status, 'verified')
  assert.equal(report.repository, 'weapp-tailwindcss/weapp-tailwindcss')
  assert.equal(report.branch, 'main')
  assert.equal(report.commit, commit)
  assert.equal(report.buildId, `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`)
  assert.equal(report.snapshot?.identity?.commit, commit)
  assert.equal(report.snapshot?.identity?.buildId, `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`)
  assert.equal(report.snapshot?.preparation?.commit, commit)
  assert.equal(report.snapshot?.preparation?.tree, report.snapshot?.sourceTree)
  assert.ok(report.snapshot?.sourceTree, 'Nightly requires a verified source tree')
  assert.equal(report.snapshot?.tag, 'snapshot-nightly')
  assert.equal(report.snapshot?.registry, 'https://registry.npmjs.org/')
  assert.ok(report.packages?.length > 0)
  assert.equal(report.packages.length, report.snapshot.packages.length)
  assert.equal(new Set(report.packages.map(pkg => pkg.name)).size, report.packages.length)
  assert.equal(report.snapshot.preparation.metadata?.runId, env.GITHUB_RUN_ID)
  assert.equal(report.snapshot.preparation.metadata?.runAttempt, env.GITHUB_RUN_ATTEMPT)
  for (const pkg of report.packages) {
    assert.equal(pkg.published, true)
    assert.match(pkg.integrity ?? '', /^sha512-/)
    assert.equal(pkg.version, report.snapshot.packages.find(item => item.name === pkg.name)?.version)
  }
  return report
}

async function installedManifest(directory, name, expected) {
  const installed = await realpath(path.join(directory, 'node_modules', ...name.split('/')))
  const relative = path.relative(directory, installed)
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Nightly consumer resolved outside its isolated directory')
  const manifest = await json(path.join(installed, 'package.json'))
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, expected.version)
  return { installed, manifest }
}

function verifyAbi(require, name, cssOnly) {
  if (!cssOnly) {
    const core = require(name)
    assert.equal(typeof core.createJsTransformer, 'function')
    assert.equal(typeof core.jsRuntimeSignature, 'function')
    assert.ok(core.analyzeJs('const cls = "p-4"', 'js', 'module', false))
    assert.deepEqual([...core.tokenizeWxml('😀 {{中}}')], [0, 2, 0, 3, 8, 1, 3, 8])
    const transformer = core.createWxmlTransformer([{ character: '[', replacement: '_b' }, { character: ']', replacement: '_B' }])
    assert.equal(transformer.transformStatic('w-[1px]'), 'w-_b1px_B')
  }
  const css = require(`${name}/postcss`)
  assert.deepEqual(css.escapeClasses(['w-[1px]']), ['w-_b1px_B'])
  assert.equal(css.normalizeV4VariableFallbacks('var(--tw-x,)'), 'var(--tw-x, )')
  const selector = new css.SelectorRuleTransformer({ child: ['view'], removeHover: true, removeActive: false, removeFocus: false, uniAppX: false })
  assert.deepEqual(selector.transform(String.raw`.w-\[1px\]`), { selector: '.w-_b1px_B', remove: false, spacing: false })
}

async function main() {
  assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_SHA, 'Nightly consumer requires the original workflow identity')
  const report = requirePublication(await json(path.join(process.env.RUNNER_TEMP, 'nightly-publication', 'nightly-report.json')), process.env.GITHUB_SHA, process.env)
  const directory = path.join(process.env.RUNNER_TEMP, 'nightly-consumer')
  const target = hostNativeTarget()
  const { suffix } = nativeTargets[target]
  assert.equal(suffix, process.env.NIGHTLY_EXPECTED_SUFFIX, 'Nightly consumer host differs from its matrix platform')
  const name = `@weapp-tailwindcss/native-${suffix}`
  const names = ['weapp-tailwindcss', '@weapp-tailwindcss/postcss', name]
  const expected = new Map(names.map((name) => {
    const pkg = report.packages.find(pkg => pkg.name === name)
    assert.ok(pkg, `Nightly omitted required consumer package ${name}`)
    return [name, pkg]
  }))
  if (process.argv.includes('--install')) {
    await mkdir(directory)
    const { packageManager } = await json(path.join(source, 'package.json'))
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', packageManager, dependencies: Object.fromEntries([...expected].map(([name, pkg]) => [name, pkg.version])) }))
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), JSON.stringify({ packages: [], minimumReleaseAgeExclude: report.packages.map(pkg => `${pkg.name}@${pkg.version}`) }))
    await installPublishedNightly(report, directory, path.join(process.env.RUNNER_TEMP, 'nightly-consumer-reports', `${suffix}-install.json`))
  }
  const snapshotMetadata = { ...report.snapshot.identity, identityKey: report.snapshot.identityKey, tag: report.snapshot.tag }
  const installed = new Map()
  for (const [name, pkg] of expected) {
    const result = await installedManifest(directory, name, pkg)
    assert.deepEqual(result.manifest.repoctlSnapshot, snapshotMetadata, 'Nightly package has another build identity')
    installed.set(name, result)
  }
  for (const consumer of ['weapp-tailwindcss', '@weapp-tailwindcss/postcss']) {
    assert.equal(installed.get(consumer).manifest.optionalDependencies[name], expected.get(name).version, 'Nightly optional dependency must be the exact batch version')
  }
  const platform = installed.get(name)
  const roots = nativeRoots(source)
  for (const [kernel, root] of Object.entries(roots)) {
    const filename = bindingFileName(suffix, kernel)
    const binding = path.join(platform.installed, filename)
    const metadata = await json(path.join(platform.installed, kernel === 'core' ? 'native-metadata.json' : 'postcss-native-metadata.json'))
    const version = expected.get(kernel === 'core' ? 'weapp-tailwindcss' : '@weapp-tailwindcss/postcss').version
    verifyBinding(target, binding, metadata, root, kernel, version)
    const receipt = report.snapshot.preparation.files.find(file => file.path === `packages-native/${suffix}/${filename}`)
    assert.ok(receipt, 'Published binary is missing from the source preparation receipt')
    assert.equal(createHash('sha256').update(await readFile(binding)).digest('hex'), receipt.sha256, 'Published binary differs from its preparation receipt')
  }
  assert.deepEqual(await readFile(path.join(platform.installed, 'THIRD_PARTY_LICENSES.txt')), await readFile(path.join(roots.postcss, 'THIRD_PARTY_LICENSES.txt')))
  verifyAbi(createRequire(path.join(directory, 'package.json')), name, process.argv.includes('--css-only'))
  await writeConsumerReport('verified')
  console.log(`Verified npm nightly ${report.buildId}: ${suffix}, Node ${process.versions.node}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (error) => {
    console.error(error)
    process.exitCode = 1
    if (process.env.RUNNER_TEMP) {
      await writeConsumerReport('failed', error)
    }
  })
}

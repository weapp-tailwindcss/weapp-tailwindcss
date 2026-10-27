import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { metadataFile, sourceDigest, stageBinding, thirdPartyLicenseFile, verifyBinding, verifyDistribution } from '../../packages/weapp-tailwindcss/native/distribution.mjs'
import { bindingFileName, nativeTargets } from '../../packages/weapp-tailwindcss/native/targets.mjs'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

export function nativeRoots(root) {
  return {
    core: path.join(root, 'packages', 'weapp-tailwindcss', 'native'),
    postcss: path.join(root, 'packages', 'postcss', 'native'),
  }
}

function inputFile(root, ...segments) {
  let current = path.resolve(root)
  assert.ok(lstatSync(current).isDirectory(), 'Native input root must be a real directory')
  for (const segment of segments) {
    assert.ok(segment && segment !== '.' && segment !== '..' && !/[\\/]/.test(segment), 'Invalid native input path segment')
    current = path.join(current, segment)
    const stat = lstatSync(current)
    assert.ok(!stat.isSymbolicLink(), 'Native inputs must not contain symbolic links')
  }
  assert.ok(lstatSync(current).isFile(), 'Native input must be a regular file')
  return current
}

function bindingInput(root, suffix, kernel, metadata = false) {
  const filename = `${bindingFileName(suffix, kernel)}${metadata ? '.json' : ''}`
  return inputFile(root, kernel === 'core' ? 'weapp-tailwindcss' : 'postcss', 'native', 'bindings', filename)
}

/** 在已完成 ABI 验证的准确 checkout 中生成同轮产物清单。 */
export function writeNativeInput(root, target, env = process.env) {
  assert.ok(nativeTargets[target], 'Native input requires a supported target')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const commit = git('rev-parse', 'HEAD')
  const tree = git('rev-parse', 'HEAD^{tree}')
  assert.match(commit, /^[a-f0-9]{40}$/)
  assert.match(tree, /^[a-f0-9]{40}$/)
  const { suffix } = nativeTargets[target]
  const roots = nativeRoots(root)
  const records = Object.entries(roots).map(([kernel, directory]) => {
    const binding = path.join(directory, 'bindings', bindingFileName(suffix, kernel))
    const metadata = readJson(`${binding}.json`)
    verifyBinding(target, binding, metadata, directory, kernel)
    return { kernel, metadata, metadataSha256: sha256(`${binding}.json`) }
  })
  const result = {
    schema: 1,
    commit,
    tree,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    target,
    suffix,
    licenseSha256: sha256(path.join(roots.postcss, thirdPartyLicenseFile)),
    records,
  }
  assert.match(result.runId ?? '', /^\d+$/, 'Native input requires a workflow run ID')
  assert.match(result.runAttempt ?? '', /^[1-9]\d*$/, 'Native input requires a workflow attempt')
  writeJson(path.join(roots.core, 'bindings', `native-input-${suffix}.json`), result)
  return result
}

/** 先核对全部原始证据，再向隔离源码复制二进制并重标 snapshot 元数据。 */
export function prepareNativeSource(context, inputRoot, env = process.env) {
  const roots = nativeRoots(context.directory)
  const versions = Object.fromEntries(Object.entries(roots).map(([kernel, directory]) => {
    const manifest = readJson(path.join(directory, '..', 'package.json'))
    const pkg = context.packages.find(pkg => pkg.name === manifest.name)
    assert.ok(pkg && pkg.version === manifest.version, 'Snapshot package identity differs from its manifest')
    return [kernel, pkg]
  }))
  const pending = []
  for (const [target, { suffix }] of Object.entries(nativeTargets)) {
    const sidecar = inputFile(inputRoot, 'weapp-tailwindcss', 'native', 'bindings', `native-input-${suffix}.json`)
    const record = readJson(sidecar)
    assert.equal(record.schema, 1)
    assert.equal(record.commit, context.identity.commit, 'Native input commit differs from snapshot source')
    assert.equal(record.tree, context.tree, 'Native input tree differs from snapshot source')
    assert.equal(record.runId, env.GITHUB_RUN_ID, 'Native input belongs to another workflow run')
    assert.equal(record.runAttempt, env.GITHUB_RUN_ATTEMPT, 'Native input belongs to another workflow attempt')
    assert.equal(record.target, target)
    assert.equal(record.suffix, suffix)
    assert.equal(record.licenseSha256, sha256(path.join(roots.postcss, thirdPartyLicenseFile)), 'Native license differs from source')
    assert.deepEqual(record.records?.map(item => item.kernel).sort(), ['core', 'postcss'])
    for (const [kernel, directory] of Object.entries(roots)) {
      const input = bindingInput(inputRoot, suffix, kernel)
      const metadataInput = bindingInput(inputRoot, suffix, kernel, true)
      const metadata = readJson(metadataInput)
      const evidence = record.records.find(item => item.kernel === kernel)
      assert.deepEqual(metadata, evidence.metadata, 'Native metadata differs from producer evidence')
      assert.equal(sha256(metadataInput), evidence.metadataSha256, 'Native metadata hash differs from producer evidence')
      verifyBinding(target, input, metadata, directory, kernel, versions[kernel].currentVersion)
      assert.equal(metadata.sourceDigest, sourceDigest(directory))
      pending.push({ target, suffix, kernel, directory, input, metadata })
    }
  }
  const files = []
  for (const { target, suffix, kernel, directory, input, metadata } of pending) {
    const binding = path.join(directory, 'bindings', bindingFileName(suffix, kernel))
    mkdirSync(path.dirname(binding), { recursive: true })
    copyFileSync(input, binding)
    writeJson(`${binding}.json`, { ...metadata, version: versions[kernel].version })
    stageBinding(target, directory, context.directory, kernel)
    files.push(binding, `${binding}.json`, path.join(context.directory, 'packages-native', suffix, bindingFileName(suffix, kernel)), path.join(context.directory, 'packages-native', suffix, metadataFile(kernel)))
    if (kernel === 'postcss') {
      files.push(path.join(context.directory, 'packages-native', suffix, thirdPartyLicenseFile))
    }
  }
  verifyDistribution(roots, context.directory)
  return {
    files: files.map(file => ({ path: path.relative(context.directory, file).split(path.sep).join('/'), sha256: sha256(file) })),
    metadata: {
      commit: context.identity.commit,
      tree: context.tree,
      runId: env.GITHUB_RUN_ID,
      runAttempt: env.GITHUB_RUN_ATTEMPT,
      corePreviousVersion: versions.core.currentVersion,
      coreVersion: versions.core.version,
      postcssPreviousVersion: versions.postcss.currentVersion,
      postcssVersion: versions.postcss.version,
    },
  }
}

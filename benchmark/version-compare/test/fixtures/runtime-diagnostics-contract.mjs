import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertBoundWorkerModule, bindingFilePath, driverModulePaths, verifyRuntimeBinding } from '../../scripts/runtime-diagnostics/binding.mjs'
import { digestBytes, readBoundedFile, readRuntimeControlFile, runtimeArtifactPath, sameRuntimePath } from '../../scripts/runtime-diagnostics/bounded-file.mjs'
import { runtimeProject } from '../../scripts/runtime-diagnostics/request.mjs'

const driverRoot = fs.realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)))
const acceptanceFile = path.join(driverRoot, 'benchmark', 'version-compare', 'scripts', 'runtime-diagnostics', 'acceptance.mjs')
const toLogicalPath = value => value.split(path.sep).join('/')
function receipt(root, file) {
  const bytes = readBoundedFile(file, {
    maximumBytes: 16 * 1024 * 1024,
  })
  return {
    relativePath: toLogicalPath(path.relative(root, file)),
    bytes: bytes.length,
    sha256: digestBytes(bytes),
  }
}

/** 假 tree/commit 仅用于协议 fixture；真实来源必须由准备 adapter 从 Git 取得。 */
export function makeFixtureRuntimeBinding(root, productFiles, sourceCommit = 'b'.repeat(40)) {
  root = fs.realpathSync(root)
  const files = [...new Set([...productFiles, path.join(root, 'pnpm-lock.yaml')])].map(file => receipt(root, file))
  return {
    schemaVersion: 1,
    product: {
      sourceCommit,
      sourceTree: 'd'.repeat(40),
      root,
      files,
    },
    lock: files.find(file => file.relativePath === 'pnpm-lock.yaml'),
    driver: {
      sourceCommit: 'c'.repeat(40),
      sourceTree: 'e'.repeat(40),
      root: driverRoot,
      files: driverModulePaths.map(name => receipt(driverRoot, bindingFilePath(driverRoot, name))),
    },
  }
}
function descriptorFixture(root) {
  const file = path.join(root, '中文 space.txt')
  fs.writeFileSync(file, 'data')
  assert.equal(readBoundedFile(file, {
    maximumBytes: 4,
  }).toString(), 'data')
  assert.throws(() => readBoundedFile(file, {
    maximumBytes: 3,
  }), /读取上限/)
  assert.throws(() => readBoundedFile(root, {
    maximumBytes: 4,
  }), /普通文件/)
  const budget = {
    bytes: 0,
    maximumBytes: 7,
  }
  readBoundedFile(file, {
    maximumBytes: 4,
    budget,
  })
  assert.throws(() => readBoundedFile(file, {
    maximumBytes: 4,
    budget,
  }), /读取上限/)
  let closed = 0
  let requested = 0
  const growing = {
    ...fs,
    readSync(fd, buffer, offset, length, position) {
      requested += length
      fs.appendFileSync(file, 'x'.repeat(1024 * 1024))
      return fs.readSync(fd, buffer, offset, length, position)
    },
    closeSync(fd) {
      closed++
      fs.closeSync(fd)
    },
  }
  assert.throws(() => readBoundedFile(file, {
    maximumBytes: 4,
  }, growing), /读取时增长/)
  assert.equal(requested, 5)
  assert.equal(closed, 1)
  fs.writeFileSync(file, 'data')
  const replaced = {
    ...fs,
    openSync(name, flags) {
      fs.renameSync(name, path.join(root, 'old.txt'))
      fs.writeFileSync(name, 'data')
      return fs.openSync(name, flags)
    },
  }
  assert.throws(() => readBoundedFile(file, {
    maximumBytes: 4,
  }, replaced), /打开时被替换/)
  const controlFile = path.join(root, 'command.json')
  fs.writeFileSync(controlFile, 'old')
  let opens = 0
  const rotating = {
    ...fs,
    openSync(name, flags) {
      if (++opens === 1) {
        fs.renameSync(name, path.join(root, 'command.previous.json'))
        fs.writeFileSync(name, 'new')
      }
      return fs.openSync(name, flags)
    },
  }
  assert.equal(readRuntimeControlFile(controlFile, rotating).toString(), 'new')
  assert.equal(opens, 2)
  const badClose = {
    ...fs,
    closeSync(fd) {
      fs.closeSync(fd)
      throw new Error('fixture-close-failure')
    },
  }
  assert.throws(() => readBoundedFile(file, {
    maximumBytes: 4,
    receipt: {
      bytes: 4,
      sha256: '0'.repeat(64),
    },
  }, badClose), error => error instanceof AggregateError && /哈希或尺寸/.test(error.cause.message) && error.errors[1].message === 'fixture-close-failure')
  for (const name of ['.', '..', '../escape', '/escape', 'C:\\escape', 'C:escape', 'a\\b']) {
    assert.throws(() => runtimeArtifactPath(root, name))
    assert.throws(() => bindingFilePath(root, name))
  }
  assert.equal(bindingFilePath(root, 'nested/input.txt'), path.join(root, 'nested', 'input.txt'))
}
function makeVersion(root, role) {
  root = path.join(root, role)
  fs.mkdirSync(root)
  const runner = path.join(root, 'runner.mjs')
  fs.writeFileSync(runner, 'export const fixture = true\n')
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n')
  const sourceCommit = (role === 'base' ? 'a' : 'b').repeat(40)
  return {
    root,
    version: `${role}:fixture`,
    diagnosticIdentity: {
      role,
      sourceCommit,
      sourceWorkingTreeStatus: '',
      binding: makeFixtureRuntimeBinding(root, [runner], sourceCommit),
    },
  }
}
function bindingFixture(root) {
  const version = makeVersion(root, 'current')
  const binding = version.diagnosticIdentity.binding
  const expected = {
    root: version.root,
    sourceCommit: version.diagnosticIdentity.sourceCommit,
    sourceTree: binding.product.sourceTree,
    driverModule: {
      relativePath: 'benchmark/version-compare/scripts/runtime-diagnostics/acceptance.mjs',
      file: acceptanceFile,
    },
  }
  const verified = verifyRuntimeBinding(binding, expected)
  assert.equal(verified.lockSha256, binding.lock.sha256)
  assert.throws(() => assertBoundWorkerModule(binding, 'preload.mjs', Buffer.from('changed-copy')), /helper 与 driver/)
  assert.throws(() => verifyRuntimeBinding(binding, {
    ...expected,
    sourceTree: 'f'.repeat(40),
  }), /tree 身份/)
  assert.throws(() => verifyRuntimeBinding(binding, {
    ...expected,
    driverModule: {
      ...expected.driverModule,
      file: path.join(root, 'fake-driver.mjs'),
    },
  }), /实际 driver/)
  const changedDriver = structuredClone(binding)
  changedDriver.driver.files[0].sha256 = 'f'.repeat(64)
  assert.throws(() => verifyRuntimeBinding(changedDriver, expected), /哈希或尺寸/)
  fs.appendFileSync(path.join(version.root, 'pnpm-lock.yaml'), '# changed\n')
  assert.throws(() => verifyRuntimeBinding(binding, expected), /哈希或尺寸/)
}
function memoryFixture() {
  return {
    count: 1,
    baselineRssMb: 4,
    peakRssMb: 4,
    steadyRssMb: 4,
    steadyGrowthPct: 0,
    samples: [{
      at: Date.now(),
      rssMb: 4,
      processCount: 1,
      processes: [{
        pid: process.pid,
        ppid: process.ppid,
        rssMb: 4,
        command: 'synthetic-rss-contract-fixture',
      }],
    }],
  }
}
function acceptanceFixture(root, mode) {
  const versions = ['base', 'current'].map(role => makeVersion(root, role))
  const report = {
    diagnosticOnly: true,
    budgetAcceptance: false,
    options: {
      buildRuns: 3,
      hmrRuns: 3,
    },
    versions,
    selectedProjectKeys: [runtimeProject],
    rows: versions.map(version => ({
      version: version.version,
      root: version.root,
      key: runtimeProject,
      buildMode: 'build',
      hmrMode: 'watch',
      buildMs: [1, 2, 3],
      hmrMs: [1, 2, 3],
      buildMemorySamples: [1, 2, 3].map(run => ({
        run,
        durationMs: run,
        memory: memoryFixture(),
      })),
      hmrMemory: memoryFixture(),
    })),
  }
  if (mode === 'matrix-row-error') {
    report.rows[0].error = 'fixture-first-failure'
  }
  if (mode === 'matrix-zero-build-rss') {
    report.rows[0].buildMemorySamples[1].memory = {
      count: 0,
      samples: [],
    }
  }
  if (mode === 'matrix-zero-hmr-rss') {
    report.rows[1].hmrMemory = {
      count: 0,
      samples: [],
    }
  }
  const rawFile = path.join(root, 'matrix-raw.json')
  const versionsFile = path.join(root, 'expected-versions.json')
  const raw = `${JSON.stringify(report)}\n`
  fs.writeFileSync(rawFile, raw)
  fs.writeFileSync(versionsFile, JSON.stringify(versions))
  const result = spawnSync(process.execPath, [acceptanceFile, rawFile, versionsFile], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, mode === 'matrix-valid' ? 0 : 1, result.stderr)
  assert.equal(fs.readFileSync(rawFile, 'utf8'), raw)
  if (mode === 'matrix-valid') {
    assert.equal(JSON.parse(result.stdout).hmrRuns, 3)
  }
  else {
    assert.match(result.stderr, mode === 'matrix-row-error' ? /fixture-first-failure/ : /RSS 零样本/)
  }
}
if (process.argv[1] && sameRuntimePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-contract-fixture-')))
  try {
    const mode = process.argv[2]
    if (mode === 'descriptor') {
      descriptorFixture(root)
    }
    else if (mode === 'binding') {
      bindingFixture(root)
    }
    else if (['matrix-valid', 'matrix-row-error', 'matrix-zero-build-rss', 'matrix-zero-hmr-rss'].includes(mode)) {
      acceptanceFixture(root, mode)
    }
    else {
      throw new Error(`未知 fixture：${mode}`)
    }
    process.stdout.write(`fixture:${mode}:ok\n`)
  }
  finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    })
  }
}

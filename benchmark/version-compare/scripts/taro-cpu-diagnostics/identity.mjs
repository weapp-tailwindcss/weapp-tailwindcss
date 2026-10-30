import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

export const taroProject = 'demo/taro-webpack-react-tailwindcss-v4'
export const limits = Object.freeze({
  inputFileBytes: 16 * 1024 * 1024,
  logBytesPerStream: 8 * 1024 * 1024,
  profilesBytes: 64 * 1024 * 1024,
  loadedManifestBytes: 8 * 1024 * 1024,
  controllerBytes: 2 * 1024 * 1024,
  runArtifactBytes: 96 * 1024 * 1024,
  profileFiles: 64,
  timeoutMs: 600000,
})
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function isInside(root, file) {
  const relative = path.relative(root, file)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
export async function readBounded(file, maximum = limits.inputFileBytes) {
  const handle = await fs.open(file, 'r')
  let primaryError
  let value
  try {
    const stat = await handle.stat({
      bigint: true,
    })
    if (!stat.isFile() || stat.size > BigInt(maximum)) {
      throw new Error(`诊断文件类型或固定上限失败：${file}`)
    }
    const bytes = Buffer.alloc(Number(stat.size))
    let length = 0
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null)
      if (result.bytesRead === 0) {
        break
      }
      length += result.bytesRead
    }
    const after = await handle.stat({
      bigint: true,
    })
    if (length !== bytes.length || after.size !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino || after.mtimeNs !== stat.mtimeNs || after.ctimeNs !== stat.ctimeNs) {
      throw new Error(`诊断文件在有界读取期间变化：${file}`)
    }
    value = bytes
  }
  catch (error) {
    primaryError = error
  }
  try {
    await handle.close()
  }
  catch (error) {
    if (!primaryError) {
      primaryError = error
    }
    else {
      primaryError.suppressed = [{
        stage: 'bounded-read-close',
        message: String(error.message ?? error),
      }]
    }
  }
  if (primaryError) {
    throw primaryError
  }
  return value
}
async function physicalDirectory(root, relative) {
  const requested = path.join(root, relative)
  const physical = await fs.realpath(requested)
  if (!isInside(root, physical) || !(await fs.stat(physical)).isDirectory()) {
    throw new Error(`依赖目录不属于 prepared root：${requested} -> ${physical}`)
  }
  return {
    requested,
    physical,
  }
}
async function fileIdentity(root, requested, expectedSha256) {
  const physical = await fs.realpath(requested)
  if (!isInside(root, physical)) {
    throw new Error(`文件身份越过 prepared root：${requested}`)
  }
  const bytes = await readBounded(physical)
  const actual = sha256(bytes)
  if (expectedSha256 && actual !== expectedSha256) {
    throw new Error(`文件 SHA256 与准备凭证不符：${requested}`)
  }
  return {
    requested,
    physical,
    bytes: bytes.length,
    sha256: actual,
  }
}
async function assertNoRootGit(root) {
  try {
    await fs.lstat(path.join(root, '.git'))
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`诊断只接受无 Git 元数据的 prepared root：${root}`)
}
export async function prepareRole(role) {
  if (!role || !['base', 'current'].includes(role.role)) {
    throw new Error('诊断 role 仅允许 base/current')
  }
  if (!/^[a-f0-9]{40}$/.test(role.sourceCommit ?? '')) {
    throw new Error('sourceCommit 必须为完整 40 位小写 SHA')
  }
  for (const key of ['lockSha256', 'runnerSha256']) {
    if (!/^[a-f0-9]{64}$/.test(role[key] ?? '')) {
      throw new Error(`${key} 必须由准备阶段提供完整 SHA256`)
    }
  }
  if (typeof role.root !== 'string' || !path.isAbsolute(role.root)) {
    throw new Error('prepared root 必须是绝对路径')
  }
  const root = await fs.realpath(role.root)
  await assertNoRootGit(root)
  const lock = await fileIdentity(root, path.join(root, 'pnpm-lock.yaml'), role.lockSha256)
  const runner = await fileIdentity(root, path.join(root, 'scripts', 'taro-build-runner.mjs'), role.runnerSha256)
  const project = await physicalDirectory(root, path.join('demo', 'taro-webpack-react-tailwindcss-v4'))
  const dependencyDirectories = await Promise.all([physicalDirectory(root, 'node_modules'), physicalDirectory(root, path.join('node_modules', '.pnpm')), physicalDirectory(root, path.join('node_modules', '.bin')), physicalDirectory(root, path.join('demo', 'taro-webpack-react-tailwindcss-v4', 'node_modules')), physicalDirectory(root, path.join('demo', 'taro-webpack-react-tailwindcss-v4', 'node_modules', '.bin'))])
  const commandEntries = []
  for (const directory of dependencyDirectories.filter(item => path.basename(item.requested) === '.bin')) {
    const names = await fs.readdir(directory.physical)
    if (names.length > 4096) {
      throw new Error('依赖命令入口超过固定上限')
    }
    for (const name of names) {
      const requested = path.join(directory.physical, name)
      const physical = await fs.realpath(requested)
      if (!isInside(root, physical)) {
        throw new Error(`命令入口借用了其他 checkout：${requested}`)
      }
      commandEntries.push({
        requested,
        physical,
      })
    }
  }
  const packageFile = path.join(project.physical, 'package.json')
  const projectPackage = await fileIdentity(root, packageFile)
  const require = createRequire(packageFile)
  const cliRequested = require.resolve('@tarojs/cli/bin/taro')
  const cli = await fileIdentity(root, cliRequested)
  const cliDirectory = await physicalDirectory(root, path.join('demo', 'taro-webpack-react-tailwindcss-v4', 'node_modules', '@tarojs', 'cli'))
  const cliPackage = await fileIdentity(root, path.join(cliDirectory.physical, 'package.json'))
  const metadataBytes = await readBounded(cliPackage.physical)
  if (sha256(metadataBytes) !== cliPackage.sha256) {
    throw new Error('CLI package 在校验期间变化')
  }
  const metadata = JSON.parse(metadataBytes.toString('utf8'))
  const declaredBin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.taro
  if (metadata.name !== '@tarojs/cli' || typeof declaredBin !== 'string' || (await fs.realpath(path.resolve(cliDirectory.physical, declaredBin))) !== cli.physical) {
    throw new Error('Taro CLI 包名与实际 bin 身份不一致')
  }
  return {
    role: role.role,
    root,
    sourceCommit: role.sourceCommit,
    sourceCommitEvidence: '调用方准备凭证；无 Git 副本本身不能证明与该提交的 tree 等价',
    lockSha256: lock.sha256,
    runnerSha256: runner.sha256,
    lock,
    runner,
    project: {
      key: taroProject,
      ...project,
      package: projectPackage,
    },
    dependencies: {
      directories: dependencyDirectories,
      commandEntries,
      cli: {
        ...cli,
        package: cliPackage,
        name: metadata.name,
        version: metadata.version,
      },
    },
  }
}
export async function prepareRequest({
  roles,
  outputDirectory,
  preloadFile,
  timeoutMs = limits.timeoutMs,
}) {
  if (!Array.isArray(roles) || roles.length !== 2 || new Set(roles.map(role => role?.role)).size !== 2) {
    throw new Error('诊断必须显式提供且仅提供 base/current 两个 prepared root')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > limits.timeoutMs) {
    throw new Error('诊断 timeout 超出固定范围')
  }
  const nodeOptions = process.env.NODE_OPTIONS ?? ''
  if (nodeOptions.length > 65536 || /--(?:require|import|cpu-prof|heap-prof|prof|inspect|expose-gc)|(?:^|\s)-r(?:\s|=|$)/.test(nodeOptions) || process.env.NODE_V8_COVERAGE?.trim()) {
    throw new Error('诊断不接受继承的 Node hook、覆盖率、主动 GC 或 profiler 配置')
  }
  const prepared = []
  for (const name of ['base', 'current']) {
    prepared.push(await prepareRole(roles.find(role => role.role === name)))
  }
  if (isInside(prepared[0].root, prepared[1].root) || isInside(prepared[1].root, prepared[0].root)) {
    throw new Error('base/current 必须使用互不嵌套的独立 prepared root')
  }
  const preload = await fs.realpath(preloadFile)
  const preloadBytes = await readBounded(preload)
  if (typeof outputDirectory !== 'string' || !path.isAbsolute(outputDirectory)) {
    throw new Error('输出必须是绝对路径')
  }
  const output = path.resolve(outputDirectory)
  const parent = await fs.realpath(path.dirname(output))
  const physicalOutput = path.join(parent, path.basename(output))
  if (prepared.some(role => isInside(role.root, physicalOutput))) {
    throw new Error('诊断证据目录必须在两个 prepared root 之外')
  }
  await fs.mkdir(physicalOutput)
  return {
    roles: prepared,
    nodeOptions,
    output: await fs.realpath(physicalOutput),
    preload: {
      physical: preload,
      sha256: sha256(preloadBytes),
      bytes: preloadBytes.length,
    },
    timeoutMs,
  }
}

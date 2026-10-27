import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { sha256 } from './evidence.mjs'
import { instrumentViteTailSource } from './vite-tail-instrumentation.mjs'
import { viteTailProject } from './vite-tail-observer.mjs'

export function isPathInside(root, file, paths = path) {
  const relative = paths.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}

async function inside(root, file) {
  const actual = await fs.realpath(file)
  if (!isPathInside(root, actual)) {
    throw new Error(`尾部诊断依赖路径逃逸准备副本：${file}`)
  }
  return actual
}

async function packageMetadata(root, require, name) {
  let directory = path.dirname(await inside(root, require.resolve(name)))
  while (isPathInside(root, directory)) {
    try {
      const file = await inside(root, path.join(directory, 'package.json'))
      const source = await fs.readFile(file, 'utf8')
      const json = JSON.parse(source)
      if (json.name === name) {
        return { directory, file, json, sha256: sha256(source) }
      }
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    if (directory === root) {
      break
    }
    directory = path.dirname(directory)
  }
  throw new Error(`尾部诊断无法确认包归属：${name}`)
}

async function moduleGraph(root, metadata) {
  const entry = metadata.json.exports?.['.']?.import
  if (typeof entry !== 'string') {
    throw new TypeError(`尾部诊断不认识 ESM 入口：${metadata.json.name}@${metadata.json.version}`)
  }
  const remaining = [path.resolve(metadata.directory, entry)]
  const sources = new Map()
  let bytes = 0
  while (remaining.length) {
    const file = await inside(root, remaining.pop())
    if (!isPathInside(metadata.directory, file)) {
      throw new Error('尾部诊断的相对 ESM 引用逃逸依赖包')
    }
    if (sources.has(file)) {
      continue
    }
    const stat = await fs.stat(file)
    bytes += stat.size
    if (sources.size >= 128 || stat.size > 8 * 1024 * 1024 || bytes > 32 * 1024 * 1024) {
      throw new Error('尾部诊断依赖图超过固定上限')
    }
    const source = await fs.readFile(file, 'utf8')
    sources.set(file, source)
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    if (ast.parseDiagnostics.length) {
      throw new Error(`尾部诊断依赖 AST 无法解析：${file}`)
    }
    for (const node of ast.statements) {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        remaining.push(path.resolve(path.dirname(file), specifier.text))
      }
    }
  }
  return sources
}

/** 安装后只替换副本内实际 ESM 依赖；rename 防止写穿 pnpm 硬链接。 */
export async function prepareViteTailDependencies(root, sourceRoot, evidenceDirectory, project) {
  if (project !== viteTailProject) {
    return
  }
  const realRoot = await fs.realpath(root)
  if (realRoot === await fs.realpath(sourceRoot)) {
    throw new Error('拒绝向源码工作树注入尾部依赖诊断')
  }
  try {
    await fs.access(path.join(realRoot, '.git'))
    throw new Error('尾部依赖诊断只允许无 Git 元数据的准备副本')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const projectPackage = await inside(realRoot, path.join(realRoot, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
  const runner = await packageMetadata(realRoot, createRequire(projectPackage), '@tarojs/vite-runner')
  const vite = await packageMetadata(realRoot, createRequire(runner.file), 'vite')
  const rollup = await packageMetadata(realRoot, createRequire(vite.file), 'rollup')
  const prepared = []
  for (const [kind, metadata, marker] of [['vite', vite, 'function buildReporterPlugin('], ['rollup', rollup, 'function handleGenerateWrite(']]) {
    const graph = await moduleGraph(realRoot, metadata)
    const matches = [...graph].filter(([, source]) => source.includes(marker))
    if (matches.length !== 1) {
      throw new Error(`尾部诊断实际 ESM 布局未知：${kind}，锚点文件数 ${matches.length}`)
    }
    const [file, original] = matches[0]
    const relative = path.relative(realRoot, file)
    prepared.push({ file, relative, original, ...instrumentViteTailSource(original, kind, relative) })
  }
  // 所有依赖、路径与 AST 均验证后才写入；不对共享硬链接原位写入。
  const staged = []
  try {
    for (const item of prepared) {
      const temporary = path.join(path.dirname(item.file), `.weapp-tail-diagnostic-${randomUUID()}.tmp`)
      staged.push(temporary)
      await fs.writeFile(temporary, item.source, { flag: 'wx', mode: (await fs.stat(item.file)).mode })
    }
    for (const [index, item] of prepared.entries()) {
      await fs.rename(staged[index], item.file)
    }
  }
  finally {
    await Promise.all(staged.map(file => fs.rm(file, { force: true })))
  }
  const manifest = {
    root: realRoot,
    packages: [runner, vite, rollup].map(item => ({ name: item.json.name, version: item.json.version, packageFile: path.relative(realRoot, item.file), packageSha256: item.sha256 })),
    files: prepared.map(item => ({ file: item.relative, anchor: item.anchor, originalSha256: sha256(item.original), instrumentedSha256: sha256(item.source) })),
    interpretation: '只插桩实际 ESM 入口静态引用到的依赖；不修改 CJS 路径、正式预算或 allocation 停止点。',
  }
  await fs.mkdir(evidenceDirectory, { recursive: true })
  await fs.writeFile(path.join(evidenceDirectory, 'tail-dependencies.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

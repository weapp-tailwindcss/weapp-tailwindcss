import fs from 'node:fs'
import { SourceMap } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { limits } from './constants.mjs'
import { rootRelativeKey, sha256 } from './evidence.mjs'

class MappingLimitError extends Error {}

export function allocationMappingScope(file, root, platform = process.platform) {
  const implementation = platform === 'win32' ? path.win32 : path.posix
  if (!implementation.isAbsolute(file) || !implementation.isAbsolute(root)) {
    return 'outside-prepared-root'
  }
  const relative = implementation.relative(root, file)
  if (relative === '..' || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative)) {
    return 'outside-prepared-root'
  }
  const segments = relative.split(implementation.sep)
  if (segments.some(segment => (platform === 'win32' ? segment.toLowerCase() : segment) === 'node_modules')) {
    return 'third-party-dependency'
  }
  return 'prepared-repository'
}

export function annotateAllocationFrames(profile, identity) {
  const files = new Map()
  const realRoot = fs.realpathSync(identity.root)
  const diagnosticRoots = [identity.sessionDirectory]
  if (fs.existsSync(identity.sessionDirectory)) {
    diagnosticRoots.push(fs.realpathSync(identity.sessionDirectory))
  }
  const moduleKey = (file) => {
    const key = rootRelativeKey(file, identity.root)
    return key === file ? rootRelativeKey(file, realRoot) : key
  }
  const frames = []
  const pending = [{ node: profile.head, diagnosticAncestor: false }]
  let mappingBytes = 0
  let mappingFiles = 0
  while (pending.length) {
    const { node, diagnosticAncestor } = pending.pop()
    const frame = node.callFrame
    const record = { nodeId: node.id, functionName: frame.functionName, originalUrl: frame.url, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber, diagnosticAllocation: diagnosticAncestor }
    frames.push(record)
    let file
    try {
      file = frame.url.startsWith('file:') ? fileURLToPath(frame.url) : frame.url
      if (!path.isAbsolute(file)) {
        record.attribution = frame.url.startsWith('node:') ? 'node-runtime' : 'unmapped-runtime'
        continue
      }
      record.moduleKey = moduleKey(file)
      record.diagnosticAllocation ||= diagnosticRoots.some(root => rootRelativeKey(file, root).startsWith('<root>/'))
      if (record.diagnosticAllocation) {
        record.attribution = 'diagnostic-observer'
        continue
      }
      record.mappingScope = allocationMappingScope(file, identity.root)
      if (record.mappingScope === 'outside-prepared-root') {
        record.mappingScope = allocationMappingScope(file, realRoot)
      }
      if (record.mappingScope !== 'prepared-repository') {
        // 保留完整依赖帧，但第三方源码及映射不消耗仓库归因的读取限额。
        record.attribution = 'unmapped-module'
        record.comparableAcrossBuilds = false
        continue
      }
      if (!files.has(file)) {
        const metadata = { sourceMap: undefined }
        files.set(file, metadata)
        try {
          // 实际文件边界也要校验，防止仓库内符号链接读取到外部依赖。
          const realFile = fs.realpathSync(file)
          metadata.mappingScope = allocationMappingScope(realFile, realRoot)
          if (metadata.mappingScope === 'prepared-repository') {
            if (++mappingFiles > limits.maxMappingFiles) {
              throw new MappingLimitError('栈映射模块数超过诊断上限')
            }
            const bytes = fs.statSync(realFile).size
            mappingBytes += bytes
            if (bytes > limits.maxProfileBytes || mappingBytes > limits.maxMappingBytes) {
              throw new MappingLimitError('栈模块超过诊断读取上限')
            }
            metadata.sha256 = sha256(fs.readFileSync(realFile))
            const mapFile = `${file}.map`
            if (fs.existsSync(mapFile)) {
              const realMapFile = fs.realpathSync(mapFile)
              metadata.sourceMapScope = allocationMappingScope(realMapFile, realRoot)
              if (metadata.sourceMapScope === 'prepared-repository') {
                const mapBytes = fs.statSync(realMapFile).size
                mappingBytes += mapBytes
                if (mapBytes > limits.maxProfileBytes || mappingBytes > limits.maxMappingBytes) {
                  throw new MappingLimitError('source map 超过诊断读取上限')
                }
                metadata.sourceMap = new SourceMap(JSON.parse(fs.readFileSync(realMapFile, 'utf8')))
              }
            }
          }
        }
        catch (error) {
          metadata.error = error
          throw error
        }
      }
      const metadata = files.get(file)
      if (metadata.error) {
        throw metadata.error
      }
      record.mappingScope = metadata.mappingScope
      record.sourceMapScope = metadata.sourceMapScope
      if (metadata.mappingScope !== 'prepared-repository') {
        record.attribution = 'unmapped-module'
        record.comparableAcrossBuilds = false
        continue
      }
      record.moduleSha256 = metadata.sha256
      const mapped = metadata.sourceMap?.findEntry(frame.lineNumber, frame.columnNumber)
      if (mapped?.originalSource) {
        const sourceFile = mapped.originalSource.startsWith('file:')
          ? fileURLToPath(mapped.originalSource)
          : path.resolve(path.dirname(file), mapped.originalSource)
        record.sourceKey = moduleKey(sourceFile)
        record.sourceLine = mapped.originalLine
        record.sourceColumn = mapped.originalColumn
        record.attribution = 'source-map'
      }
      else {
        // 没有源码映射的构建 hash 不能作为两侧函数不同的证据。
        record.attribution = 'unmapped-module'
        record.comparableAcrossBuilds = false
      }
    }
    catch (error) {
      if (error instanceof MappingLimitError) {
        throw error
      }
      record.attribution = 'unavailable'
      record.comparableAcrossBuilds = false
      record.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      pending.push(...node.children.map(child => ({ node: child, diagnosticAncestor: record.diagnosticAllocation })))
    }
  }
  return frames
}

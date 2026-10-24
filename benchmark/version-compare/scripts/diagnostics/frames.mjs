import fs from 'node:fs'
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { limits } from './constants.mjs'
import { rootRelativeKey, sha256 } from './evidence.mjs'

class MappingLimitError extends Error {}

export function annotateAllocationFrames(profile, identity) {
  const files = new Map()
  const diagnosticRoot = identity.sessionDirectory
  const frames = []
  const pending = [{ node: profile.head, diagnosticAncestor: false }]
  let mappingBytes = 0
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
      record.moduleKey = rootRelativeKey(file, identity.root)
      record.diagnosticAllocation ||= rootRelativeKey(file, diagnosticRoot).startsWith('<root>/')
      if (record.diagnosticAllocation) {
        record.attribution = 'diagnostic-observer'
        continue
      }
      if (!files.has(file)) {
        if (files.size >= limits.maxMappingFiles) {
          throw new MappingLimitError('栈映射模块数超过诊断上限')
        }
        const metadata = { sourceMap: undefined }
        files.set(file, metadata)
        try {
          const bytes = fs.statSync(file).size
          mappingBytes += bytes
          if (bytes > limits.maxProfileBytes || mappingBytes > limits.maxMappingBytes) {
            throw new MappingLimitError('栈模块超过诊断读取上限')
          }
          const source = fs.readFileSync(file)
          metadata.sha256 = sha256(source)
          const mapFile = `${file}.map`
          if (fs.existsSync(mapFile)) {
            const mapBytes = fs.statSync(mapFile).size
            mappingBytes += mapBytes
            if (mapBytes > limits.maxProfileBytes || mappingBytes > limits.maxMappingBytes) {
              throw new MappingLimitError('source map 超过诊断读取上限')
            }
            metadata.sourceMap = new SourceMap(JSON.parse(fs.readFileSync(mapFile, 'utf8')))
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
      record.moduleSha256 = metadata.sha256
      const mapped = metadata.sourceMap?.findEntry(frame.lineNumber, frame.columnNumber)
      if (mapped?.originalSource) {
        const sourceFile = mapped.originalSource.startsWith('file:')
          ? fileURLToPath(mapped.originalSource)
          : path.resolve(path.dirname(file), mapped.originalSource)
        record.sourceKey = rootRelativeKey(sourceFile, identity.root)
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

const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath, pathToFileURL } = require('node:url')

/** 只观察已加载 CJS 的包归属与来源图元数据。 */
exports.createSourceMetadata = function createSourceMetadata({ inside, same, limits, fail, read, digest }) {
  let sourceMaps = 0
  const names = new Set(['weapp-tailwindcss', '@weapp-tailwindcss/postcss', '@weapp-tailwindcss/engine', '@weapp-tailwindcss/css-compat', '@weapp-tailwindcss/source-scan', 'postcss', 'postcss-selector-parser', 'postcss-value-parser', 'webpack', '@tarojs/webpack5-runner', '@tarojs/taro-loader'])
  const metadata = new Map()
  function owner(file) {
    let directory = path.dirname(file)
    const visited = []
    while (inside(directory)) {
      if (metadata.has(directory)) {
        const result = metadata.get(directory)
        for (const key of visited) {
          metadata.set(key, result)
        }
        return result
      }
      if (metadata.size + visited.length >= limits.ownerDirectories) {
        fail('package owner directory limit exceeded')
      }
      visited.push(directory)
      const packageFile = path.join(directory, 'package.json')
      let packageExists = true
      try {
        fs.lstatSync(packageFile)
      }
      catch (error) {
        if (error.code === 'ENOENT') {
          packageExists = false
        }
        else {
          throw error
        }
      }
      if (packageExists) {
        if (!inside(fs.realpathSync(packageFile))) {
          fail('package metadata escapes prepared root')
        }
        const {
          bytes,
          physicalFile,
          device,
          inode,
        } = read(packageFile)
        const json = JSON.parse(bytes.toString('utf8'))
        if (typeof json.name === 'string') {
          if (json.name.length > 256 || (json.version !== undefined && (typeof json.version !== 'string' || json.version.length > 256))) {
            fail('package metadata string limit exceeded')
          }
          const result = {
            name: json.name,
            version: json.version,
            packageFile: physicalFile,
            packageIdentity: {
              device,
              inode,
            },
            packageSha256AtObservation: digest(bytes),
          }
          for (const key of visited) {
            metadata.set(key, result)
          }
          return result
        }
      }
      const parent = path.dirname(directory)
      if (same(parent, directory)) {
        break
      }
      directory = parent
    }
    for (const key of visited) {
      metadata.set(key, undefined)
    }
  }
  function sourceMap(source, file) {
    const pattern = /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL=([^\s*]+)/g
    let mapping
    for (const match of source.matchAll(pattern)) {
      mapping = match[1]
    }
    if (!mapping) {
      return undefined
    }
    if (mapping.startsWith('data:')) {
      return {
        status: 'not-inspected',
        protocol: 'data:',
      }
    }
    if (mapping.length > limits.sourceChars) {
      fail('source map URL limit exceeded')
    }
    const url = new URL(mapping, pathToFileURL(file))
    if (url.protocol !== 'file:') {
      return {
        status: 'not-inspected',
        protocol: url.protocol,
      }
    }
    const candidate = fileURLToPath(url)
    let mapFile
    try {
      mapFile = fs.realpathSync(candidate)
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      // 缺图只表示无法归因；先以最近存在的祖先确认其仍在 prepared root 内。
      let ancestor = path.dirname(candidate)
      for (let depth = 0; depth < 128; depth++) {
        try {
          if (!inside(fs.realpathSync(ancestor))) {
            fail('unavailable source map escapes prepared root')
          }
          return {
            status: 'unavailable',
            mapping,
            attribution: 'unknown',
          }
        }
        catch (cause) {
          if (cause.code !== 'ENOENT') {
            throw cause
          }
        }
        const parent = path.dirname(ancestor)
        if (same(parent, ancestor)) {
          break
        }
        ancestor = parent
      }
      fail('unavailable source map parent limit exceeded')
    }
    if (!inside(mapFile)) {
      fail('source map escapes prepared root')
    }
    if (++sourceMaps > limits.sourceMaps) {
      fail('source map count limit exceeded')
    }
    const {
      bytes,
      physicalFile,
      device,
      inode,
    } = read(mapFile)
    const map = JSON.parse(bytes.toString('utf8'))
    if (!Array.isArray(map.sources) || map.sources.length > limits.sourcesPerMap || map.sources.some(value => typeof value !== 'string' || value.length > limits.sourceChars) || (map.sourceRoot !== undefined && (typeof map.sourceRoot !== 'string' || map.sourceRoot.length > limits.sourceChars))) {
      fail('source map source limit exceeded')
    }
    return {
      status: 'observed-metadata-only',
      physicalFile,
      device,
      inode,
      sha256AtObservation: digest(bytes),
      sources: map.sources,
      sourceRoot: map.sourceRoot,
      hasSourcesContent: Array.isArray(map.sourcesContent),
    }
  }
  return { names, owner, sourceMap, getSourceMaps: () => sourceMaps }
}

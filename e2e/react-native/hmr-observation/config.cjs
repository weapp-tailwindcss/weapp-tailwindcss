const { createHash } = require('node:crypto')
const { readFileSync, realpathSync, mkdirSync, writeFileSync, existsSync } = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const originalAlias = 'weapp-tailwind-e2e-original-hmr-client'
const request = 'metro-runtime/src/modules/HMRClient'
const hash = value => createHash('sha256').update(value).digest('hex')

/** 文件系统身份使用所属平台的 path 规则；module request 保留原字符串。 */
function sameSourcePath(left, right, paths = path) {
  return paths.resolve(left) === paths.resolve(right)
}

function isSource(file, expected) {
  if (sameSourcePath(file, expected)) {
    return true
  }
  try {
    return sameSourcePath(realpathSync(file), expected)
  }
  catch {
    return false
  }
}

function packageForClient(file) {
  let directory = path.dirname(file)
  while (true) {
    const candidate = path.join(directory, 'package.json')
    if (existsSync(candidate)) {
      const source = readFileSync(candidate)
      const value = JSON.parse(source)
      if (value.name !== 'metro-runtime') {
        throw new Error('HMR 原实现不属于 metro-runtime')
      }
      return { name: value.name, version: value.version, packageJsonSha256: hash(source), source,
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error('HMR 原实现缺少包身份')
    }
    directory = parent
  }
}

/** 显式验收构建必须归档原件，I/O 失败立即阻断；运行时观察异常则由记录器隔离。 */
function withMetroHmrObservation(config, environment = process.env) {
  if (!environment.RN_METRO_HMR_ARCHIVE) {
    return config
  }
  const { directory, identity, utilitiesPath, wrapperPath, metroConfigPath } = JSON.parse(environment.RN_METRO_HMR_ARCHIVE)
  if (![directory, utilitiesPath, wrapperPath, metroConfigPath].every(value => typeof value === 'string' && path.isAbsolute(value)) || !identity?.runId || !identity?.invocationId) {
    throw new Error('HMR resolver 观察配置不完整')
  }
  mkdirSync(directory)
  const previous = config.resolver?.resolveRequest
  const originals = new Map()
  const wrapper = realpathSync(wrapperPath)
  const utilities = realpathSync(utilitiesPath)
  const binding = { identity, utilitiesPath: utilities, wrapperPath: wrapper, projectRoot: config.projectRoot, serverRoot: config.server?.unstable_serverRoot ?? config.projectRoot, pathFlavor: process.platform === 'win32' ? 'win32' : 'posix' }
  writeFileSync(path.join(directory, 'identity.json'), `${JSON.stringify(binding)}\n`, { flag: 'wx' })
  const observers = [
    ['observer-wrapper.cjs', wrapper],
    ['observer-recorder.cjs', path.join(path.dirname(wrapper), 'hmr-observation.cjs')],
    ['observer-resolver.cjs', __filename],
    ['observer-metro-config.js', metroConfigPath],
  ].map(([name, file]) => {
    const bytes = readFileSync(file)
    writeFileSync(path.join(directory, name), bytes, { flag: 'wx' })
    return { name, sha256: hash(bytes), byteLength: bytes.length,
    }
  })
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, name, platform) {
        if (name === originalAlias && isSource(context.originModulePath, wrapper)) {
          const original = originals.get(platform)
          if (!original) {
            throw new Error('HMR wrapper 缺少同平台原 resolver 结果')
          }
          return original
        }
        const result = previous
          ? previous.call(config.resolver, context, name, platform)
          : context.resolveRequest(context, name, platform)
        if ((platform !== 'android' && platform !== 'ios') || name !== request || !isSource(context.originModulePath, utilities)) {
          return result
        }
        if (result?.type !== 'sourceFile' || typeof result.filePath !== 'string') {
          throw new Error('HMR resolver 未返回原实现源码')
        }
        const original = originals.get(platform)
        if (original && !sameSourcePath(original.filePath, result.filePath)) {
          throw new Error('HMR 原 resolver 结果在同次运行发生变化')
        }
        if (!original) {
          const source = readFileSync(result.filePath)
          const clientPackage = packageForClient(result.filePath)
          const receipt = {
            schemaVersion: 1,
            evidence: 'resolver-result',
            identity,
            request: name,
            platform,
            originModulePath: realpathSync(context.originModulePath),
            resolvedPath: result.filePath,
            ...binding,
            observers,
            clientSourceSha256: hash(source),
            clientPackage: { name: clientPackage.name, version: clientPackage.version, packageJsonSha256: clientPackage.packageJsonSha256 },
            wrapperPath: wrapper,
            wrapperSha256: hash(readFileSync(wrapper)),
          }
          for (const [name, bytes] of [
            [`${platform}-client-source.js`, source],
            [`${platform}-client-package.json`, clientPackage.source],
            [`${platform}-resolver.json`, `${JSON.stringify(receipt, null, 2)}\n`],
          ]) {
            writeFileSync(path.join(directory, name), bytes, { flag: 'wx' })
          }
          originals.set(platform, result)
        }
        return { type: 'sourceFile', filePath: wrapper,
        }
      },
    },
  }
}

module.exports = { withMetroHmrObservation, sameSourcePath, originalAlias, request }

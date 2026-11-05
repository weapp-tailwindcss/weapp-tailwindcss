const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')

/** 只替换原 resolver 已确认的静态模块；其他模块继续消费原构建图。 */
function withRuntimeStaticEvidence(config, projectRoot, environment) {
  const file = environment.RN_RUNTIME_STATIC_EVIDENCE
  const sha256 = environment.RN_RUNTIME_STATIC_EVIDENCE_SHA256
  if (!path.isAbsolute(file ?? '') || !/^[a-f\d]{64}$/.test(sha256 ?? '')
    || createHash('sha256').update(readFileSync(file)).digest('hex') !== sha256) {
    throw new Error('React Native 本轮 static 模块路径或摘要不符')
  }
  const original = path.join(projectRoot, 'src', 'compatibility', 'static-evidence.json')
  const resolve = config.resolver?.resolveRequest
  return {
    ...config,
    cacheVersion: `${config.cacheVersion ?? ''}:rn-static-${sha256}`,
    watchFolders: [...new Set([...(config.watchFolders ?? []), path.dirname(file)])],
    resolver: {
      ...config.resolver,
      resolveRequest(context, name, platform) {
        const result = resolve ? resolve.call(config.resolver, context, name, platform) : context.resolveRequest(context, name, platform)
        return result.type === 'sourceFile' && path.resolve(result.filePath) === original
          ? { type: 'sourceFile', filePath: file }
          : result
      },
    },
  }
}

module.exports = { withRuntimeStaticEvidence }

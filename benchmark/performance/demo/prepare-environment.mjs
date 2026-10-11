import assert from 'node:assert/strict'
import { platformEnvironmentKeys } from './capture.cjs'

export async function withCapturedEnvironment(records, action) {
  const environments = records.filter(row => row.key === 'options').map(row => row.value.environment)
  assert.ok(environments.length && environments.every(environment => environment && platformEnvironmentKeys.every(key => Object.hasOwn(environment, key))), '捕获构建缺少平台环境')
  assert.ok(environments.every(environment => platformEnvironmentKeys.every(key => environment[key] === environments[0][key])), '同一目标包含不同的平台环境')
  const previous = Object.fromEntries(platformEnvironmentKeys.map(key => [key, process.env[key]]))
  try {
    for (const key of platformEnvironmentKeys) {
      const value = environments[0][key]
      if (value === null) delete process.env[key]
      else { assert.equal(typeof value, 'string'); process.env[key] = value }
    }
    return await action()
  }
  finally {
    for (const key of platformEnvironmentKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

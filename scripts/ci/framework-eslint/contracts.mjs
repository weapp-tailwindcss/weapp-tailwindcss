import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import semver from 'semver'
import { mpxCases, taroCases } from './fixtures.mjs'

export const templateLintFamilies = new Map([
  ['mpx-tailwindcss-v4', 'mpx'],
  ['taro-vite-tailwindcss-v4', 'taro'],
  ['taro-webpack-tailwindcss-v4', 'taro'],
])

function isEnabled(setting) {
  const level = Array.isArray(setting) ? setting[0] : setting
  return level !== undefined && level !== 0 && level !== 'off'
}

function metadata(require, name) {
  return JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8'))
}

function installedToolchain(project, family) {
  const projectRequire = createRequire(path.join(project, 'package.json'))
  const configName = family === 'mpx' ? '@mpxjs/eslint-config-ts' : 'eslint-config-taro'
  const configRequire = createRequire(projectRequire.resolve(configName))
  const parser = metadata(configRequire, '@typescript-eslint/parser')
  const plugin = metadata(configRequire, '@typescript-eslint/eslint-plugin')
  const consumerPlugin = metadata(projectRequire, '@typescript-eslint/eslint-plugin')
  const consumerParser = metadata(projectRequire, '@typescript-eslint/parser')
  const parserFile = configRequire.resolve('@typescript-eslint/parser')
  const parserRequire = createRequire(parserFile)
  const estreeRequire = createRequire(parserRequire.resolve('@typescript-eslint/typescript-estree'))
  const typescript = metadata(estreeRequire, 'typescript')
  const { ESLint } = projectRequire('eslint')

  assert.equal(ESLint.version, '8.57.1', `${project} 必须使用自己的 legacy ESLint`)
  assert.equal(semver.major(parser.version), 8, `${configName} 必须拥有兼容 TS6 的 parser`)
  assert.equal(plugin.version, parser.version, '规则与 parser 必须属于同一代工具链')
  assert.equal(consumerPlugin.version, plugin.version, 'legacy CLI 实际解析的插件必须与配置所属版本一致')
  assert.equal(consumerParser.version, parser.version, '消费层 parser 必须与配置所属版本一致')
  assert.equal(semver.major(typescript.version), 6, '必须验证 parser 实际消费的 TypeScript6')
  assert.ok(semver.satisfies(typescript.version, parser.peerDependencies.typescript), '实际 TypeScript 必须处于 parser 支持范围')
  assert.ok(semver.satisfies(typescript.version, plugin.peerDependencies.typescript), '实际 TypeScript 必须处于规则支持范围')

  return { ESLint, parserFile }
}

/** 使用消费者真实配置和已安装依赖图校验行为，不写入项目源码或产物。 */
export async function verifyFrameworkEslint(project, family) {
  assert.ok(family === 'taro' || family === 'mpx', `未知 lint 工具链：${family}`)
  const { ESLint, parserFile } = installedToolchain(project, family)
  const configFile = path.join(project, family === 'mpx' ? '.eslintrc.js' : '.eslintrc')
  const eslint = new ESLint({ cwd: project, overrideConfigFile: configFile })
  const sourceFile = name => path.join(project, 'src', `__eslint_contract_${name}`)
  const tsConfig = await eslint.calculateConfigForFile(sourceFile('scope.ts'))
  assert.equal(realpathSync(tsConfig.parser), realpathSync(parserFile), 'TS override 必须使用配置拥有的 parser')

  const jsConfig = await eslint.calculateConfigForFile(sourceFile('scope.js'))
  assert.equal(isEnabled(jsConfig.rules?.['@typescript-eslint/no-unused-vars']), false, 'TS 规则不得扩展到 JS')
  if (family === 'mpx') {
    const mpxConfig = await eslint.calculateConfigForFile(sourceFile('scope.mpx'))
    assert.notEqual(realpathSync(mpxConfig.parser), realpathSync(parserFile), '.mpx 必须保留外层 SFC parser')
    assert.equal(realpathSync(mpxConfig.parserOptions.parser), realpathSync(parserFile), '.mpx 内层 TS parser 必须来自同一依赖图')
  }

  for (const fixture of family === 'mpx' ? mpxCases : taroCases) {
    const context = `${path.basename(project)} / ${fixture.filename}`
    const results = await eslint.lintText(fixture.source, { filePath: sourceFile(fixture.filename) })
    assert.equal(results.length, 1, `${context} 必须实际进入 lint`)
    const result = results[0]
    assert.equal(result.fatalErrorCount, 0, `${context} 解析失败：${JSON.stringify(result.messages)}`)
    assert.ok(result.messages.every(message => message.ruleId !== null), `${context} 不得被忽略`)
    assert.ok(result.messages.every(message => !/^Definition for rule .* was not found/u.test(message.message)), `${context} 不得缺失规则`)
    const diagnostics = result.messages
      .filter(message => fixture.rules.includes(message.ruleId))
      .map(message => [message.ruleId, message.severity, message.line])
    assert.deepEqual(diagnostics, fixture.expected, `${context} 的规则行为发生变化`)
  }
}

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const projects = [
  'issue-951-taro-vite-react-tailwindcss-v4',
  'subpackage-taro-webpack-react-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
]
const compatibleStylelint = '16.10.0'
const fixtures = [
  {
    name: '有效 RN 属性与值',
    source: '.fixture { color: red; line-height: 20px; font-weight: 700; }',
    expected: [],
  },
  {
    name: '未知 RN 属性',
    source: '.fixture { made-up-property: 1px; }',
    expected: [['taro-rn/css-property-no-unknown', 'error']],
  },
  {
    name: '缺少单位的行高',
    source: '.fixture { line-height: 1.5; }',
    expected: [['taro-rn/line-height-no-value-without-unit', 'error']],
  },
  {
    name: 'Android 会忽略的字重',
    source: '.fixture { font-weight: 500; }',
    expected: [['taro-rn/font-weight-no-ignored-values', 'warning']],
  },
]

function metadata(requireFrom, name) {
  let directory = path.dirname(requireFrom.resolve(name))
  while (true) {
    const filename = path.join(directory, 'package.json')
    if (existsSync(filename)) {
      const manifest = JSON.parse(readFileSync(filename, 'utf8'))
      if (manifest.name === name) {
        return { ...manifest, filename }
      }
    }
    const parent = path.dirname(directory)
    assert.notEqual(parent, directory, `无法找到 ${name} 的实际 manifest`)
    directory = parent
  }
}

function installedToolchain(project) {
  const projectRequire = createRequire(path.join(project, 'package.json'))
  const runner = metadata(projectRequire, '@tarojs/rn-runner')
  const runnerRequire = createRequire(runner.filename)
  const transformer = metadata(runnerRequire, '@tarojs/rn-style-transformer')
  const transformerRequire = createRequire(transformer.filename)
  const consumers = { runner: runnerRequire, transformer: transformerRequire }
  if (path.basename(project) === 'issue-951-taro-vite-react-tailwindcss-v4') {
    consumers.project = projectRequire
  }
  const packages = { runner, transformer }

  for (const [owner, requireFrom] of [['runner', runnerRequire], ['transformer', transformerRequire]]) {
    const config = metadata(requireFrom, 'stylelint-config-taro-rn')
    const configRequire = createRequire(config.filename)
    const plugin = metadata(configRequire, 'stylelint-taro-rn')
    consumers[`${owner}Config`] = configRequire
    consumers[`${owner}Plugin`] = createRequire(plugin.filename)
    packages[`${owner}Config`] = config
    packages[`${owner}Plugin`] = plugin
  }

  return {
    consumers,
    packages,
    configFile: path.join(path.dirname(transformer.filename), 'dist', 'config', 'rn-stylelint.json'),
    postcss: transformerRequire('postcss'),
  }
}

function diagnostics(warnings) {
  return warnings.map(({ rule, severity }) => [rule, severity])
}

describe.each(projects)('%s RN 样式校验', (name) => {
  const project = path.join(repo, 'demo', name)
  let toolchain
  let temporary
  beforeAll(async () => {
    toolchain = installedToolchain(project)
    temporary = await mkdtemp(path.join(tmpdir(), 'taro-rn-stylelint-'))
  })
  afterAll(async () => {
    if (temporary) {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('RN 消费链使用保留私有 helper 的局部 Stylelint 与原生规则配置', () => {
    for (const [owner, requireFrom] of Object.entries(toolchain.consumers)) {
      assert.equal(metadata(requireFrom, 'stylelint').version, compatibleStylelint, `${owner} 必须解析兼容版本`)
    }
    for (const [owner, manifest] of Object.entries(toolchain.packages)) {
      assert.equal(manifest.version, '4.3.1', `${owner} 必须来自同一 Taro 版本`)
      if (owner.endsWith('Config') || owner.endsWith('Plugin')) {
        assert.equal(manifest.peerDependencies.stylelint, '^16', `${owner} 的上游 peer 契约不能被改写`)
      }
    }

    assert.deepEqual(JSON.parse(readFileSync(toolchain.configFile, 'utf8')), {
      extends: 'stylelint-config-taro-rn',
      rules: {},
    }, '必须直接使用 transformer 的真实内置配置')
    const config = toolchain.consumers.transformerConfig('stylelint-config-taro-rn')
    assert.equal(config.rules['taro-rn/css-property-no-unknown'], true)
    assert.equal(config.rules['taro-rn/line-height-no-value-without-unit'], true)
    assert.equal(config.rules['taro-rn/font-weight-no-ignored-values'][0], true)
    assert.equal(config.rules['taro-rn/font-weight-no-ignored-values'][1].severity, 'warning')
  })

  it.each(fixtures)('Node API 保留 $name 的诊断', async (fixture) => {
    for (const owner of toolchain.consumers.project ? ['project', 'transformer'] : ['transformer']) {
      const stylelint = toolchain.consumers[owner]('stylelint')
      const result = await stylelint.lint({
        code: fixture.source,
        codeFilename: path.join(temporary, 'fixture.css'),
        configFile: toolchain.configFile,
        cwd: project,
        fix: false,
        cache: false,
        cacheLocation: path.join(temporary, `${owner}.cache`),
      })
      const context = `${owner} / ${fixture.name}`
      assert.equal(result.results.length, 1, `${context} 必须实际进入校验`)
      const [file] = result.results
      assert.ok(!file.ignored, `${context} 不得被忽略`)
      assert.deepEqual(file.parseErrors, [], `${context} 不得出现解析错误`)
      assert.deepEqual(file.invalidOptionWarnings, [], `${context} 不得缺失规则或配置`)
      assert.deepEqual(diagnostics(file.warnings), fixture.expected, context)
      assert.equal(result.errored, fixture.expected.some(([, severity]) => severity === 'error'), context)
    }
  }, 15_000)

  it.each(fixtures)('RN PostCSS API 保留 $name 的诊断并保持输入', async (fixture) => {
    const stylelint = toolchain.consumers.transformer('stylelint')
    const result = await toolchain.postcss([stylelint({
      configFile: toolchain.configFile,
      cwd: project,
      fix: false,
      cache: false,
      cacheLocation: path.join(temporary, 'postcss.cache'),
    })]).process(fixture.source, { from: path.join(temporary, 'fixture.css'), map: false })
    assert.deepEqual(diagnostics(result.warnings()), fixture.expected)
    assert.equal(result.css, fixture.source, '校验不得修复或改写输入 CSS')
  }, 15_000)
})

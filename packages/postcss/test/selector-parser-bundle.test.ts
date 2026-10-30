import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { createPostcssTsdownConfigs } from '../tsdown.config.mts'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))

for (const config of createPostcssTsdownConfigs().slice(0, 2)) {
  const format = config.format[0]
  it(`${format} 真实产物在独立 Node 中保留选择器 parser 的 CommonJS 边界`, async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'postcss-selector-bundle-'))
    try {
      // 仅连接本包声明的运行依赖；临时产物不执行安装，也不借用其他工作树。
      const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
      for (const name of Object.keys(manifest.dependencies)) {
        const destination = path.join(temporary, 'node_modules', name)
        await mkdir(path.dirname(destination), { recursive: true })
        await symlink(path.join(packageRoot, 'node_modules', name), destination, 'junction')
      }
      await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}')
      const outDir = path.join(temporary, 'dist')
      await build({
        ...config,
        config: false,
        cwd: packageRoot,
        entry: { transform: path.join(packageRoot, 'src/transform.ts') },
        outDir,
        logLevel: 'silent',
      })
      const entry = pathToFileURL(path.join(outDir, format === 'esm' ? 'transform.js' : 'transform.cjs')).href
      const { stdout } = await execa(process.execPath, ['--input-type=module', '-e', `
        const { createStyleHandler } = await import(${JSON.stringify(entry)});
        const handler = createStyleHandler({ cssCalc: false, cssRemoveHoverPseudoClass: true });
        const selectors = [];
        for (const selector of [
          '.safe,:where(:is(.branch:hover))',
          '.safe,.branch:not(:-moz-any(:lang(ar)))',
          '.a:where(:is(.b,.c))',
        ]) {
          const result = await handler(selector + '{color:red}');
          const rules = [];
          result.root.walkRules(rule => { rules.push(rule.selector); });
          selectors.push(rules);
        }
        console.log(JSON.stringify(selectors));
      `], { env: { WEAPP_TW_NATIVE: 'off' } })
      expect(JSON.parse(stdout)).toEqual([
        ['.safe'],
        ['.safe,.branch'],
        ['.a.b,.a.c'],
      ])
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })
}

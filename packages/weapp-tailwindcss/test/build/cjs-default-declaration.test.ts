import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { createCjsDefaultDeclaration } from '../../../../tools/weapp-tailwindcss-scripts/src/cjs-default-declaration'

it('CJS 可调用声明复用 ESM 定义并保留重导出的命名类型', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cjs-default-'))
  try {
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    await writeFile(path.join(root, 'implementation.d.ts'), 'export interface Options { enabled: boolean }\nexport default function plugin(options: Options): number')
    const source = path.join(root, 'index.d.ts')
    await writeFile(source, "export { default } from './implementation.js'; export * from './implementation.js'")
    const declaration = createCjsDefaultDeclaration(source)
    await writeFile(path.join(root, 'index.d.cts'), declaration)
    const consumer = path.join(root, 'consumer.cts')
    await writeFile(consumer, `import plugin = require('./index.cjs');
      const options: plugin.Options = { enabled: true };
      const value: number = plugin(options);
      // @ts-expect-error 严格保留 ESM 选项类型。
      plugin({ enabled: 'true' });`)
    const program = ts.createProgram([consumer], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      strict: true,
      types: [],
    })
    expect(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    expect(await readFile(source, 'utf8')).toBe("export { default } from './implementation.js'; export * from './implementation.js'")
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.each([
  'export const named: number; export default function plugin(): void',
  'export interface Options<T> { value: T }; export default function plugin(): void',
])('拒绝无法安全转换的 CJS 命名导出：%s', async (content) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cjs-unsupported-'))
  try {
    const source = path.join(root, 'index.d.ts')
    await writeFile(source, content)
    expect(() => createCjsDefaultDeclaration(source)).toThrow('需要单独建模的命名导出')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

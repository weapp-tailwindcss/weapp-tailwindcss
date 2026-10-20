import postcss from 'postcss';
import { expect, it } from 'vitest';
import reduceCalc from '../src/index.ts';

it('声明过滤只限制指定上下文，默认入口仍处理全部声明', async () => {
  const input = '@property --size{syntax:"<length>";initial-value:calc(1px + 2px)}.x{width:calc(1px + 2px)}';
  const filterDeclaration = (decl: postcss.Declaration) => decl.parent?.type !== 'atrule';
  const filtered = await postcss(reduceCalc({ filterDeclaration })).process(input, { from: undefined });
  expect(filtered.css).toContain('initial-value:calc(1px + 2px)');
  expect(filtered.css).toContain('width:3px');
  const normal = await postcss(reduceCalc()).process(input, { from: undefined });
  expect(normal.css).toContain('initial-value:3px');
  expect(normal.css).toContain('width:3px');
});

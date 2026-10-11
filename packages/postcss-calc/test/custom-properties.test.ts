import postcss from 'postcss';
import { expect, it } from 'vitest';
import reduceCalc from '../src/index.ts';

it.each([String.raw`\2d -spacing`, String.raw`\--spacing`, String.raw`--s\70 acing`])('解析合法转义自定义属性 %s', async (name) => {
  const result = await postcss(reduceCalc({
    customPropertyValues: new Map([[name, '2rpx']]),
    includeCustomProperties: [name],
  })).process(`.x{width:calc(var(${name})*2)}`, { from: undefined });
  expect(result.css).toBe('.x{width:4rpx}');
});

it.each(['color', String.raw`\63olor`, '--', String.raw`\2d -spacing other`, '--spacing.other'])('显式映射不能把非自定义属性 %s 变为合法引用', async (name) => {
  const result = await postcss(reduceCalc({
    customPropertyValues: new Map([[name, '2rpx']]),
    includeCustomProperties: [name],
  })).process(`.x{width:calc(var(${name})*2)}`, { from: undefined });
  expect(result.css).toContain('var(');
  expect(result.css).not.toContain('width:4rpx');
});

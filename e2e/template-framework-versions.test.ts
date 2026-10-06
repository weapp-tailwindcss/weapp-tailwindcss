import { expect, it, vi } from 'vitest'
import { resolveWeappViteTemplateVersion } from '../scripts/template-framework-versions'

it.each(['7.1.0', '7.4.0'])('模板维护只查询并接受已有修复的 7.x：%s', async (version) => {
  const fetchMajor = vi.fn().mockResolvedValue(version)
  await expect(resolveWeappViteTemplateVersion(fetchMajor)).resolves.toBe(version)
  expect(fetchMajor).toHaveBeenCalledExactlyOnceWith('weapp-vite', 7)
})

it.each(['6.25.1', '7.0.4', '7.1.0-beta.1', '8.0.0', 'invalid'])('不能把模板倒退或跨入未验证主版本：%s', async (version) => {
  await expect(resolveWeappViteTemplateVersion(async () => version)).rejects.toThrow('页面 JSON')
})

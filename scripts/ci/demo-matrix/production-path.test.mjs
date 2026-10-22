import path from 'node:path'
import { expect, it } from 'vitest'
import { insideProductionRoot, productionRequestFile } from './production-path.mjs'

it.each([
  { paths: path.posix, root: '/build/output', sibling: '/build/output-old/a.js', other: '/outside/a.js' },
  { paths: path.win32, root: 'C:\\build\\output', sibling: 'C:\\build\\output-old\\a.js', other: 'D:\\outside\\a.js' },
])('生产服务器按宿主路径语义拒绝越界：$root', ({ paths, root, sibling, other }) => {
  expect(insideProductionRoot(root, root, paths)).toBe(true)
  expect(insideProductionRoot(root, paths.join(root, 'css', 'app.css'), paths)).toBe(true)
  expect(insideProductionRoot(root, sibling, paths)).toBe(false)
  expect(insideProductionRoot(root, other, paths)).toBe(false)
  expect(productionRequestFile(root, '/css/app%20main.css', paths)).toBe(paths.join(root, 'css', 'app main.css'))
  expect(productionRequestFile(root, 'css/app.css', paths)).toBe(paths.join(root, 'css', 'app.css'))
  for (const url of ['/../secret', '/%2e%2e/secret', '/%2foutside/a.js', '/css/%5c..%5csecret', '/D:%5csecret', '/%ZZ']) {
    expect(() => productionRequestFile(root, url, paths)).toThrow()
  }
})

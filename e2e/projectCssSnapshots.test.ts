import { describe, expect, it } from 'vitest'
import { getProjectCssFiles, getProjectCssSnapshotFiles } from './projectCssSnapshots'

describe('项目 CSS 快照映射', () => {
  it.each([
    ['dist/app.wxss', 'dist/sub/pages/index.wxss', 'sub/pages/index.wxss'],
    ['dist\\app.wxss', 'dist\\sub\\pages\\index.wxss', 'sub/pages/index.wxss'],
    ['C:\\project\\app.wxss', 'C:\\project\\sub\\index.wxss', 'C:/project/sub/index.wxss'],
    ['/project/app.wxss', '/project/sub/index.wxss', '/project/sub/index.wxss'],
  ])('保留文件路径 %s，仅规范化逻辑快照名', (cssFile, extra, snapshotName) => {
    const entry = { name: 'test', projectPath: 'test', cssFile, cssFiles: [cssFile, extra, extra] }
    expect(getProjectCssFiles(entry)).toEqual([cssFile, extra])
    expect(getProjectCssSnapshotFiles(entry)).toEqual([
      { cssFile, snapshotName: 'app.wxss' },
      { cssFile: extra, snapshotName },
    ])
  })

  it('空列表回退到根样式入口', () => {
    expect(getProjectCssSnapshotFiles({ name: 'test', projectPath: 'test', cssFile: 'app.wxss', cssFiles: [] }))
      .toEqual([{ cssFile: 'app.wxss', snapshotName: 'app.wxss' }])
  })
})

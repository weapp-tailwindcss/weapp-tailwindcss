import { buildBundleSnapshotForBuild } from '@/bundlers/vite/bundle-state'
import { collectTemplateAssetStyles } from '@/bundlers/vite/generate-bundle/template-assets'
import { createContext, createRollupAsset } from './vite-plugin.testkit'

describe('template style asset ownership', () => {
  it.each(['widgets/footer', 'widgets\\footer', 'C:\\output\\widgets\\footer', '/output/widgets/footer', './widgets/footer'])('uses actual style assets for logical output name %s', (stem) => {
    const style = { ...createRollupAsset('.weapp-tw-border{border-width:0}'), fileName: `${stem}.acss` }
    const unrelated = { ...createRollupAsset('.weapp-tw-border{border-width:0}'), fileName: 'other/footer.acss' }
    const snapshot = buildBundleSnapshotForBuild({ [style.fileName]: style, [unrelated.fileName]: unrelated }, createContext({ cssMatcher: (file: string) => file.endsWith('.acss') }) as any, '/virtual/dist')
    const getStyles = collectTemplateAssetStyles(snapshot)
    expect(getStyles(`${stem}.axml`)).toHaveLength(1)
    expect(Object.isFrozen(getStyles(`${stem}.axml`))).toBe(true)
    expect(Object.isFrozen(getStyles(`${stem}.axml`)[0])).toBe(true)
    expect(getStyles(`${stem}.axml`)[0]?.source).toBe(style.source)
    expect(getStyles('missing/footer.ttml')).toEqual([])
  })
  it('preserves omitted carriers and removes explicitly retired or absent full-build styles', () => {
    const css = { ...createRollupAsset('.weapp-tw-border{border-width:0}'), fileName: 'component.css' }
    const template = { ...createRollupAsset('<view/>'), fileName: 'component.wxml' }
    const previous = new Map()
    const snapshot = (bundle: Record<string, typeof css>, hasOmittedKnownFiles = false, removedFiles: string[] = []) => ({
      ...buildBundleSnapshotForBuild(bundle, createContext() as any, '/virtual/dist'), hasOmittedKnownFiles, removedFiles: new Set(removedFiles),
    })
    expect(collectTemplateAssetStyles(snapshot({ 'component.css': css, 'component.wxml': template }), previous)('component.wxml')).toHaveLength(1)
    expect(collectTemplateAssetStyles(snapshot({ 'component.wxml': template }, true), previous)('component.wxml')).toHaveLength(1)
    expect(collectTemplateAssetStyles(snapshot({ 'component.wxml': template }, true, ['component.css']), previous)('component.wxml')).toEqual([])
    collectTemplateAssetStyles(snapshot({ 'component.css': css }), previous)
    expect(collectTemplateAssetStyles(snapshot({ 'component.wxml': template }), previous)('component.wxml')).toEqual([])
  })
})

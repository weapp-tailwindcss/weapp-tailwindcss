import { compileNativeStylesheet } from '@/compiler'

describe('compileNativeStylesheet', () => {
  it('compiles common utilities and preserves class-specific rule order', () => {
    const manifest = compileNativeStylesheet(`
      .flex { display: flex; padding: 4px; }
      .items-center { align-items: center; }
      .bg-red-500 { background-color: #ef4444; }
      .dark\\:bg-black { background-color: #000; }
      .ios\\:w-\\[42px\\] { width: 42px; }
    `, {
      classSet: ['flex', 'items-center', 'bg-red-500', 'dark:bg-black', 'ios:w-[42px]'],
    })

    expect(manifest.classSet).toEqual(['flex', 'items-center', 'bg-red-500', 'dark:bg-black', 'ios:w-[42px]'])
    expect(manifest.rules.flex[0]?.style).toEqual({ paddingTop: 4, paddingRight: 4, paddingBottom: 4, paddingLeft: 4, display: 'flex' })
    expect(manifest.rules['dark:bg-black']?.[0]).toMatchObject({ colorScheme: 'dark', style: { backgroundColor: '#000' } })
    expect(manifest.rules['ios:w-[42px]']?.[0]).toMatchObject({ platform: 'ios', style: { width: 42 } })
  })

  it('maps common shadows and reports unsupported CSS values', () => {
    const manifest = compileNativeStylesheet('.shadow { box-shadow: 0 1px 2px #000; } .blur { filter: blur(4px); } .text-shadow { text-shadow: 0 1px 2px #000; } .columns { columns: 2; }')
    expect(manifest.rules.shadow?.[0]?.style).toMatchObject({ shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, shadowColor: '#000' })
    expect(manifest.warnings).toEqual([
      expect.objectContaining({ className: 'blur', property: 'filter' }),
      expect.objectContaining({ className: 'text-shadow', property: 'textShadow' }),
      expect.objectContaining({ className: 'columns', property: 'columns' }),
    ])
  })

  it('compiles fractional aspect ratios without accepting unknown CSS properties', () => {
    const manifest = compileNativeStylesheet('.aspect { aspect-ratio: 4 / 3; columns: 2; }', { classSet: ['aspect'] })
    expect(manifest.rules.aspect?.[0]?.style).toEqual({ aspectRatio: 4 / 3 })
    expect(manifest.warnings).toEqual([expect.objectContaining({ className: 'aspect', property: 'columns' })])
  })

  it('normalizes percentage opacity to the numeric value required by React Native', () => {
    const manifest = compileNativeStylesheet('.opacity-50 { opacity: 50%; }', { classSet: ['opacity-50'] })

    expect(manifest.rules['opacity-50']?.[0]?.style).toEqual({ opacity: 0.5 })
  })

  it('does not include preflight selectors by default', () => {
    const manifest = compileNativeStylesheet(':root { --brand: #123; } * { box-sizing: border-box; } .text { color: var(--brand); }')
    expect(manifest.rules.text?.[0]?.style).toEqual({ color: '#123' })
    expect(manifest.rules['*']).toBeUndefined()
    expect(manifest.variables).toEqual({ '--brand': '#123' })
  })

  it('compiles transforms, shadows, rem values, and combined native variants', () => {
    const manifest = compileNativeStylesheet(`
      .dark\\:ios\\:translate-x-\\[12px\\] { transform: translateX(12px) rotate(5deg); }
      .rounded-lg { border-radius: 0.5rem; }
      .shadow { box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25); }
    `, { classSet: ['dark:ios:translate-x-[12px]', 'rounded-lg', 'shadow'] })

    expect(manifest.rules['dark:ios:translate-x-[12px]']?.[0]).toMatchObject({
      colorScheme: 'dark',
      platform: 'ios',
      style: { transform: [{ translateX: 12 }, { rotate: '5deg' }] },
    })
    expect(manifest.rules['rounded-lg']?.[0]?.style).toEqual({ borderRadius: 8 })
    expect(manifest.rules.shadow?.[0]?.style).toMatchObject({ shadowOpacity: 0.25 })
  })

  it('rejects state and responsive variants instead of applying them unconditionally', () => {
    const manifest = compileNativeStylesheet(`
      .hover\\:bg-red:hover { background-color: #f00; }
      .sm\\:w-4 { width: 16px; }
      .text-\\[color\\:red\\] { color: red; }
    `, { classSet: ['hover:bg-red', 'sm:w-4', 'text-[color:red]'] })

    expect(manifest.rules['hover:bg-red']).toBeUndefined()
    expect(manifest.rules['sm:w-4']).toBeUndefined()
    expect(manifest.rules['text-[color:red]']?.[0]?.style).toEqual({ color: 'red' })
    expect(manifest.warnings).toEqual([
      expect.objectContaining({ className: 'hover:bg-red', property: 'variant' }),
      expect.objectContaining({ className: 'sm:w-4', property: 'variant' }),
    ])
  })

  it('resolves Tailwind v4 theme colors and spacing calculations', () => {
    const manifest = compileNativeStylesheet(`
      :root { --color-brand: oklch(62.3% 0.214 259.815); --spacing: 0.25rem; }
      .bg-brand { background-color: var(--color-brand); }
      .px-4 { padding-inline: calc(var(--spacing) * 4); }
    `, { classSet: ['bg-brand', 'px-4'] })
    expect(manifest.rules['bg-brand']?.[0]?.style.backgroundColor).toMatch(/^#/)
    expect(manifest.rules['px-4']?.[0]?.style).toEqual({ paddingHorizontal: 16 })
    expect(manifest.warnings).toEqual([])
  })

  it('records source order, important metadata, and static StyleSheet lookup', () => {
    const manifest = compileNativeStylesheet(`
      .text-red { color: #f00; }
      .text-blue { color: #00f; }
      .text-important { color: #0f0 !important; }
    `, { classSet: ['text-red', 'text-blue', 'text-important'] })
    expect(manifest.rules['text-red']?.[0]).toMatchObject({ order: 0, important: undefined })
    expect(manifest.rules['text-important']?.[0]).toMatchObject({ important: true })
    const id = manifest.staticLookup?.['text-blue']?.[0]
    expect(id).toMatch(/^s[a-f\d]{12}$/)
    expect(manifest.styleSheet?.[id!]).toEqual({ color: '#00f' })
    expect(manifest.styleEntries?.[id!]).toMatchObject({ order: 1 })
  })

  it('keeps static IDs stable when unrelated classes or style values change', () => {
    const initial = compileNativeStylesheet('.probe { color: #0f0; }', { classSet: ['probe'] })
    const updated = compileNativeStylesheet('.inserted { width: 1px; } .probe { color: #f00; }', { classSet: ['inserted', 'probe'] })

    expect(updated.staticLookup?.probe).toEqual(initial.staticLookup?.probe)
    expect(updated.styleSheet?.[initial.staticLookup?.probe[0] ?? '']).toEqual({ color: '#f00' })
  })
})

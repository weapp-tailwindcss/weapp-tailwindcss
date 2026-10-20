// 编译器会接受无类型任意值；运行时见证必须同时符合对应 CSS 属性的值域。
export const utilitySemanticWitnesses: Record<string, string> = {
  '-col': '-col-1',
  '-row': '-row-1',
  'contain': 'contain-[layout]',
  'cursor': 'cursor-[crosshair]',
  'will-change': 'will-change-[opacity]',
  'mask-conic-from': 'mask-conic-from-[25%]',
  'mask-conic-to': 'mask-conic-to-[75%]',
}

export const utilityWitnessSupplements: Record<string, string[]> = {
  'max-w-screen': ['max-w-screen-sm'],
  'bg-size': ['bg-size-[17px_23px]'],
  'bg-position': ['bg-position-[25%_75%]'],
  'mask-size': ['mask-size-[17px_23px]'],
  'mask-position': ['mask-position-[25%_75%]'],
  'font-features': ['font-features-["kern"]'],
  'filter': ['filter-[blur(1px)]'],
  'backdrop-filter': ['backdrop-filter-[blur(1px)]'],
  'flex-shrink': ['flex-shrink-1'],
  'flex-grow': ['flex-grow-1'],
  'mask': ['mask-[linear-gradient(red,blue)]'],
}

export const variantWitnessSupplements: Record<string, string> = {
  'not': 'not-hover:flex',
  'group': 'group-hover:flex',
  'peer': 'peer-checked:flex',
  'in': 'in-hover:flex',
  'has': 'has-[img]:flex',
  'aria': 'aria-checked:flex',
  'data': 'data-[state=open]:flex',
  'nth': 'nth-3:flex',
  'nth-last': 'nth-last-3:flex',
  'nth-of-type': 'nth-of-type-3:flex',
  'nth-last-of-type': 'nth-last-of-type-3:flex',
  'supports': 'supports-[display:grid]:flex',
  'max': 'max-md:flex',
  'min': 'min-sm:flex',
  '@max': '@max-sm:flex',
  '@': '@sm:flex',
  '@min': '@min-sm:flex',
}

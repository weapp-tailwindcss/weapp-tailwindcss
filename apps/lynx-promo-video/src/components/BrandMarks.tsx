import { Img, staticFile } from 'remotion'

export function BrandMarks({ size = 72 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <Img src={staticFile('brand/weapp-tailwindcss.svg')} style={{ width: size, height: size, objectFit: 'contain' }} />
      <div style={{ width: 1, height: size * 0.58, background: '#344044' }} />
      <Img src={staticFile('brand/lynx.svg')} style={{ width: size * 0.96, height: size, objectFit: 'contain', filter: 'invert(1)' }} />
    </div>
  )
}

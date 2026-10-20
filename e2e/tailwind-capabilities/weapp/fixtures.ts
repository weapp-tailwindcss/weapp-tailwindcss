import { borderProperties, paddingProperties, radiusProperties } from '../style-properties'

export const weappProbes = [
  { id: 'width-arbitrary', candidates: ['w-[123px]'], property: 'width', expected: '123px', reference: 'width:123px' },
  { id: 'height-arbitrary', candidates: ['h-[48px]'], property: 'height', expected: '48px', reference: 'height:48px' },
  { id: 'size-width', candidates: ['size-[44px]'], property: 'width', expected: '44px', reference: 'width:44px;height:44px', styles: { width: '44px', height: '44px' } },
  { id: 'size-height', candidates: ['size-[44px]'], property: 'height', expected: '44px', reference: 'width:44px;height:44px', styles: { width: '44px', height: '44px' } },
  { id: 'padding', candidates: ['p-[17px]'], property: 'padding-top', expected: '17px', reference: 'padding:17px', styles: paddingProperties('17px') },
  { id: 'margin-negative', candidates: ['-mt-[7px]'], property: 'margin-top', expected: '-7px', reference: 'margin-top:-7px' },
  { id: 'fraction', candidates: ['w-1/2'], property: 'width', expected: '100px', reference: 'width:50%' },
  { id: 'background', candidates: ['bg-[#123456]'], property: 'background-color', expected: 'rgb(18, 52, 86)', reference: 'background-color:#123456', pixel: [18, 52, 86, 255] },
  { id: 'radius', candidates: ['rounded-[17px]'], property: 'border-top-left-radius', expected: '17px', reference: 'border-radius:17px', styles: radiusProperties('17px') },
  { id: 'border', candidates: ['border-[3px]', 'border-solid'], property: 'border-top-width', expected: '3px', reference: 'border:3px solid #111111', styles: borderProperties('3px') },
  { id: 'opacity', candidates: ['opacity-[.67]'], property: 'opacity', expected: '0.67', reference: 'opacity:.67' },
  { id: 'text-size', candidates: ['text-[23px]'], property: 'font-size', expected: '23px', reference: 'font-size:23px', text: true },
  { id: 'text-color', candidates: ['text-[#123456]'], property: 'color', expected: 'rgb(18, 52, 86)', reference: 'color:#123456', text: true },
  { id: 'arbitrary-property', candidates: ['[width:71px]'], property: 'width', expected: '71px', reference: 'width:71px' },
  { id: 'typed-variable', candidates: ['w-(length:--probe-width)'], property: 'width', expected: '73px', reference: 'width:73px' },
  { id: 'math', candidates: ['w-[calc(100%-17px)]'], property: 'width', expected: '183px', reference: 'width:calc(100% - 17px)' },
  { id: 'important', candidates: ['w-[67px]!'], property: 'width', expected: '67px', reference: 'width:67px', inline: 'width:99px' },
  { id: 'dynamic-width', candidates: ['w-[32px]', 'w-[64px]'], property: 'width', expected: '32px', reference: 'width:32px', dynamic: true },
] as const

export type WeappProbe = typeof weappProbes[number]

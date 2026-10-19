/* eslint-disable style/max-statements-per-line */

import { resolveNativeVariables } from './variables'

export function parseNumber(value: string, variables: Record<string, string>): number | string | undefined {
  const resolved = resolveVariables(value, variables)
  const fraction = resolved.match(/^(-?(?:\d+\.\d+|\d+|\.\d+))\s*\/\s*(-?(?:\d+\.\d+|\d+|\.\d+))$/)
  if (fraction && Number(fraction[2]) !== 0) { return Number(fraction[1]) / Number(fraction[2]) }
  const calculated = resolved.match(/^calc\(\s*(-?(?:\d+\.\d+|\d+|\.\d+))(px|rem|em|%)?\s*\*\s*(-?(?:\d+\.\d+|\d+|\.\d+))\s*\)$/)
  if (calculated) {
    const base = parseNumber(`${calculated[1]}${calculated[2] ?? ''}`, variables)
    return typeof base === 'number' ? base * Number(calculated[3]) : undefined
  }
  const match = resolved.match(/^(-?(?:\d+\.\d+|\d+|\.\d+))(px|rem|em|%)?$/)
  if (!match) { return undefined }
  const number = Number(match[1])
  if (match[2] === '%') { return `${number}%` }
  if (match[2] === 'rem' || match[2] === 'em') { return number * 16 }
  return number
}

export function resolveVariables(value: string, variables: Record<string, string>) {
  return resolveNativeVariables(value, variables) ?? value
}

export function isColor(value: string) {
  return /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([^)]*\)|[a-z]+)$/i.test(value)
}

function oklchToHex(value: string) {
  const match = value.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s+\/\s*([\d.]+))?\s*\)$/i)
  if (!match) { return undefined }
  const lightness = Number(match[1]) > 1 ? Number(match[1]) / 100 : Number(match[1])
  const chroma = Number(match[2])
  const hue = Number(match[3]) * Math.PI / 180
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s = lightness - 0.0894841775 * a - 1.291485548 * b
  const linear = (channel: number) => channel ** 3
  const red = 4.0767416621 * linear(l) - 3.3077115913 * linear(m) + 0.2309699292 * linear(s)
  const green = -1.2684380046 * linear(l) + 2.6097574011 * linear(m) - 0.3413193965 * linear(s)
  const blue = -0.0041960863 * linear(l) - 0.7034186147 * linear(m) + 1.7076147010 * linear(s)
  const toByte = (channel: number) => Math.round(Math.max(0, Math.min(1, channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)) * 255)
  const hex = [red, green, blue].map(channel => toByte(channel).toString(16).padStart(2, '0')).join('')
  return alpha < 1 ? `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : `#${hex}`
}

export function normalizeColor(value: string) {
  return /^oklch\(/i.test(value) ? oklchToHex(value) : value
}

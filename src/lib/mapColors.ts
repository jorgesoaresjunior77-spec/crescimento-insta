// Espelha as cores de src/lib/palette.ts / index.css (SVG precisa de cor literal, não var()).
// Compartilhado entre BrazilAudienceMap e WorldAudienceMap para manter a mesma escala visual.
export const MAP_NO_DATA_FILL = '#232b57'
export const MAP_SCALE_TO = '#8b5cf6' // --grad-violet-from
export const MAP_STROKE = '#3a4270'
export const MAP_HOVER_STROKE = '#f5f7ff'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = hexToRgb(from)
  const [tr, tg, tb] = hexToRgb(to)
  const r = Math.round(fr + (tr - fr) * t)
  const g = Math.round(fg + (tg - fg) * t)
  const b = Math.round(fb + (tb - fb) * t)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Cor de preenchimento de uma região do mapa a partir da participação relativa ao maior
 * valor do conjunto. Raiz quadrada comprime a escala para que regiões com participação
 * pequena continuem claramente distintas do preenchimento neutro ("sem dado").
 */
export function mapFillForRatio(ratio: number): string {
  const scaled = Math.sqrt(Math.max(0, Math.min(1, ratio)))
  return mixHex(MAP_NO_DATA_FILL, MAP_SCALE_TO, 0.35 + scaled * 0.65)
}

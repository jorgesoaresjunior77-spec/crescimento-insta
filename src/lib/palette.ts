/**
 * Paleta de gradientes do Instagram Growth Inteligência — usada tanto no CSS
 * (via custom properties em index.css) quanto nos gráficos Recharts (que
 * precisam de cores literais nos <linearGradient> em SVG).
 */
export interface GradientStop {
  id: string
  from: string
  to: string
}

export const GRADIENTS: GradientStop[] = [
  { id: 'blue', from: '#2563eb', to: '#22d3ee' },
  { id: 'purple', from: '#7c3aed', to: '#ec4899' },
  { id: 'pink', from: '#ec4899', to: '#f97316' },
  { id: 'orange', from: '#f97316', to: '#facc15' },
  { id: 'teal', from: '#14b8a6', to: '#22d3ee' },
  { id: 'violet', from: '#8b5cf6', to: '#3b82f6' },
]

export function gradientAt(index: number): GradientStop {
  return GRADIENTS[index % GRADIENTS.length]
}

export const CHART_GRID_COLOR = '#262c4a'
export const CHART_TEXT_COLOR = '#9aa3c4'
export const CHART_TICK_STYLE = { fontSize: 12, fill: CHART_TEXT_COLOR }

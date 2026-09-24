import { useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import type { Feature, Geometry, Position } from 'geojson'
import { BRAZIL_STATES } from '../lib/api'
import { formatNumber } from '../lib/metrics'
import { IBGE_UF_BY_CODAREA } from '../lib/ibgeStates'

export interface StateAudience {
  state: string
  followers_count: number
}

const GEO_URL = '/brazil-states.geojson'

// Espelha as cores de src/lib/palette.ts / index.css (SVG precisa de cor literal, não var()).
// O fundo do card (--card-bg) é #141a34 — o neutro precisa contrastar visivelmente com ele.
const NO_DATA_FILL = '#232b57'
const SCALE_TO = '#8b5cf6' // --grad-violet-from
const STROKE = '#3a4270'
const HOVER_STROKE = '#f5f7ff'

const STATE_LABEL: Record<string, string> = Object.fromEntries(BRAZIL_STATES.map((s) => [s.value, s.label]))

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

interface TooltipState {
  state: string
  total: number | null
  x: number
  y: number
}

/**
 * `public/brazil-states.geojson` (malha do IBGE) tem os anéis dos polígonos na orientação
 * esférica oposta à que o `d3-geo` (usado internamente pelo react-simple-maps) exige — cada
 * estado é interpretado como cobrindo quase a esfera inteira, e o `Geography` correspondente
 * é desenhado como um retângulo cobrindo todo o mapa em vez do contorno real. Corrige isso
 * invertendo a ordem dos pontos de cada anel, sem alterar o arquivo .geojson em si.
 */
function reverseRing(ring: Position[]): Position[] {
  return [...ring].reverse()
}

function fixRingWinding(features: Feature<Geometry>[]): Feature<Geometry>[] {
  return features.map((feature) => {
    const geometry = feature.geometry
    if (geometry.type === 'Polygon') {
      return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map(reverseRing) } }
    }
    if (geometry.type === 'MultiPolygon') {
      return {
        ...feature,
        geometry: { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map(reverseRing)) },
      }
    }
    return feature
  })
}

export default function BrazilAudienceMap({ data }: { data: StateAudience[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const totalsByState = new Map(data.map((d) => [d.state, d.followers_count]))
  const maxTotal = data.reduce((max, d) => Math.max(max, d.followers_count), 0)

  function fillFor(uf: string | undefined): string {
    if (!uf) return NO_DATA_FILL
    const total = totalsByState.get(uf)
    if (total === undefined) return NO_DATA_FILL
    const ratio = maxTotal > 0 ? total / maxTotal : 0
    // piso de 0.12 para o estado com dado continuar visualmente distinto de "sem dado" mesmo com total baixo
    return mixHex(NO_DATA_FILL, SCALE_TO, 0.12 + ratio * 0.88)
  }

  return (
    <div className="brazil-map">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-54.39, -15.12], scale: 585 }}
        width={760}
        height={460}
        style={{ width: '100%', height: 'auto', maxHeight: 520 }}
        role="img"
        aria-label="Mapa do Brasil com seguidores por estado"
      >
        <Geographies geography={GEO_URL} parseGeographies={fixRingWinding}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const codarea = String(geo.properties?.codarea ?? '')
              const uf = IBGE_UF_BY_CODAREA[codarea]
              const total = uf ? (totalsByState.get(uf) ?? null) : null
              const isHovered = tooltip?.state === (uf ?? codarea)
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fillFor(uf)}
                  stroke={isHovered ? HOVER_STROKE : STROKE}
                  strokeWidth={isHovered ? 1.5 : 1}
                  style={{ outline: 'none', cursor: 'default', transition: 'fill 0.15s ease, stroke 0.15s ease' }}
                  onMouseEnter={(e) => setTooltip({ state: uf ?? codarea, total, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>
      {tooltip && (
        <div
          className="brazil-map-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            pointerEvents: 'none',
            zIndex: 20,
            background: '#141a34',
            border: '1px solid #262c4a',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 13,
            color: '#f5f7ff',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <strong>{STATE_LABEL[tooltip.state] ?? tooltip.state}</strong>
          <span>{tooltip.total === null ? 'Sem dados' : `${formatNumber(tooltip.total)} seguidores`}</span>
        </div>
      )}
    </div>
  )
}

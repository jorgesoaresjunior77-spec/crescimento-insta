import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import type { Feature, Geometry, Position } from 'geojson'
import { BRAZIL_STATES, type AudienceLocation } from '../lib/api'
import { bareCityName, formatNumber, formatPercentShortBR } from '../lib/metrics'
import { IBGE_UF_BY_CODAREA } from '../lib/ibgeStates'

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

interface TooltipCity {
  name: string
  followers_count: number
  percent: number
}

interface TooltipState {
  state: string
  total: number | null
  cities: TooltipCity[]
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

/**
 * Origem dos números deste mapa: `audience_locations.followers_count` (seguidores por
 * cidade), agregados por UF — nunca visualizações. `locations` já vem filtrado pelo
 * chamador (App.tsx) para conter só as cidades do registro diário mais recente que tenha
 * localizações (mesma referência temporal do card "Principais cidades"), então aqui só
 * agregamos o que foi recebido, sem somar múltiplos dias.
 */
export default function BrazilAudienceMap({ locations }: { locations: AudienceLocation[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { totalsByState, citiesByState } = useMemo(() => {
    const totals = new Map<string, number>()
    const cities = new Map<string, { name: string; followers_count: number }[]>()
    for (const loc of locations) {
      if (!loc.state) continue
      totals.set(loc.state, (totals.get(loc.state) ?? 0) + loc.followers_count)
      const list = cities.get(loc.state) ?? []
      list.push({ name: bareCityName(loc.city, loc.state), followers_count: loc.followers_count })
      cities.set(loc.state, list)
    }
    for (const list of cities.values()) list.sort((a, b) => b.followers_count - a.followers_count)
    return { totalsByState: totals, citiesByState: cities }
  }, [locations])

  const maxTotal = Math.max(0, ...totalsByState.values())

  function fillFor(uf: string | undefined): string {
    if (!uf) return NO_DATA_FILL
    const total = totalsByState.get(uf)
    if (!total) return NO_DATA_FILL
    const ratio = maxTotal > 0 ? total / maxTotal : 0
    // Raiz quadrada comprime a escala para que estados com participação pequena (ex.: um
    // estado com 6% do total do estado líder) continuem claramente distintos de "sem
    // dado" — com escala linear, esse mesmo estado ficava quase idêntico ao fundo neutro.
    const scaled = Math.sqrt(ratio)
    return mixHex(NO_DATA_FILL, SCALE_TO, 0.35 + scaled * 0.65)
  }

  function tooltipFor(uf: string): { total: number | null; cities: TooltipCity[] } {
    const total = totalsByState.get(uf) ?? null
    const cityList = citiesByState.get(uf) ?? []
    const cities = cityList.map((c) => ({
      name: c.name,
      followers_count: c.followers_count,
      percent: total ? (c.followers_count / total) * 100 : 0,
    }))
    return { total, cities }
  }

  return (
    <div className="brazil-map">
      <p className="chart-subtitle">Seguidores por cidade, agregados por estado (registro mais recente)</p>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-54.39, -15.12], scale: 585 }}
        width={760}
        height={460}
        style={{ width: '100%', height: 'auto', maxHeight: 520 }}
        role="img"
        aria-label="Mapa do Brasil com seguidores por cidade, agregados por estado"
      >
        <Geographies geography={GEO_URL} parseGeographies={fixRingWinding}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const codarea = String(geo.properties?.codarea ?? '')
              const uf = IBGE_UF_BY_CODAREA[codarea]
              const isHovered = tooltip?.state === (uf ?? codarea)
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fillFor(uf)}
                  stroke={isHovered ? HOVER_STROKE : STROKE}
                  strokeWidth={isHovered ? 1.5 : 1}
                  style={{ outline: 'none', cursor: 'default', transition: 'fill 0.15s ease, stroke 0.15s ease' }}
                  onMouseEnter={(e) => {
                    const key = uf ?? codarea
                    const { total, cities } = uf ? tooltipFor(uf) : { total: null, cities: [] }
                    setTooltip({ state: key, total, cities, x: e.clientX, y: e.clientY })
                  }}
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
            padding: '8px 12px',
            fontSize: 13,
            color: '#f5f7ff',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 160,
          }}
        >
          <strong>{STATE_LABEL[tooltip.state] ?? tooltip.state}</strong>
          {tooltip.cities.length === 0 ? (
            <span style={{ color: '#9aa3c4' }}>Sem dados</span>
          ) : (
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {tooltip.cities.map((c) => (
                  <tr key={c.name}>
                    <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>{c.name}</td>
                    <td style={{ paddingRight: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNumber(c.followers_count)}</td>
                    <td style={{ textAlign: 'right', color: '#9aa3c4', whiteSpace: 'nowrap' }}>{formatPercentShortBR(c.percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

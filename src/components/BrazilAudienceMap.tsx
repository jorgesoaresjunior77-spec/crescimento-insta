import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import type { Feature, Geometry, Position } from 'geojson'
import { BRAZIL_STATES, type AudienceLocation } from '../lib/api'
import { bareCityName, formatPercentShortBR } from '../lib/metrics'
import { IBGE_UF_BY_CODAREA } from '../lib/ibgeStates'
import { MAP_HOVER_STROKE, MAP_NO_DATA_FILL, MAP_STROKE, mapFillForRatio } from '../lib/mapColors'

const GEO_URL = '/brazil-states.geojson'

const STATE_LABEL: Record<string, string> = Object.fromEntries(BRAZIL_STATES.map((s) => [s.value, s.label]))

interface TooltipCity {
  name: string
  percent: number
}

interface HoverInfo {
  state: string
  cities: TooltipCity[]
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
 * Origem dos números deste mapa: `audience_locations.percent` (percentual da audiência
 * total por cidade, nunca contagem de seguidores) — `locations` já vem filtrado pelo
 * chamador (App.tsx) para conter só as cidades do registro diário mais recente que tenha
 * localizações (mesma referência temporal do card "Principais cidades"). A cor de cada
 * estado é a soma dos percentuais das suas cidades; o painel mostra o percentual de cada
 * cidade como foi cadastrado (não é recalculado como "% do estado").
 *
 * O painel de detalhes (estado + cidades) fica fixo no canto do card, nunca sobre o mapa:
 * ao passar o mouse sobre um estado, o painel só troca de conteúdo — não segue o cursor.
 */
export default function BrazilAudienceMap({ locations }: { locations: AudienceLocation[] }) {
  const [hovered, setHovered] = useState<HoverInfo | null>(null)

  const { totalsByState, citiesByState } = useMemo(() => {
    const totals = new Map<string, number>()
    const cities = new Map<string, TooltipCity[]>()
    for (const loc of locations) {
      if (!loc.state) continue
      totals.set(loc.state, (totals.get(loc.state) ?? 0) + loc.percent)
      const list = cities.get(loc.state) ?? []
      list.push({ name: bareCityName(loc.city, loc.state), percent: loc.percent })
      cities.set(loc.state, list)
    }
    for (const list of cities.values()) list.sort((a, b) => b.percent - a.percent)
    return { totalsByState: totals, citiesByState: cities }
  }, [locations])

  const maxTotal = Math.max(0, ...totalsByState.values())

  function fillFor(uf: string | undefined): string {
    if (!uf) return MAP_NO_DATA_FILL
    const total = totalsByState.get(uf)
    if (!total) return MAP_NO_DATA_FILL
    return mapFillForRatio(maxTotal > 0 ? total / maxTotal : 0)
  }

  function hoverInfoFor(uf: string): HoverInfo {
    return { state: uf, cities: citiesByState.get(uf) ?? [] }
  }

  return (
    <div className="chart-card audience-map-card">
      <h3>Mapa do Brasil</h3>
      <p className="chart-subtitle">Seguidores por cidade, % da audiência (registro mais recente)</p>
      <div className="audience-map-body">
        <div className="audience-map-visual">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [-54.39, -15.12], scale: 585 }}
            width={760}
            height={460}
            style={{ width: '100%', height: 'auto', maxHeight: 460 }}
            role="img"
            aria-label="Mapa do Brasil com percentual de seguidores por cidade, agregados por estado"
          >
            <Geographies geography={GEO_URL} parseGeographies={fixRingWinding}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const codarea = String(geo.properties?.codarea ?? '')
                  const uf = IBGE_UF_BY_CODAREA[codarea]
                  const isHovered = hovered?.state === (uf ?? codarea)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fillFor(uf)}
                      stroke={isHovered ? MAP_HOVER_STROKE : MAP_STROKE}
                      strokeWidth={isHovered ? 1.5 : 1}
                      style={{ outline: 'none', cursor: uf ? 'pointer' : 'default', transition: 'fill 0.15s ease, stroke 0.15s ease' }}
                      onMouseEnter={() => {
                        if (!uf) return
                        setHovered(hoverInfoFor(uf))
                      }}
                      onMouseLeave={() => setHovered(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ComposableMap>
        </div>
        <div className="audience-map-panel">
          {hovered ? (
            <>
              <strong className="audience-map-panel-title">{STATE_LABEL[hovered.state] ?? hovered.state}</strong>
              {hovered.cities.length === 0 ? (
                <span className="audience-map-panel-empty">Sem dados</span>
              ) : (
                <table className="audience-map-panel-table">
                  <tbody>
                    {hovered.cities.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="pct">{formatPercentShortBR(c.percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <span className="audience-map-panel-empty">Passe o mouse sobre um estado para ver o detalhamento por cidade.</span>
          )}
        </div>
      </div>
    </div>
  )
}

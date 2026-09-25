import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import type { AudienceCountry } from '../lib/api'
import { formatPercentShortBR } from '../lib/metrics'
import { COUNTRY_LABEL_BY_ALPHA2, ISO_NUMERIC_TO_ALPHA2 } from '../lib/worldCountries'
import { MAP_HOVER_STROKE, MAP_NO_DATA_FILL, MAP_STROKE, mapFillForRatio } from '../lib/mapColors'

const GEO_URL = '/world-countries.json'

interface HoverInfo {
  code: string
  label: string
  percent: number | null
}

/**
 * Espelha BrazilAudienceMap.tsx: mesma escala de cor, mesmo painel de detalhe fixo no
 * canto do card (nunca sobre o mapa). `countries` é sempre percentual (0–100), nunca
 * contagem — vem de `audience_countries` via GET /api/metrics (App.tsx), nunca de mock.
 * O nome exibido é o `country_name` gravado pelo usuário no formulário; só cai para o
 * mapeamento estático (`COUNTRY_LABEL_BY_ALPHA2`) ou o próprio código quando o país
 * hovered não está entre os registros carregados (ex.: país sem dado nenhum).
 */
export default function WorldAudienceMap({ countries }: { countries: AudienceCountry[] }) {
  const [hovered, setHovered] = useState<HoverInfo | null>(null)

  const countryByAlpha2 = useMemo(() => {
    const map = new Map<string, AudienceCountry>()
    for (const c of countries) map.set(c.country_code.toUpperCase(), c)
    return map
  }, [countries])
  const percentByAlpha2 = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of countries) map.set(c.country_code.toUpperCase(), c.percent)
    return map
  }, [countries])

  const maxPercent = Math.max(0, ...percentByAlpha2.values())

  function fillFor(alpha2: string | undefined): string {
    if (!alpha2) return MAP_NO_DATA_FILL
    const percent = percentByAlpha2.get(alpha2)
    if (!percent) return MAP_NO_DATA_FILL
    return mapFillForRatio(maxPercent > 0 ? percent / maxPercent : 0)
  }

  const sortedCountries = useMemo(() => [...countries].sort((a, b) => b.percent - a.percent), [countries])

  return (
    <div className="chart-card audience-map-card">
      <h3>Mapa Mundi</h3>
      <p className="chart-subtitle">Seguidores por país (% de audiência, registro mais recente)</p>
      <div className="audience-map-body">
        <div className="audience-map-visual">
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 148 }}
            width={760}
            height={460}
            style={{ width: '100%', height: 'auto', maxHeight: 460 }}
            role="img"
            aria-label="Mapa mundi com percentual de seguidores por país"
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const numericId = String(Number(geo.id))
                  const alpha2 = ISO_NUMERIC_TO_ALPHA2[numericId]
                  const isHovered = hovered?.code === (alpha2 ?? numericId)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fillFor(alpha2)}
                      stroke={isHovered ? MAP_HOVER_STROKE : MAP_STROKE}
                      strokeWidth={isHovered ? 1.5 : 0.5}
                      style={{ outline: 'none', cursor: alpha2 ? 'pointer' : 'default', transition: 'fill 0.15s ease, stroke 0.15s ease' }}
                      onMouseEnter={() => {
                        if (!alpha2) return
                        const label = countryByAlpha2.get(alpha2)?.country_name ?? COUNTRY_LABEL_BY_ALPHA2[alpha2] ?? alpha2
                        setHovered({ code: alpha2, label, percent: percentByAlpha2.get(alpha2) ?? null })
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
              <strong className="audience-map-panel-title">{hovered.label}</strong>
              {hovered.percent === null ? (
                <span className="audience-map-panel-empty">Sem dados</span>
              ) : (
                <span className="audience-map-panel-single">{formatPercentShortBR(hovered.percent)}</span>
              )}
            </>
          ) : sortedCountries.length > 0 ? (
            <>
              <strong className="audience-map-panel-title">Top países</strong>
              <table className="audience-map-panel-table">
                <tbody>
                  {sortedCountries.slice(0, 6).map((c) => (
                    <tr key={c.country_code}>
                      <td>{c.country_name}</td>
                      <td className="pct">{formatPercentShortBR(c.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <span className="audience-map-panel-empty">Passe o mouse sobre um país para ver o percentual.</span>
          )}
        </div>
      </div>
    </div>
  )
}

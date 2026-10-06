import { Area, AreaChart, CartesianGrid, Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyMetric } from '../lib/api'
import { formatCalendarDateBR } from '../lib/metrics'
import { CHART_GRID_COLOR, CHART_TICK_STYLE, GRADIENTS } from '../lib/palette'

/** Valor de `content_type_metrics` para (metric_type, content_type); null se não informado. */
function sumContentType(m: DailyMetric, metricType: string, contentType: string): number | null {
  const row = m.content_type_metrics.find((r) => r.metric_type === metricType && r.content_type === contentType)
  return row ? row.value : null
}

function GradientDefs() {
  return (
    <defs>
      {GRADIENTS.map((g) => (
        <linearGradient key={g.id} id={`grad-${g.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={g.from} stopOpacity={0.95} />
          <stop offset="100%" stopColor={g.to} stopOpacity={0.85} />
        </linearGradient>
      ))}
      {GRADIENTS.map((g) => (
        <linearGradient key={`fill-${g.id}`} id={`grad-fill-${g.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={g.to} stopOpacity={0.55} />
          <stop offset="100%" stopColor={g.to} stopOpacity={0.02} />
        </linearGradient>
      ))}
      <filter id="chart-depth" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.45" />
      </filter>
    </defs>
  )
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {empty ? (
        <p className="state-message chart-empty">Sem dados suficientes ainda. Cadastre novos registros para ver este gráfico.</p>
      ) : (
        <div className="chart-body">{children}</div>
      )}
    </div>
  )
}

const tooltipStyle = {
  background: '#141a34',
  border: '1px solid #262c4a',
  borderRadius: 8,
  color: '#f5f7ff',
  fontSize: 13,
}

export default function GrowthCharts({ metrics }: { metrics: DailyMetric[] }) {
  const series = metrics.map((m) => ({
    date: formatCalendarDateBR(m.date),
    followers: m.followers,
    views_total: m.views_total,
    interactions: m.interactions,
    views_stories: sumContentType(m, 'views', 'stories'),
    views_posts: sumContentType(m, 'views', 'posts'),
    views_reels: sumContentType(m, 'views', 'reels'),
  }))

  const latestCities = (() => {
    for (let i = metrics.length - 1; i >= 0; i--) {
      if (metrics[i].audience.locations.length > 0) return metrics[i].audience.locations
    }
    return []
  })()
  const cityData = [...latestCities].sort((a, b) => b.percent - a.percent).slice(0, 8)

  const hasViewsBreakdown = series.some((s) => s.views_stories !== null || s.views_posts !== null || s.views_reels !== null)

  return (
    <div className="charts-grid">
      <ChartCard title="Seguidores ao longo do tempo" empty={series.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={series}>
            <GradientDefs />
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f5f7ff' }} />
            <Area
              type="monotone"
              dataKey="followers"
              name="Seguidores"
              stroke="url(#grad-blue)"
              strokeWidth={3}
              fill="url(#grad-fill-blue)"
              dot={{ r: 4, fill: '#22d3ee', stroke: '#0a0d1a', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls
              style={{ filter: 'url(#chart-depth)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Visualizações e interações" empty={series.every((s) => s.views_total === null && s.interactions === null)}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={series}>
            <GradientDefs />
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f5f7ff' }} />
            <Legend wrapperStyle={{ color: '#9aa3c4', fontSize: 13 }} />
            <Area
              type="monotone"
              dataKey="views_total"
              name="Visualizações"
              stroke="url(#grad-teal)"
              strokeWidth={3}
              fill="url(#grad-fill-teal)"
              dot={{ r: 4, fill: '#22d3ee', stroke: '#0a0d1a', strokeWidth: 2 }}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="interactions"
              name="Interações"
              stroke="url(#grad-pink)"
              strokeWidth={3}
              fill="url(#grad-fill-pink)"
              dot={{ r: 4, fill: '#f97316', stroke: '#0a0d1a', strokeWidth: 2 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Visualizações por tipo de conteúdo" empty={!hasViewsBreakdown}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={series} barGap={4}>
            <GradientDefs />
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f5f7ff' }} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
            <Legend wrapperStyle={{ color: '#9aa3c4', fontSize: 13 }} />
            <Bar dataKey="views_stories" name="Stories" stackId="views" fill="url(#grad-orange)" radius={[0, 0, 0, 0]} style={{ filter: 'url(#chart-depth)' }} />
            <Bar dataKey="views_posts" name="Posts" stackId="views" fill="url(#grad-blue)" />
            <Bar dataKey="views_reels" name="Reels" stackId="views" fill="url(#grad-purple)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Principais cidades" empty={cityData.length === 0}>
        <ResponsiveContainer width="100%" height={Math.max(180, cityData.length * 36)}>
          <BarChart data={cityData} layout="vertical" margin={{ left: 24 }}>
            <GradientDefs />
            <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={CHART_TICK_STYLE} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis type="category" dataKey="city" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={110} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
            <Bar dataKey="percent" name="% da audiência" fill="url(#grad-violet)" radius={[0, 8, 8, 0]} style={{ filter: 'url(#chart-depth)' }} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

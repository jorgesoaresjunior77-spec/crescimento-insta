import {
  CartesianGrid,
  Cell,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyMetric } from '../lib/api'
import { AGE_RANGES, GENDER_LABELS, GENDERS, formatCalendarDateBR } from '../lib/metrics'

const PALETTE = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2']

function findLatestWithAudience<T>(metrics: DailyMetric[], pick: (m: DailyMetric) => T[]): T[] {
  for (let i = metrics.length - 1; i >= 0; i--) {
    const items = pick(metrics[i])
    if (items.length > 0) return items
  }
  return []
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {empty ? <p className="state-message">Sem dados suficientes ainda.</p> : <div className="chart-body">{children}</div>}
    </div>
  )
}

export default function GrowthCharts({ metrics }: { metrics: DailyMetric[] }) {
  const series = metrics.map((m) => ({
    date: formatCalendarDateBR(m.date),
    followers: m.followers,
    views_total: m.views_total,
    interactions: m.interactions,
    views_stories: m.views_stories,
    views_posts: m.views_posts,
    views_reels: m.views_reels,
  }))

  const latestGenders = findLatestWithAudience(metrics, (m) => m.audience.genders)
  const genderData = latestGenders.map((g) => ({ name: GENDER_LABELS[g.gender as (typeof GENDERS)[number]] ?? g.gender, value: g.followers_count }))

  const latestAges = findLatestWithAudience(metrics, (m) => m.audience.age_ranges)
  const ageOrder = new Map(AGE_RANGES.map((r, i) => [r, i]))
  const ageData = [...latestAges]
    .sort((a, b) => (ageOrder.get(a.age_range as (typeof AGE_RANGES)[number]) ?? 0) - (ageOrder.get(b.age_range as (typeof AGE_RANGES)[number]) ?? 0))
    .map((a) => ({ name: a.age_range, value: a.followers_count }))

  const latestCities = findLatestWithAudience(metrics, (m) => m.audience.locations)
  const cityData = [...latestCities].sort((a, b) => b.followers_count - a.followers_count).slice(0, 8)

  const hasViewsBreakdown = series.some((s) => s.views_stories !== null || s.views_posts !== null || s.views_reels !== null)

  return (
    <div className="charts-grid">
      <ChartCard title="Seguidores ao longo do tempo" empty={series.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="followers" name="Seguidores" stroke={PALETTE[0]} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Visualizações e interações" empty={series.every((s) => s.views_total === null && s.interactions === null)}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="views_total" name="Visualizações" stroke={PALETTE[1]} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="interactions" name="Interações" stroke={PALETTE[2]} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Visualizações por tipo de conteúdo" empty={!hasViewsBreakdown}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="views_stories" name="Stories" stackId="views" fill={PALETTE[3]} />
            <Bar dataKey="views_posts" name="Posts" stackId="views" fill={PALETTE[1]} />
            <Bar dataKey="views_reels" name="Reels" stackId="views" fill={PALETTE[4]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Audiência por gênero" empty={genderData.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={genderData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {genderData.map((entry, i) => (
                <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Audiência por faixa etária" empty={ageData.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={ageData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {ageData.map((entry, i) => (
                <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Principais cidades" empty={cityData.length === 0}>
        <ResponsiveContainer width="100%" height={Math.max(180, cityData.length * 36)}>
          <BarChart data={cityData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="city" tick={{ fontSize: 12 }} width={110} />
            <Tooltip />
            <Bar dataKey="followers_count" name="Seguidores" fill={PALETTE[5]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

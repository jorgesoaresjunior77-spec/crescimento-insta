import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  ApiError,
  createMetric,
  fetchAccounts,
  fetchMetrics,
  updateMetric,
  type Account,
  type DailyMetric,
  type NewMetricInput,
} from './lib/api'
import {
  PERIOD_PRESET_LABELS,
  type PeriodPreset,
  computeVariation,
  formatCalendarDateBR,
  formatNumber,
  periodRange,
  todayIsoLocal,
} from './lib/metrics'
import MetricForm from './components/MetricForm'
import GrowthCharts from './components/GrowthCharts'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: T }

function VariationBadge({ label, variation }: { label: string; variation: ReturnType<typeof computeVariation> }) {
  if (!variation) {
    return (
      <div className="stat">
        <span className="stat-label">{label}</span>
        <span className="stat-value">indisponível</span>
      </div>
    )
  }
  const sign = variation.absolute > 0 ? '+' : ''
  const percentText = variation.percent === null ? '' : ` (${sign}${variation.percent.toFixed(1)}%)`
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${variation.absolute >= 0 ? 'positive' : 'negative'}`}>
        {sign}
        {variation.absolute.toLocaleString('pt-BR')}
        {percentText}
      </span>
    </div>
  )
}

function App() {
  const [accountsState, setAccountsState] = useState<LoadState<Account[]>>({ status: 'loading' })
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [metricsState, setMetricsState] = useState<LoadState<DailyMetric[]>>({ status: 'loading' })
  const [goalDraft, setGoalDraft] = useState('')
  const [accountsReload, setAccountsReload] = useState(0)
  const [metricsReload, setMetricsReload] = useState(0)

  const [createStatus, setCreateStatus] = useState<'idle' | 'saving'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<'idle' | 'saving'>('idle')
  const [editError, setEditError] = useState<string | null>(null)

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [customFrom, setCustomFrom] = useState(todayIsoLocal())
  const [customTo, setCustomTo] = useState(todayIsoLocal())

  useEffect(() => {
    let cancelled = false
    setAccountsState({ status: 'loading' })
    fetchAccounts()
      .then((accounts) => {
        if (cancelled) return
        if (accounts.length === 0) {
          setAccountsState({ status: 'empty' })
          return
        }
        setAccountsState({ status: 'ready', data: accounts })
        setSelectedAccountId((current) => (current && accounts.some((a) => a.id === current) ? current : accounts[0].id))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAccountsState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido ao carregar contas.' })
      })
    return () => {
      cancelled = true
    }
  }, [accountsReload])

  useEffect(() => {
    if (!selectedAccountId) return
    let cancelled = false
    setMetricsState({ status: 'loading' })
    fetchMetrics(selectedAccountId)
      .then((metrics) => {
        if (cancelled) return
        setMetricsState(metrics.length === 0 ? { status: 'empty' } : { status: 'ready', data: metrics })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setMetricsState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido ao carregar histórico.' })
      })
    return () => {
      cancelled = true
    }
  }, [selectedAccountId, metricsReload])

  const selectedAccount = accountsState.status === 'ready' ? (accountsState.data.find((a) => a.id === selectedAccountId) ?? null) : null

  useEffect(() => {
    setGoalDraft(selectedAccount?.follower_goal != null ? String(selectedAccount.follower_goal) : '')
  }, [selectedAccount?.id, selectedAccount?.follower_goal])

  const sortedMetrics = useMemo(
    () => (metricsState.status === 'ready' ? [...metricsState.data].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [metricsState],
  )

  const range = useMemo(() => periodRange(periodPreset, customFrom, customTo), [periodPreset, customFrom, customTo])
  const filteredMetrics = useMemo(
    () => sortedMetrics.filter((m) => m.date >= range.from && m.date <= range.to),
    [sortedMetrics, range],
  )

  const latestMetric = sortedMetrics.length > 0 ? sortedMetrics[sortedMetrics.length - 1] : null

  const followerVariation = useMemo(() => {
    if (filteredMetrics.length === 0) return null
    const lastInRange = filteredMetrics[filteredMetrics.length - 1]
    const idxInFull = sortedMetrics.findIndex((m) => m.id === lastInRange.id)
    const previous = idxInFull > 0 ? sortedMetrics[idxInFull - 1].followers : null
    return computeVariation(lastInRange.followers, previous)
  }, [filteredMetrics, sortedMetrics])

  const periodVariation = useMemo(() => {
    if (filteredMetrics.length < 2) return null
    const first = filteredMetrics[0]
    const last = filteredMetrics[filteredMetrics.length - 1]
    return computeVariation(last.followers, first.followers)
  }, [filteredMetrics])

  function handleCreateSubmit(input: NewMetricInput) {
    setCreateStatus('saving')
    setCreateError(null)
    createMetric(input)
      .then(() => {
        setMetricsReload((n) => n + 1)
      })
      .catch((err: unknown) => {
        setCreateError(err instanceof ApiError ? err.message : 'Erro desconhecido ao salvar.')
      })
      .finally(() => setCreateStatus('idle'))
  }

  function handleEditSubmit(id: string, input: NewMetricInput) {
    setEditStatus('saving')
    setEditError(null)
    updateMetric(id, {
      date: input.date,
      followers: input.followers,
      reach: input.reach,
      interactions: input.interactions,
      profile_visits: input.profile_visits,
      posts_published: input.posts_published,
      note: input.note,
      views_total: input.views_total,
      views_from_followers: input.views_from_followers,
      views_from_non_followers: input.views_from_non_followers,
      viewers_total: input.viewers_total,
      views_stories: input.views_stories,
      views_posts: input.views_posts,
      views_reels: input.views_reels,
      interactions_from_followers: input.interactions_from_followers,
      interactions_from_non_followers: input.interactions_from_non_followers,
      replies: input.replies,
      shares: input.shares,
      likes: input.likes,
      comments: input.comments,
      audience: input.audience,
    })
      .then(() => {
        setEditingId(null)
        setMetricsReload((n) => n + 1)
      })
      .catch((err: unknown) => {
        setEditError(err instanceof ApiError ? err.message : 'Erro desconhecido ao salvar.')
      })
      .finally(() => setEditStatus('idle'))
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Crescimento Insta</h1>
        <p>Instagram Growth Intelligence — @marlucebfernandes</p>
      </header>

      {accountsState.status === 'loading' && <p className="state-message">Carregando contas...</p>}
      {accountsState.status === 'error' && (
        <div className="state-message state-error">
          <p>Erro ao carregar contas: {accountsState.message}</p>
          <button type="button" onClick={() => setAccountsReload((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {accountsState.status === 'empty' && <p className="state-message">Nenhuma conta cadastrada.</p>}

      {selectedAccount && (
        <section className="account-card">
          <div className="account-identity">
            <h2>{selectedAccount.name}</h2>
            <span className="account-since">Conta desde {formatCalendarDateBR(selectedAccount.created_at)}</span>
          </div>

          <div className="account-stats">
            <div className="stat">
              <span className="stat-label">Seguidores atuais</span>
              <span className="stat-value">{latestMetric ? formatNumber(latestMetric.followers) : 'indisponível'}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Meta de seguidores</span>
              <input type="number" className="goal-input" min={0} value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} placeholder="indisponível" />
              <span className="stat-hint">Edição apenas visual — ainda não é salva.</span>
            </div>
            <VariationBadge label="Variação (último registro)" variation={followerVariation} />
            <VariationBadge label={`Variação no período (${PERIOD_PRESET_LABELS[periodPreset]})`} variation={periodVariation} />
          </div>
        </section>
      )}

      {selectedAccount && (
        <section className="period-filter">
          <span className="period-filter-label">Período:</span>
          {(Object.keys(PERIOD_PRESET_LABELS) as PeriodPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className={preset === periodPreset ? 'period-btn active' : 'period-btn'}
              onClick={() => setPeriodPreset(preset)}
            >
              {PERIOD_PRESET_LABELS[preset]}
            </button>
          ))}
          {periodPreset === 'custom' && (
            <span className="custom-range">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span>até</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </span>
          )}
        </section>
      )}

      {selectedAccount && metricsState.status === 'ready' && (
        <section className="charts-section">
          <h2>Dashboard</h2>
          <GrowthCharts metrics={filteredMetrics} />
        </section>
      )}

      {selectedAccount && (
        <section className="add-metric">
          <h2>Adicionar registro</h2>
          <MetricForm accountId={selectedAccount.id} mode="create" submitting={createStatus === 'saving'} error={createError} onSubmit={handleCreateSubmit} />
        </section>
      )}

      <section className="history">
        <h2>Histórico de métricas</h2>

        {metricsState.status === 'loading' && <p className="state-message">Carregando histórico...</p>}
        {metricsState.status === 'error' && (
          <div className="state-message state-error">
            <p>Erro ao carregar histórico: {metricsState.message}</p>
            <button type="button" onClick={() => setMetricsReload((n) => n + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {metricsState.status === 'empty' && <p className="state-message">Nenhum histórico de métricas disponível para esta conta.</p>}

        {metricsState.status === 'ready' && filteredMetrics.length === 0 && (
          <p className="state-message">Nenhum registro no período selecionado.</p>
        )}

        {metricsState.status === 'ready' && filteredMetrics.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Seguidores</th>
                  <th>Posts</th>
                  <th>Visualizações</th>
                  <th>Interações</th>
                  <th>Curtidas</th>
                  <th>Comentários</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...filteredMetrics].reverse().map((m) =>
                  editingId === m.id ? (
                    <tr key={m.id} className="editing-row">
                      <td colSpan={8}>
                        <MetricForm
                          accountId={m.account_id}
                          mode="edit"
                          initial={m}
                          submitting={editStatus === 'saving'}
                          error={editError}
                          onSubmit={(input) => handleEditSubmit(m.id, input)}
                          onCancel={() => {
                            setEditingId(null)
                            setEditError(null)
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id}>
                      <td>{formatCalendarDateBR(m.date)}</td>
                      <td>{formatNumber(m.followers)}</td>
                      <td>{formatNumber(m.posts_published)}</td>
                      <td>{formatNumber(m.views_total)}</td>
                      <td>{formatNumber(m.interactions)}</td>
                      <td>{formatNumber(m.likes)}</td>
                      <td>{formatNumber(m.comments)}</td>
                      <td className="row-actions">
                        <button type="button" onClick={() => setEditingId(m.id)}>
                          Ver / Editar
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default App

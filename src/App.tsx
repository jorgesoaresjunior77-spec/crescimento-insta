import { useEffect, useState } from 'react'
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

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: T }

function formatCalendarDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function formatNumber(value: number | null): string {
  return value === null ? 'indisponível' : value.toLocaleString('pt-BR')
}

/** '' -> null (campo não informado); string numérica -> número; qualquer outra coisa -> 'invalid' */
function parseOptionalInt(raw: string): number | null | 'invalid' {
  if (raw.trim() === '') return null
  if (!/^\d+$/.test(raw.trim())) return 'invalid'
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

function parseRequiredInt(raw: string): number | 'invalid' {
  if (!/^\d+$/.test(raw.trim())) return 'invalid'
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

interface MetricFormValues {
  date: string
  followers: string
  reach: string
  interactions: string
  profile_visits: string
  posts_published: string
  note: string
}

const EMPTY_FORM: MetricFormValues = {
  date: '',
  followers: '',
  reach: '',
  interactions: '',
  profile_visits: '',
  posts_published: '',
  note: '',
}

function metricToFormValues(m: DailyMetric): MetricFormValues {
  return {
    date: m.date.slice(0, 10),
    followers: String(m.followers),
    reach: m.reach === null ? '' : String(m.reach),
    interactions: m.interactions === null ? '' : String(m.interactions),
    profile_visits: m.profile_visits === null ? '' : String(m.profile_visits),
    posts_published: m.posts_published === null ? '' : String(m.posts_published),
    note: m.note ?? '',
  }
}

function App() {
  const [accountsState, setAccountsState] = useState<LoadState<Account[]>>({
    status: 'loading',
  })
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [metricsState, setMetricsState] = useState<LoadState<DailyMetric[]>>({
    status: 'loading',
  })
  const [goalDraft, setGoalDraft] = useState('')
  const [accountsReload, setAccountsReload] = useState(0)
  const [metricsReload, setMetricsReload] = useState(0)

  const [createForm, setCreateForm] = useState<MetricFormValues>(EMPTY_FORM)
  const [createStatus, setCreateStatus] = useState<'idle' | 'saving'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<MetricFormValues>(EMPTY_FORM)
  const [editStatus, setEditStatus] = useState<'idle' | 'saving'>('idle')
  const [editError, setEditError] = useState<string | null>(null)

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
        setSelectedAccountId((current) =>
          current && accounts.some((a) => a.id === current) ? current : accounts[0].id,
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAccountsState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido ao carregar contas.',
        })
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
        setMetricsState(
          metrics.length === 0 ? { status: 'empty' } : { status: 'ready', data: metrics },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setMetricsState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido ao carregar histórico.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [selectedAccountId, metricsReload])

  const selectedAccount =
    accountsState.status === 'ready'
      ? (accountsState.data.find((a) => a.id === selectedAccountId) ?? null)
      : null

  useEffect(() => {
    setGoalDraft(selectedAccount?.follower_goal != null ? String(selectedAccount.follower_goal) : '')
  }, [selectedAccount?.id, selectedAccount?.follower_goal])

  const sortedMetrics =
    metricsState.status === 'ready'
      ? [...metricsState.data].sort((a, b) => a.date.localeCompare(b.date))
      : []
  const latestMetric = sortedMetrics.length > 0 ? sortedMetrics[sortedMetrics.length - 1] : null

  function buildMetricInput(
    accountId: string,
    values: MetricFormValues,
  ): NewMetricInput | { fieldError: string } {
    if (!values.date) return { fieldError: 'Informe a data.' }
    const followers = parseRequiredInt(values.followers)
    if (followers === 'invalid') return { fieldError: 'Seguidores deve ser um número inteiro maior ou igual a 0.' }
    const reach = parseOptionalInt(values.reach)
    if (reach === 'invalid') return { fieldError: 'Alcance deve ser um número inteiro maior ou igual a 0.' }
    const interactions = parseOptionalInt(values.interactions)
    if (interactions === 'invalid') return { fieldError: 'Interações deve ser um número inteiro maior ou igual a 0.' }
    const profileVisits = parseOptionalInt(values.profile_visits)
    if (profileVisits === 'invalid') return { fieldError: 'Visitas ao perfil deve ser um número inteiro maior ou igual a 0.' }
    const postsPublished = parseOptionalInt(values.posts_published)
    if (postsPublished === 'invalid') return { fieldError: 'Posts publicados deve ser um número inteiro maior ou igual a 0.' }
    return {
      account_id: accountId,
      date: values.date,
      followers,
      reach,
      interactions,
      profile_visits: profileVisits,
      posts_published: postsPublished,
      note: values.note.trim() === '' ? null : values.note.trim(),
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAccount) return
    const input = buildMetricInput(selectedAccount.id, createForm)
    if ('fieldError' in input) {
      setCreateError(input.fieldError)
      return
    }
    setCreateStatus('saving')
    setCreateError(null)
    try {
      await createMetric(input)
      setCreateForm(EMPTY_FORM)
      setMetricsReload((n) => n + 1)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Erro desconhecido ao salvar.')
    } finally {
      setCreateStatus('idle')
    }
  }

  function handleEditStart(m: DailyMetric) {
    setEditingId(m.id)
    setEditDraft(metricToFormValues(m))
    setEditError(null)
  }

  function handleEditCancel() {
    setEditingId(null)
    setEditError(null)
  }

  async function handleEditSave(m: DailyMetric) {
    const input = buildMetricInput(m.account_id, editDraft)
    if ('fieldError' in input) {
      setEditError(input.fieldError)
      return
    }
    setEditStatus('saving')
    setEditError(null)
    try {
      await updateMetric(m.id, {
        date: input.date,
        followers: input.followers,
        reach: input.reach,
        interactions: input.interactions,
        profile_visits: input.profile_visits,
        posts_published: input.posts_published,
        note: input.note,
      })
      setEditingId(null)
      setMetricsReload((n) => n + 1)
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Erro desconhecido ao salvar.')
    } finally {
      setEditStatus('idle')
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Crescimento Insta</h1>
        <p>Painel de acompanhamento de crescimento no Instagram</p>
      </header>

      {accountsState.status === 'loading' && (
        <p className="state-message">Carregando contas...</p>
      )}

      {accountsState.status === 'error' && (
        <div className="state-message state-error">
          <p>Erro ao carregar contas: {accountsState.message}</p>
          <button type="button" onClick={() => setAccountsReload((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}

      {accountsState.status === 'empty' && (
        <p className="state-message">Nenhuma conta cadastrada.</p>
      )}

      {accountsState.status === 'ready' && accountsState.data.length > 1 && (
        <label className="account-select">
          Conta
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accountsState.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedAccount && (
        <section className="account-card">
          <div className="account-identity">
            <h2>{selectedAccount.name}</h2>
            <span className="account-since">
              Conta desde {formatCalendarDateBR(selectedAccount.created_at)}
            </span>
          </div>

          <div className="account-stats">
            <div className="stat">
              <span className="stat-label">Seguidores atuais</span>
              <span className="stat-value">
                {latestMetric ? formatNumber(latestMetric.followers) : 'indisponível'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Meta de seguidores</span>
              <input
                type="number"
                className="goal-input"
                min={0}
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="indisponível"
              />
              <span className="stat-hint">Edição apenas visual — ainda não é salva.</span>
            </div>
          </div>
        </section>
      )}

      {selectedAccount && (
        <section className="add-metric">
          <h2>Adicionar registro</h2>
          <form className="metric-form" onSubmit={handleCreateSubmit}>
            <label>
              Data
              <input
                type="date"
                required
                value={createForm.date}
                onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
              />
            </label>
            <label>
              Seguidores
              <input
                type="number"
                min={0}
                required
                value={createForm.followers}
                onChange={(e) => setCreateForm({ ...createForm, followers: e.target.value })}
              />
            </label>
            <label>
              Alcance
              <input
                type="number"
                min={0}
                placeholder="indisponível"
                value={createForm.reach}
                onChange={(e) => setCreateForm({ ...createForm, reach: e.target.value })}
              />
            </label>
            <label>
              Interações
              <input
                type="number"
                min={0}
                placeholder="indisponível"
                value={createForm.interactions}
                onChange={(e) => setCreateForm({ ...createForm, interactions: e.target.value })}
              />
            </label>
            <label>
              Visitas ao perfil
              <input
                type="number"
                min={0}
                placeholder="indisponível"
                value={createForm.profile_visits}
                onChange={(e) => setCreateForm({ ...createForm, profile_visits: e.target.value })}
              />
            </label>
            <label>
              Posts publicados
              <input
                type="number"
                min={0}
                placeholder="indisponível"
                value={createForm.posts_published}
                onChange={(e) => setCreateForm({ ...createForm, posts_published: e.target.value })}
              />
            </label>
            <label className="note-field">
              Nota
              <input
                type="text"
                placeholder="opcional"
                value={createForm.note}
                onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
              />
            </label>
            <button type="submit" disabled={createStatus === 'saving'}>
              {createStatus === 'saving' ? 'Salvando...' : 'Adicionar registro'}
            </button>
          </form>
          {createError && <p className="state-message state-error">{createError}</p>}
        </section>
      )}

      <section className="history">
        <h2>Histórico de métricas</h2>

        {metricsState.status === 'loading' && (
          <p className="state-message">Carregando histórico...</p>
        )}

        {metricsState.status === 'error' && (
          <div className="state-message state-error">
            <p>Erro ao carregar histórico: {metricsState.message}</p>
            <button type="button" onClick={() => setMetricsReload((n) => n + 1)}>
              Tentar novamente
            </button>
          </div>
        )}

        {metricsState.status === 'empty' && (
          <p className="state-message">Nenhum histórico de métricas disponível para esta conta.</p>
        )}

        {metricsState.status === 'ready' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Seguidores</th>
                  <th>Alcance</th>
                  <th>Interações</th>
                  <th>Visitas ao perfil</th>
                  <th>Posts publicados</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedMetrics.map((m) =>
                  editingId === m.id ? (
                    <tr key={m.id} className="editing-row">
                      <td>
                        <input
                          type="date"
                          value={editDraft.date}
                          onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editDraft.followers}
                          onChange={(e) => setEditDraft({ ...editDraft, followers: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editDraft.reach}
                          onChange={(e) => setEditDraft({ ...editDraft, reach: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editDraft.interactions}
                          onChange={(e) => setEditDraft({ ...editDraft, interactions: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editDraft.profile_visits}
                          onChange={(e) => setEditDraft({ ...editDraft, profile_visits: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={editDraft.posts_published}
                          onChange={(e) => setEditDraft({ ...editDraft, posts_published: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editDraft.note}
                          onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                        />
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          disabled={editStatus === 'saving'}
                          onClick={() => handleEditSave(m)}
                        >
                          {editStatus === 'saving' ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button type="button" onClick={handleEditCancel} disabled={editStatus === 'saving'}>
                          Cancelar
                        </button>
                        {editError && <p className="state-message state-error edit-error">{editError}</p>}
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id}>
                      <td>{formatCalendarDateBR(m.date)}</td>
                      <td>{formatNumber(m.followers)}</td>
                      <td>{formatNumber(m.reach)}</td>
                      <td>{formatNumber(m.interactions)}</td>
                      <td>{formatNumber(m.profile_visits)}</td>
                      <td>{formatNumber(m.posts_published)}</td>
                      <td>{m.note ?? 'indisponível'}</td>
                      <td className="row-actions">
                        <button type="button" onClick={() => handleEditStart(m)}>
                          Editar
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

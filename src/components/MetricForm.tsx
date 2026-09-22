import { useState } from 'react'
import type { DailyMetric, NewMetricInput } from '../lib/api'
import { AGE_RANGES, GENDERS, GENDER_LABELS, parseOptionalInt, parseRequiredInt, percentage, formatPercent } from '../lib/metrics'

const OPTIONAL_INT_FIELDS = [
  'reach',
  'interactions',
  'profile_visits',
  'posts_published',
  'views_total',
  'views_from_followers',
  'views_from_non_followers',
  'viewers_total',
  'views_stories',
  'views_posts',
  'views_reels',
  'interactions_from_followers',
  'interactions_from_non_followers',
  'replies',
  'shares',
  'likes',
  'comments',
] as const
type OptionalIntField = (typeof OPTIONAL_INT_FIELDS)[number]

const FIELD_LABELS: Record<OptionalIntField, string> = {
  reach: 'Alcance',
  interactions: 'Interações totais',
  profile_visits: 'Visitas ao perfil',
  posts_published: 'Posts publicados',
  views_total: 'Visualizações totais',
  views_from_followers: 'Visualizações de seguidores',
  views_from_non_followers: 'Visualizações de não seguidores',
  viewers_total: 'Visualizadores (contas únicas)',
  views_stories: 'Visualizações em Stories',
  views_posts: 'Visualizações em Posts',
  views_reels: 'Visualizações em Reels',
  interactions_from_followers: 'Interações de seguidores',
  interactions_from_non_followers: 'Interações de não seguidores',
  replies: 'Respostas',
  shares: 'Compartilhamentos',
  likes: 'Curtidas',
  comments: 'Comentários',
}

interface LocationDraft {
  city: string
  count: string
}

type FormValues = {
  date: string
  followers: string
  note: string
} & Record<OptionalIntField, string>

function emptyFormValues(): FormValues {
  const base = { date: '', followers: '', note: '' } as FormValues
  for (const field of OPTIONAL_INT_FIELDS) base[field] = ''
  return base
}

function metricToFormValues(m: DailyMetric): FormValues {
  const base = {
    date: m.date.slice(0, 10),
    followers: String(m.followers),
    note: m.note ?? '',
  } as FormValues
  for (const field of OPTIONAL_INT_FIELDS) {
    const value = m[field]
    base[field] = value === null || value === undefined ? '' : String(value)
  }
  return base
}

function metricToAgeDrafts(m?: DailyMetric): Record<string, string> {
  const out: Record<string, string> = {}
  for (const range of AGE_RANGES) out[range] = ''
  if (m) {
    for (const row of m.audience.age_ranges) out[row.age_range] = String(row.followers_count)
  }
  return out
}

function metricToGenderDrafts(m?: DailyMetric): Record<string, string> {
  const out: Record<string, string> = {}
  for (const gender of GENDERS) out[gender] = ''
  if (m) {
    for (const row of m.audience.genders) out[row.gender] = String(row.followers_count)
  }
  return out
}

function metricToLocationDrafts(m?: DailyMetric): LocationDraft[] {
  if (m && m.audience.locations.length > 0) {
    return m.audience.locations.map((l) => ({ city: l.city, count: String(l.followers_count) }))
  }
  return [
    { city: 'São Paulo', count: '' },
    { city: 'Rio de Janeiro', count: '' },
    { city: 'Belo Horizonte', count: '' },
  ]
}

interface MetricFormProps {
  accountId: string
  mode: 'create' | 'edit'
  initial?: DailyMetric
  submitting: boolean
  error: string | null
  onSubmit: (input: NewMetricInput) => void
  onCancel?: () => void
}

export default function MetricForm({ accountId, mode, initial, submitting, error, onSubmit, onCancel }: MetricFormProps) {
  const [values, setValues] = useState<FormValues>(() => (initial ? metricToFormValues(initial) : emptyFormValues()))
  const [ageDrafts, setAgeDrafts] = useState<Record<string, string>>(() => metricToAgeDrafts(initial))
  const [genderDrafts, setGenderDrafts] = useState<Record<string, string>>(() => metricToGenderDrafts(initial))
  const [locationDrafts, setLocationDrafts] = useState<LocationDraft[]>(() => metricToLocationDrafts(initial))
  const [fieldError, setFieldError] = useState<string | null>(null)

  function setField(field: OptionalIntField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw }))
  }

  function addLocationRow() {
    setLocationDrafts((rows) => [...rows, { city: '', count: '' }])
  }
  function removeLocationRow(index: number) {
    setLocationDrafts((rows) => rows.filter((_, i) => i !== index))
  }
  function updateLocationRow(index: number, patch: Partial<LocationDraft>) {
    setLocationDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const genderTotal = GENDERS.reduce((sum, g) => {
    const parsed = parseOptionalInt(genderDrafts[g] ?? '')
    return sum + (typeof parsed === 'number' ? parsed : 0)
  }, 0)
  const ageTotal = AGE_RANGES.reduce((sum, r) => {
    const parsed = parseOptionalInt(ageDrafts[r] ?? '')
    return sum + (typeof parsed === 'number' ? parsed : 0)
  }, 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (!values.date) {
      setFieldError('Informe a data.')
      return
    }
    const followers = parseRequiredInt(values.followers)
    if (followers === 'invalid') {
      setFieldError('Seguidores deve ser um número inteiro maior ou igual a 0.')
      return
    }

    const parsedOptional: Partial<Record<OptionalIntField, number | null>> = {}
    for (const field of OPTIONAL_INT_FIELDS) {
      const parsed = parseOptionalInt(values[field])
      if (parsed === 'invalid') {
        setFieldError(`${FIELD_LABELS[field]} deve ser um número inteiro maior ou igual a 0.`)
        return
      }
      parsedOptional[field] = parsed
    }

    const locations: { city: string; followers_count: number }[] = []
    for (const row of locationDrafts) {
      if (row.city.trim() === '' && row.count.trim() === '') continue
      if (row.city.trim() === '') {
        setFieldError('Informe o nome da cidade ou deixe a linha vazia.')
        return
      }
      const count = parseOptionalInt(row.count)
      if (count === 'invalid') {
        setFieldError(`Quantidade inválida para a cidade ${row.city}.`)
        return
      }
      if (count === null) continue
      locations.push({ city: row.city.trim(), followers_count: count })
    }

    const ageRanges: { age_range: string; followers_count: number }[] = []
    for (const range of AGE_RANGES) {
      const count = parseOptionalInt(ageDrafts[range] ?? '')
      if (count === 'invalid') {
        setFieldError(`Quantidade inválida para a faixa etária ${range}.`)
        return
      }
      if (count !== null) ageRanges.push({ age_range: range, followers_count: count })
    }

    const genders: { gender: string; followers_count: number }[] = []
    for (const gender of GENDERS) {
      const count = parseOptionalInt(genderDrafts[gender] ?? '')
      if (count === 'invalid') {
        setFieldError(`Quantidade inválida para o gênero ${GENDER_LABELS[gender]}.`)
        return
      }
      if (count !== null) genders.push({ gender, followers_count: count })
    }

    onSubmit({
      account_id: accountId,
      date: values.date,
      followers,
      reach: parsedOptional.reach ?? null,
      interactions: parsedOptional.interactions ?? null,
      profile_visits: parsedOptional.profile_visits ?? null,
      posts_published: parsedOptional.posts_published ?? null,
      note: values.note.trim() === '' ? null : values.note.trim(),
      views_total: parsedOptional.views_total ?? null,
      views_from_followers: parsedOptional.views_from_followers ?? null,
      views_from_non_followers: parsedOptional.views_from_non_followers ?? null,
      viewers_total: parsedOptional.viewers_total ?? null,
      views_stories: parsedOptional.views_stories ?? null,
      views_posts: parsedOptional.views_posts ?? null,
      views_reels: parsedOptional.views_reels ?? null,
      interactions_from_followers: parsedOptional.interactions_from_followers ?? null,
      interactions_from_non_followers: parsedOptional.interactions_from_non_followers ?? null,
      replies: parsedOptional.replies ?? null,
      shares: parsedOptional.shares ?? null,
      likes: parsedOptional.likes ?? null,
      comments: parsedOptional.comments ?? null,
      audience: { locations, age_ranges: ageRanges, genders },
    })
  }

  function numberField(field: OptionalIntField) {
    return (
      <label key={field}>
        {FIELD_LABELS[field]}
        <input
          type="number"
          min={0}
          placeholder="indisponível"
          value={values[field]}
          onChange={(e) => setField(field, e.target.value)}
        />
      </label>
    )
  }

  const viewsSumMismatch =
    values.views_total !== '' &&
    values.views_from_followers !== '' &&
    values.views_from_non_followers !== '' &&
    Number(values.views_from_followers) + Number(values.views_from_non_followers) !== Number(values.views_total)

  const interactionsSumMismatch =
    values.interactions !== '' &&
    values.interactions_from_followers !== '' &&
    values.interactions_from_non_followers !== '' &&
    Number(values.interactions_from_followers) + Number(values.interactions_from_non_followers) !== Number(values.interactions)

  return (
    <form className="metric-form-v2" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Básico</legend>
        <div className="field-grid">
          <label>
            Data
            <input type="date" required value={values.date} onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))} />
          </label>
          <label>
            Seguidores totais
            <input type="number" min={0} required value={values.followers} onChange={(e) => setValues((v) => ({ ...v, followers: e.target.value }))} />
          </label>
          {numberField('posts_published')}
          {numberField('profile_visits')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Visualizações</legend>
        <div className="field-grid">
          {numberField('reach')}
          {numberField('views_total')}
          {numberField('viewers_total')}
          {numberField('views_from_followers')}
          {numberField('views_from_non_followers')}
        </div>
        {viewsSumMismatch && (
          <p className="field-hint">
            Seguidores + não seguidores ({Number(values.views_from_followers) + Number(values.views_from_non_followers)}) não bate com o
            total ({values.views_total}).
          </p>
        )}
        <div className="field-grid">
          {numberField('views_stories')}
          {numberField('views_posts')}
          {numberField('views_reels')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Interações</legend>
        <div className="field-grid">
          {numberField('interactions')}
          {numberField('interactions_from_followers')}
          {numberField('interactions_from_non_followers')}
        </div>
        {interactionsSumMismatch && (
          <p className="field-hint">
            Seguidores + não seguidores ({Number(values.interactions_from_followers) + Number(values.interactions_from_non_followers)})
            não bate com o total ({values.interactions}).
          </p>
        )}
        <div className="field-grid">
          {numberField('likes')}
          {numberField('comments')}
          {numberField('shares')}
          {numberField('replies')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Audiência — localização</legend>
        <div className="audience-locations">
          {locationDrafts.map((row, i) => (
            <div className="location-row" key={i}>
              <input
                type="text"
                placeholder="Cidade"
                value={row.city}
                onChange={(e) => updateLocationRow(i, { city: e.target.value })}
              />
              <input
                type="number"
                min={0}
                placeholder="Seguidores"
                value={row.count}
                onChange={(e) => updateLocationRow(i, { count: e.target.value })}
              />
              <button type="button" onClick={() => removeLocationRow(i)} aria-label={`Remover ${row.city || 'cidade'}`}>
                Remover
              </button>
            </div>
          ))}
          <button type="button" onClick={addLocationRow}>
            + Adicionar cidade
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Audiência — faixa etária</legend>
        <div className="field-grid">
          {AGE_RANGES.map((range) => {
            const parsed = parseOptionalInt(ageDrafts[range] ?? '')
            const count = typeof parsed === 'number' ? parsed : 0
            return (
              <label key={range}>
                {range}
                <input
                  type="number"
                  min={0}
                  placeholder="indisponível"
                  value={ageDrafts[range] ?? ''}
                  onChange={(e) => setAgeDrafts((d) => ({ ...d, [range]: e.target.value }))}
                />
                <span className="field-percent">{ageDrafts[range] ? formatPercent(percentage(count, ageTotal)) : ''}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Audiência — gênero</legend>
        <div className="field-grid">
          {GENDERS.map((gender) => {
            const parsed = parseOptionalInt(genderDrafts[gender] ?? '')
            const count = typeof parsed === 'number' ? parsed : 0
            return (
              <label key={gender}>
                {GENDER_LABELS[gender]}
                <input
                  type="number"
                  min={0}
                  placeholder="indisponível"
                  value={genderDrafts[gender] ?? ''}
                  onChange={(e) => setGenderDrafts((d) => ({ ...d, [gender]: e.target.value }))}
                />
                <span className="field-percent">{genderDrafts[gender] ? formatPercent(percentage(count, genderTotal)) : ''}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Nota</legend>
        <label className="note-field">
          <input type="text" placeholder="opcional" value={values.note} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} />
        </label>
      </fieldset>

      {(fieldError || error) && <p className="state-message state-error">{fieldError ?? error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : mode === 'create' ? 'Adicionar registro' : 'Salvar alterações'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

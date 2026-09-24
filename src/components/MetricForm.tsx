import { useRef, useState } from 'react'
import type { DailyMetric, NewMetricInput } from '../lib/api'
import { BRAZIL_STATES } from '../lib/api'
import {
  AGE_RANGES,
  GENDERS,
  GENDER_LABELS,
  parseOptionalInt,
  parseRequiredInt,
  percentage,
  formatPercentBR,
  formatIntegerInputBR,
  stripThousandsSep,
  looksLikePercentInput,
  parsePercentBR,
  percentToQuantity,
  bareCityName,
} from '../lib/metrics'

const OPTIONAL_INT_FIELDS = [
  'interactions',
  'profile_visits',
  'views_total',
  'views_from_followers',
  'views_from_non_followers',
  'viewers_total',
  'views_stories_followers',
  'views_stories_non_followers',
  'views_posts_followers',
  'views_posts_non_followers',
  'views_reels_followers',
  'views_reels_non_followers',
  'interactions_from_followers',
  'interactions_from_non_followers',
  'interactions_stories_followers',
  'interactions_stories_non_followers',
  'interactions_posts_followers',
  'interactions_posts_non_followers',
  'replies',
  'shares',
  'likes',
  'comments',
] as const
type OptionalIntField = (typeof OPTIONAL_INT_FIELDS)[number]

const FIELD_LABELS: Record<OptionalIntField, string> = {
  interactions: 'Interações totais',
  profile_visits: 'Visitas ao perfil',
  views_total: 'Visualizações totais',
  views_from_followers: 'Visualizações de seguidores',
  views_from_non_followers: 'Visualizações de não seguidores',
  viewers_total: 'Visualizadores',
  views_stories_followers: 'Stories',
  views_stories_non_followers: 'Stories',
  views_posts_followers: 'Posts',
  views_posts_non_followers: 'Posts',
  views_reels_followers: 'Reels',
  views_reels_non_followers: 'Reels',
  interactions_from_followers: 'Interações de seguidores',
  interactions_from_non_followers: 'Interações de não seguidores',
  interactions_stories_followers: 'Stories',
  interactions_stories_non_followers: 'Stories',
  interactions_posts_followers: 'Posts',
  interactions_posts_non_followers: 'Posts',
  replies: 'Respostas',
  shares: 'Compartilhamentos',
  likes: 'Curtidas',
  comments: 'Comentários',
}

/** Campo de quantidade: aceita digitação com ou sem ponto de milhar e sempre exibe formatado. */
function IntegerTextInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string
  onChange: (digits: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      required={required}
      value={formatIntegerInputBR(value)}
      onChange={(e) => onChange(stripThousandsSep(e.target.value))}
    />
  )
}

/**
 * Campo de quantidade que também aceita percentual: digitar com vírgula (ex.: "12,5")
 * é interpretado como 12,5% de `total` e convertido para a quantidade correspondente
 * assim que o campo perde o foco. Sem vírgula, comporta-se como IntegerTextInput
 * (ponto de milhar, resolvido a cada tecla) — nada muda para quem só digita inteiros.
 */
function PercentAwareIntegerInput({
  value,
  onChange,
  placeholder,
  total,
  totalLabel,
  fieldLabel,
  onFieldError,
}: {
  value: string
  onChange: (digits: string) => void
  placeholder?: string
  total: number | null
  totalLabel: string
  fieldLabel: string
  onFieldError: (message: string | null) => void
}) {
  const [percentDraft, setPercentDraft] = useState<string | null>(null)
  const originalValueRef = useRef<string>(value)

  const displayValue = percentDraft !== null ? percentDraft : formatIntegerInputBR(value)

  function handleFocus() {
    originalValueRef.current = value
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (looksLikePercentInput(raw)) {
      const digitsAndComma = raw.replace(/[^\d,]/g, '')
      const firstComma = digitsAndComma.indexOf(',')
      const sanitized =
        firstComma === -1 ? digitsAndComma : digitsAndComma.slice(0, firstComma + 1) + digitsAndComma.slice(firstComma + 1).replace(/,/g, '')
      setPercentDraft(sanitized)
      return
    }
    setPercentDraft(null)
    onChange(stripThousandsSep(raw))
  }

  function revert(message: string) {
    onFieldError(message)
    onChange(originalValueRef.current)
    setPercentDraft(null)
  }

  function handleBlur() {
    if (percentDraft === null) return
    const raw = percentDraft.trim()
    if (raw === '' || raw === ',') {
      onChange('')
      onFieldError(null)
      setPercentDraft(null)
      return
    }
    const pct = parsePercentBR(raw)
    if (pct === 'invalid') {
      revert(`Percentual inválido em "${fieldLabel}". Digite os dígitos decimais após a vírgula, ex.: 12,5.`)
      return
    }
    if (total === null || total <= 0) {
      revert(`Informe "${totalLabel}" antes de digitar um percentual em "${fieldLabel}".`)
      return
    }
    if (pct > 100) {
      revert(`O percentual de "${fieldLabel}" não pode ultrapassar 100% de "${totalLabel}".`)
      return
    }
    onChange(String(percentToQuantity(pct, total)))
    onFieldError(null)
    setPercentDraft(null)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

interface LocationDraft {
  city: string
  state: string
  count: string
}

type FormValues = {
  date: string
  followers: string
  posts_published: string
  note: string
} & Record<OptionalIntField, string>

function emptyFormValues(): FormValues {
  const base = { date: '', followers: '', posts_published: '', note: '' } as FormValues
  for (const field of OPTIONAL_INT_FIELDS) base[field] = ''
  return base
}

function metricToFormValues(m: DailyMetric): FormValues {
  const base = {
    date: m.date.slice(0, 10),
    followers: String(m.followers),
    posts_published: m.posts_published === null ? '' : String(m.posts_published),
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

/**
 * Ao editar um registro existente, parte das localizações já salvas nele (com as
 * quantidades). Ao criar um registro novo, parte das cidades do registro mais recente
 * (`template`) que já tiver localizações — mantendo cidade/UF, mas com a quantidade em
 * branco para o usuário preencher com o valor do novo dia. Sem histórico algum, usa os
 * defaults atuais.
 */
function metricToLocationDrafts(m?: DailyMetric, template?: DailyMetric['audience']['locations']): LocationDraft[] {
  if (m && m.audience.locations.length > 0) {
    return [...m.audience.locations]
      .sort((a, b) => b.followers_count - a.followers_count)
      .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', count: String(l.followers_count) }))
  }
  if (!m && template && template.length > 0) {
    return [...template]
      .sort((a, b) => b.followers_count - a.followers_count)
      .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', count: '' }))
  }
  return [
    { city: 'São Paulo', state: 'SP', count: '' },
    { city: 'Rio de Janeiro', state: 'RJ', count: '' },
    { city: 'Belo Horizonte', state: 'MG', count: '' },
  ]
}

interface MetricFormProps {
  accountId: string
  mode: 'create' | 'edit'
  initial?: DailyMetric
  /** Cidades do registro mais recente (com localizações), usadas como base ao criar um novo registro. */
  templateLocations?: DailyMetric['audience']['locations']
  submitting: boolean
  error: string | null
  onSubmit: (input: NewMetricInput) => void
  onCancel?: () => void
  onDelete?: () => void
  deleting?: boolean
}

export default function MetricForm({
  accountId,
  mode,
  initial,
  templateLocations,
  submitting,
  error,
  onSubmit,
  onCancel,
  onDelete,
  deleting,
}: MetricFormProps) {
  const [values, setValues] = useState<FormValues>(() => (initial ? metricToFormValues(initial) : emptyFormValues()))
  const [ageDrafts, setAgeDrafts] = useState<Record<string, string>>(() => metricToAgeDrafts(initial))
  const [genderDrafts, setGenderDrafts] = useState<Record<string, string>>(() => metricToGenderDrafts(initial))
  const [locationDrafts, setLocationDrafts] = useState<LocationDraft[]>(() => metricToLocationDrafts(initial, templateLocations))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingRemoveLocation, setConfirmingRemoveLocation] = useState<number | null>(null)

  function setField(field: OptionalIntField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw }))
  }

  function addLocationRow() {
    setLocationDrafts((rows) => [...rows, { city: '', state: '', count: '' }])
  }
  function removeLocationRow(index: number) {
    setLocationDrafts((rows) => rows.filter((_, i) => i !== index))
    setConfirmingRemoveLocation(null)
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

  const parsedFollowersTotal = parseOptionalInt(values.followers)
  const followersTotal = typeof parsedFollowersTotal === 'number' ? parsedFollowersTotal : null

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
    const postsPublished = parseOptionalInt(values.posts_published)
    if (postsPublished === 'invalid') {
      setFieldError('Posts deve ser um número inteiro maior ou igual a 0.')
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

    const locations: { city: string; state: string; followers_count: number }[] = []
    for (const row of locationDrafts) {
      const cityBlank = row.city.trim() === ''
      const stateBlank = row.state.trim() === ''
      const countBlank = row.count.trim() === ''
      if (cityBlank && stateBlank && countBlank) continue
      if (cityBlank) {
        setFieldError('Informe o nome da cidade ou deixe a linha vazia.')
        return
      }
      const count = parseOptionalInt(row.count)
      if (count === 'invalid') {
        setFieldError(`Quantidade inválida para a cidade ${row.city}.`)
        return
      }
      if (count === null) continue
      if (stateBlank) {
        setFieldError(`Selecione o estado (UF) da cidade ${row.city.trim()}.`)
        return
      }
      locations.push({ city: row.city.trim(), state: row.state.trim(), followers_count: count })
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
      posts_published: postsPublished,
      note: values.note.trim() === '' ? null : values.note.trim(),
      interactions: parsedOptional.interactions ?? null,
      profile_visits: parsedOptional.profile_visits ?? null,
      views_total: parsedOptional.views_total ?? null,
      views_from_followers: parsedOptional.views_from_followers ?? null,
      views_from_non_followers: parsedOptional.views_from_non_followers ?? null,
      viewers_total: parsedOptional.viewers_total ?? null,
      views_stories_followers: parsedOptional.views_stories_followers ?? null,
      views_stories_non_followers: parsedOptional.views_stories_non_followers ?? null,
      views_posts_followers: parsedOptional.views_posts_followers ?? null,
      views_posts_non_followers: parsedOptional.views_posts_non_followers ?? null,
      views_reels_followers: parsedOptional.views_reels_followers ?? null,
      views_reels_non_followers: parsedOptional.views_reels_non_followers ?? null,
      interactions_from_followers: parsedOptional.interactions_from_followers ?? null,
      interactions_from_non_followers: parsedOptional.interactions_from_non_followers ?? null,
      interactions_stories_followers: parsedOptional.interactions_stories_followers ?? null,
      interactions_stories_non_followers: parsedOptional.interactions_stories_non_followers ?? null,
      interactions_posts_followers: parsedOptional.interactions_posts_followers ?? null,
      interactions_posts_non_followers: parsedOptional.interactions_posts_non_followers ?? null,
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
        <IntegerTextInput placeholder="indisponível" value={values[field]} onChange={(digits) => setField(field, digits)} />
      </label>
    )
  }

  /** Campo de quantidade que também aceita "12,5" como 12,5% de `totalField`. */
  function percentField(field: OptionalIntField, totalField: OptionalIntField) {
    const parsedTotal = parseOptionalInt(values[totalField])
    const total = typeof parsedTotal === 'number' ? parsedTotal : null
    return (
      <label key={field}>
        {FIELD_LABELS[field]}
        <PercentAwareIntegerInput
          placeholder="indisponível"
          value={values[field]}
          onChange={(digits) => setField(field, digits)}
          total={total}
          totalLabel={FIELD_LABELS[totalField]}
          fieldLabel={FIELD_LABELS[field]}
          onFieldError={setFieldError}
        />
      </label>
    )
  }

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
            <IntegerTextInput
              required
              value={values.followers}
              onChange={(digits) => setValues((v) => ({ ...v, followers: digits }))}
            />
          </label>
          <label>
            Posts
            <IntegerTextInput
              placeholder="indisponível"
              value={values.posts_published}
              onChange={(digits) => setValues((v) => ({ ...v, posts_published: digits }))}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="card-visualizacoes">
        <legend>Visualizações</legend>
        <div className="field-grid">
          {numberField('views_total')}
          {numberField('viewers_total')}
          {percentField('views_from_followers', 'views_total')}
          {percentField('views_from_non_followers', 'views_total')}
        </div>

        <h4>Por tipo de conteúdo</h4>
        <div className="two-col-audience">
          <div className="audience-col">
            <span className="audience-col-title">Seguidores</span>
            {percentField('views_stories_followers', 'views_from_followers')}
            {percentField('views_posts_followers', 'views_from_followers')}
            {percentField('views_reels_followers', 'views_from_followers')}
          </div>
          <div className="audience-col">
            <span className="audience-col-title">Não seguidores</span>
            {percentField('views_stories_non_followers', 'views_from_non_followers')}
            {percentField('views_posts_non_followers', 'views_from_non_followers')}
            {percentField('views_reels_non_followers', 'views_from_non_followers')}
          </div>
        </div>

        <div className="field-grid">{numberField('profile_visits')}</div>
      </fieldset>

      <fieldset className="card-interacoes">
        <legend>Interações</legend>
        <div className="field-grid">
          {numberField('interactions')}
          {percentField('interactions_from_followers', 'interactions')}
          {percentField('interactions_from_non_followers', 'interactions')}
        </div>

        <h4>Por tipo de conteúdo</h4>
        <div className="two-col-audience">
          <div className="audience-col">
            <span className="audience-col-title">Seguidores</span>
            {percentField('interactions_stories_followers', 'interactions_from_followers')}
            {percentField('interactions_posts_followers', 'interactions_from_followers')}
          </div>
          <div className="audience-col">
            <span className="audience-col-title">Não seguidores</span>
            {percentField('interactions_stories_non_followers', 'interactions_from_non_followers')}
            {percentField('interactions_posts_non_followers', 'interactions_from_non_followers')}
          </div>
        </div>
      </fieldset>

      <div className="por-interacao">
        <h4>Por interação</h4>
        <div className="two-col-audience">
          <fieldset className="sub-card">
            <legend>Stories</legend>
            {numberField('replies')}
            {numberField('shares')}
          </fieldset>
          <fieldset className="sub-card">
            <legend>Posts</legend>
            {numberField('likes')}
            {numberField('comments')}
          </fieldset>
        </div>
      </div>

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
              <select
                value={row.state}
                onChange={(e) => updateLocationRow(i, { state: e.target.value })}
                aria-label={row.city.trim() ? `UF de ${row.city.trim()}` : 'UF'}
              >
                <option value="">UF</option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <PercentAwareIntegerInput
                placeholder="Seguidores"
                value={row.count}
                onChange={(digits) => updateLocationRow(i, { count: digits })}
                total={followersTotal}
                totalLabel="Seguidores totais"
                fieldLabel={row.city.trim() ? `Localização (${row.city.trim()})` : 'Localização'}
                onFieldError={setFieldError}
              />
              {confirmingRemoveLocation === i ? (
                <span className="confirm-delete">
                  Remover?
                  <button type="button" className="danger" onClick={() => removeLocationRow(i)}>
                    Sim
                  </button>
                  <button type="button" onClick={() => setConfirmingRemoveLocation(null)}>
                    Não
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemoveLocation(i)}
                  aria-label={`Remover ${row.city || 'cidade'}`}
                >
                  Remover
                </button>
              )}
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
                <PercentAwareIntegerInput
                  placeholder="indisponível"
                  value={ageDrafts[range] ?? ''}
                  onChange={(digits) => setAgeDrafts((d) => ({ ...d, [range]: digits }))}
                  total={followersTotal}
                  totalLabel="Seguidores totais"
                  fieldLabel={`Faixa etária ${range}`}
                  onFieldError={setFieldError}
                />
                <span className="field-percent">{ageDrafts[range] ? formatPercentBR(percentage(count, ageTotal)) : ''}</span>
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
                <PercentAwareIntegerInput
                  placeholder="indisponível"
                  value={genderDrafts[gender] ?? ''}
                  onChange={(digits) => setGenderDrafts((d) => ({ ...d, [gender]: digits }))}
                  total={followersTotal}
                  totalLabel="Seguidores totais"
                  fieldLabel={`Gênero ${GENDER_LABELS[gender]}`}
                  onFieldError={setFieldError}
                />
                <span className="field-percent">{genderDrafts[gender] ? formatPercentBR(percentage(count, genderTotal)) : ''}</span>
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
        {onDelete && !confirmingDelete && (
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={submitting || deleting}>
            Excluir registro
          </button>
        )}
        {onDelete && confirmingDelete && (
          <span className="confirm-delete">
            Confirma excluir este registro?
            <button type="button" className="danger" onClick={onDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Não
            </button>
          </span>
        )}
      </div>
    </form>
  )
}

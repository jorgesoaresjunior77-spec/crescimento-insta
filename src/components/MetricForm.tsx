import { useState } from 'react'
import type { AudienceLocation, ContentType, ContentTypeMetric, ContentMetricType, DailyMetric, NewMetricInput } from '../lib/api'
import { BRAZIL_STATES, CONTENT_METRIC_TYPES, CONTENT_TYPES } from '../lib/api'
import {
  formatIntegerInputBR,
  formatPercentBR,
  parseOptionalInt,
  parseOptionalPercentBR,
  parseRequiredInt,
  sanitizePercentDraft,
  stripThousandsSep,
  bareCityName,
} from '../lib/metrics'

/** Campos escalares opcionais de `daily_metrics` (contagem, sem sinal). */
const SCALAR_OPTIONAL_FIELDS = ['views_total', 'viewers_total', 'interactions', 'profile_visits', 'bio_link_taps'] as const
type ScalarOptionalField = (typeof SCALAR_OPTIONAL_FIELDS)[number]

const SCALAR_FIELD_LABELS: Record<ScalarOptionalField, string> = {
  views_total: 'Visualizações',
  viewers_total: 'Visualizadores',
  interactions: 'Interações',
  profile_visits: 'Visitas no perfil',
  bio_link_taps: 'Toques no link da bio',
}

/** Visualizações e Interações por tipo de conteúdo: um total único por Reels/Posts/Stories. */
const CONTENT_GROUPS: { metricType: ContentMetricType; title: string }[] = [
  { metricType: 'views', title: 'Visualizações por tipo de conteúdo' },
  { metricType: 'interactions', title: 'Interações por tipo de conteúdo' },
]

const CONTENT_TYPE_LABELS: Record<ContentType, string> = { reels: 'Reels', posts: 'Posts', stories: 'Stories' }

const CITY_SLOT_COUNT = 3

/** Campo de contagem: inteiro >= 0, aceita digitar com ou sem ponto de milhar, sempre exibe formatado. */
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

/** Campo percentual nativo: vírgula decimal, 0–100, símbolo % exibido ao lado (nunca dentro do valor digitado). */
function PercentInput({ value, onChange, placeholder }: { value: string; onChange: (raw: string) => void; placeholder?: string }) {
  return (
    <span className="percent-field">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? '0,0'}
        value={value}
        onChange={(e) => onChange(sanitizePercentDraft(e.target.value))}
      />
      <span className="percent-suffix">%</span>
    </span>
  )
}

/** Aviso não bloqueante: soma dos percentuais preenchidos no grupo de cidades. */
function SumWarning({ sum, active }: { sum: number; active: boolean }) {
  if (!active || Math.abs(sum - 100) < 0.05) return null
  return <p className="state-message state-warning">⚠️ Os percentuais somam {formatPercentBR(sum)}.</p>
}

interface LocationDraft {
  city: string
  state: string
  percent: string
}

/** Converte um `percent` numérico (vindo da API, decimal com ponto) para o formato de rascunho BR (vírgula) exibido no input. */
function percentToDraft(value: number): string {
  return String(value).replace('.', ',')
}

type ContentDrafts = Record<ContentMetricType, Record<ContentType, string>>

function emptyContentDrafts(): ContentDrafts {
  const out = {} as ContentDrafts
  for (const metricType of CONTENT_METRIC_TYPES) {
    out[metricType] = {} as Record<ContentType, string>
    for (const contentType of CONTENT_TYPES) {
      out[metricType][contentType] = ''
    }
  }
  return out
}

function metricToContentDrafts(m?: DailyMetric): ContentDrafts {
  const out = emptyContentDrafts()
  if (m) {
    for (const row of m.content_type_metrics) {
      if ((CONTENT_METRIC_TYPES as readonly string[]).includes(row.metric_type)) {
        out[row.metric_type][row.content_type] = String(row.value)
      }
    }
  }
  return out
}

/**
 * Sempre exatamente CITY_SLOT_COUNT posições (Cidade 1/2/3) — nunca mais, nunca menos.
 * Ao editar um registro existente, parte das localizações já salvas nele (com os
 * percentuais). Ao criar um registro novo, parte das cidades do registro mais recente
 * (`template`) que já tiver localizações — mantendo cidade/UF, mas com o percentual em
 * branco para o usuário preencher com o valor do novo dia. Sem histórico algum, usa os
 * defaults atuais. Se houver mais cidades salvas do que posições, mantém só as de maior
 * percentual; se houver menos, completa com posições vazias.
 */
function metricToLocationDrafts(m?: DailyMetric, template?: AudienceLocation[]): LocationDraft[] {
  function fillTo3(rows: LocationDraft[]): LocationDraft[] {
    const out = rows.slice(0, CITY_SLOT_COUNT)
    while (out.length < CITY_SLOT_COUNT) out.push({ city: '', state: '', percent: '' })
    return out
  }

  if (m && m.audience.locations.length > 0) {
    return fillTo3(
      [...m.audience.locations]
        .sort((a, b) => b.percent - a.percent)
        .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', percent: percentToDraft(l.percent) })),
    )
  }
  if (!m && template && template.length > 0) {
    return fillTo3(
      [...template]
        .sort((a, b) => b.percent - a.percent)
        .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', percent: '' })),
    )
  }
  return [
    { city: 'São Paulo', state: 'SP', percent: '' },
    { city: 'Rio de Janeiro', state: 'RJ', percent: '' },
    { city: 'Belo Horizonte', state: 'MG', percent: '' },
  ]
}

type FormValues = {
  date: string
  followers: string
  posts_published: string
  note: string
} & Record<ScalarOptionalField, string>

function emptyFormValues(): FormValues {
  const base = { date: '', followers: '', posts_published: '', note: '' } as FormValues
  for (const field of SCALAR_OPTIONAL_FIELDS) base[field] = ''
  return base
}

function metricToFormValues(m: DailyMetric): FormValues {
  const base = {
    date: m.date.slice(0, 10),
    followers: String(m.followers),
    posts_published: m.posts_published === null ? '' : String(m.posts_published),
    note: m.note ?? '',
  } as FormValues
  for (const field of SCALAR_OPTIONAL_FIELDS) {
    const value = m[field]
    base[field] = value === null || value === undefined ? '' : String(value)
  }
  return base
}

interface MetricFormProps {
  accountId: string
  mode: 'create' | 'edit'
  initial?: DailyMetric
  /** Cidades do registro mais recente (com localizações), usadas como base ao criar um novo registro. */
  templateLocations?: AudienceLocation[]
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
  const [contentDrafts, setContentDrafts] = useState<ContentDrafts>(() => metricToContentDrafts(initial))
  const [locationDrafts, setLocationDrafts] = useState<LocationDraft[]>(() => metricToLocationDrafts(initial, templateLocations))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function setField(field: ScalarOptionalField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw }))
  }

  function setContentDraft(metricType: ContentMetricType, contentType: ContentType, raw: string) {
    setContentDrafts((d) => ({
      ...d,
      [metricType]: { ...d[metricType], [contentType]: raw },
    }))
  }

  function updateLocationRow(index: number, patch: Partial<LocationDraft>) {
    setLocationDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function sumPercent(values: string[]): { sum: number; active: boolean } {
    let sum = 0
    let active = false
    for (const raw of values) {
      if (raw.trim() === '') continue
      const parsed = parseOptionalPercentBR(raw)
      if (typeof parsed === 'number') {
        sum += parsed
        active = true
      }
    }
    return { sum, active }
  }

  const citySum = sumPercent(locationDrafts.map((c) => c.percent))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (!values.date) {
      setFieldError('Informe a data.')
      return
    }
    const followers = parseRequiredInt(values.followers)
    if (followers === 'invalid') {
      setFieldError('Seguidores totais deve ser um número inteiro maior ou igual a 0.')
      return
    }
    const postsPublished = parseOptionalInt(values.posts_published)
    if (postsPublished === 'invalid') {
      setFieldError('Posts deve ser um número inteiro maior ou igual a 0.')
      return
    }

    const parsedScalars: Partial<Record<ScalarOptionalField, number | null>> = {}
    for (const field of SCALAR_OPTIONAL_FIELDS) {
      const parsed = parseOptionalInt(values[field])
      if (parsed === 'invalid') {
        setFieldError(`${SCALAR_FIELD_LABELS[field]} deve ser um número inteiro maior ou igual a 0.`)
        return
      }
      parsedScalars[field] = parsed
    }

    const contentTypeMetrics: ContentTypeMetric[] = []
    for (const group of CONTENT_GROUPS) {
      for (const contentType of CONTENT_TYPES) {
        const raw = contentDrafts[group.metricType][contentType]
        const parsed = parseOptionalInt(raw)
        if (parsed === 'invalid') {
          setFieldError(`${group.title} (${CONTENT_TYPE_LABELS[contentType]}) deve ser um número inteiro maior ou igual a 0.`)
          return
        }
        if (parsed !== null) {
          contentTypeMetrics.push({ metric_type: group.metricType, content_type: contentType, value: parsed })
        }
      }
    }

    const locations: { city: string; state: string; percent: number }[] = []
    for (const row of locationDrafts) {
      const cityBlank = row.city.trim() === ''
      const stateBlank = row.state.trim() === ''
      const percentBlank = row.percent.trim() === ''
      if (cityBlank && stateBlank && percentBlank) continue
      if (cityBlank) {
        setFieldError('Informe o nome da cidade ou deixe a linha vazia.')
        return
      }
      const percent = parseOptionalPercentBR(row.percent)
      if (percent === 'invalid') {
        setFieldError(`Percentual inválido para a cidade ${row.city}. Use vírgula decimal, entre 0 e 100.`)
        return
      }
      if (percent === null) continue
      if (stateBlank) {
        setFieldError(`Selecione o estado (UF) da cidade ${row.city.trim()}.`)
        return
      }
      locations.push({ city: row.city.trim(), state: row.state.trim(), percent })
    }

    onSubmit({
      account_id: accountId,
      date: values.date,
      followers,
      posts_published: postsPublished,
      note: values.note.trim() === '' ? null : values.note.trim(),
      views_total: parsedScalars.views_total ?? null,
      viewers_total: parsedScalars.viewers_total ?? null,
      interactions: parsedScalars.interactions ?? null,
      profile_visits: parsedScalars.profile_visits ?? null,
      bio_link_taps: parsedScalars.bio_link_taps ?? null,
      content_type_metrics: contentTypeMetrics,
      audience: { locations },
    })
  }

  function scalarField(field: ScalarOptionalField) {
    return (
      <label key={field}>
        {SCALAR_FIELD_LABELS[field]}
        <IntegerTextInput placeholder="indisponível" value={values[field]} onChange={(digits) => setField(field, digits)} />
      </label>
    )
  }

  function contentGroup(group: (typeof CONTENT_GROUPS)[number]) {
    return (
      <fieldset key={group.metricType} className="content-group">
        <legend>{group.title}</legend>
        <div className="content-type-rows">
          {CONTENT_TYPES.map((ct) => (
            <label key={ct} className="content-type-row">
              {CONTENT_TYPE_LABELS[ct]}
              <IntegerTextInput
                placeholder="indisponível"
                value={contentDrafts[group.metricType][ct]}
                onChange={(digits) => setContentDraft(group.metricType, ct, digits)}
              />
            </label>
          ))}
        </div>
      </fieldset>
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
            <IntegerTextInput required value={values.followers} onChange={(digits) => setValues((v) => ({ ...v, followers: digits }))} />
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

      <fieldset>
        <legend>Métricas principais</legend>
        <div className="field-grid">
          {scalarField('viewers_total')}
          {scalarField('views_total')}
          {scalarField('interactions')}
          {scalarField('profile_visits')}
          {scalarField('bio_link_taps')}
        </div>
      </fieldset>

      {CONTENT_GROUPS.map(contentGroup)}

      <fieldset>
        <legend>Cidades (%)</legend>
        <div className="audience-locations">
          {locationDrafts.map((row, i) => (
            <div className="location-row" key={i}>
              <span className="location-row-label">Cidade {i + 1}</span>
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
              <PercentInput value={row.percent} onChange={(raw) => updateLocationRow(i, { percent: raw })} />
            </div>
          ))}
        </div>
        <SumWarning sum={citySum.sum} active={citySum.active} />
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

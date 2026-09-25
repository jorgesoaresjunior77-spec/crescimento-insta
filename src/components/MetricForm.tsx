import { useState } from 'react'
import type {
  AudienceLocation,
  ContentAudienceType,
  ContentMetricType,
  ContentType,
  ContentTypeMetric,
  DailyMetric,
  NewMetricInput,
} from '../lib/api'
import { BRAZIL_STATES, CONTENT_AUDIENCE_TYPES, CONTENT_METRIC_TYPES, CONTENT_TYPES } from '../lib/api'
import { COMMON_COUNTRIES, COUNTRY_LABEL_BY_ALPHA2 } from '../lib/worldCountries'
import {
  AGE_RANGES,
  formatIntegerInputBR,
  formatPercentBR,
  parseOptionalInt,
  parseOptionalPercentBR,
  parseOptionalSignedInt,
  parseRequiredInt,
  sanitizePercentDraft,
  stripSignedThousandsSep,
  stripThousandsSep,
  bareCityName,
} from '../lib/metrics'

/** Campos escalares opcionais de `daily_metrics` (contagem, sem sinal). */
const SCALAR_OPTIONAL_FIELDS = [
  'views_total',
  'viewers_total',
  'views_from_followers',
  'views_from_non_followers',
  'interactions',
  'interactions_from_followers',
  'interactions_from_non_followers',
  'profile_visits',
  'bio_link_taps',
] as const
type ScalarOptionalField = (typeof SCALAR_OPTIONAL_FIELDS)[number]

const SCALAR_FIELD_LABELS: Record<ScalarOptionalField, string> = {
  views_total: 'Visualizações',
  viewers_total: 'Visualizadores',
  views_from_followers: 'Visualizações de seguidores',
  views_from_non_followers: 'Visualizações de não seguidores',
  interactions: 'Interações',
  interactions_from_followers: 'Interações de seguidores',
  interactions_from_non_followers: 'Interações de não seguidores',
  profile_visits: 'Visitas no perfil',
  bio_link_taps: 'Toques no link da bio',
}

const CONTENT_GROUPS: { metricType: ContentMetricType; title: string; showTudo: boolean }[] = [
  { metricType: 'views', title: 'Visualizações por tipo de conteúdo', showTudo: false },
  { metricType: 'interactions', title: 'Interações por tipo de conteúdo', showTudo: true },
  { metricType: 'likes', title: 'Curtidas', showTudo: false },
  { metricType: 'comments', title: 'Comentários', showTudo: false },
  { metricType: 'reposts', title: 'Reposts', showTudo: false },
  { metricType: 'shares', title: 'Compartilhamentos', showTudo: false },
  { metricType: 'saves', title: 'Salvamentos', showTudo: false },
  { metricType: 'replies', title: 'Respostas', showTudo: false },
]

const CONTENT_TYPE_LABELS: Record<ContentType, string> = { reels: 'Reels', posts: 'Posts', stories: 'Stories' }

const FORM_GENDERS = ['female', 'male'] as const
type FormGender = (typeof FORM_GENDERS)[number]
const FORM_GENDER_LABELS: Record<FormGender, string> = { female: 'Mulheres', male: 'Homens' }

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

/** Igual a IntegerTextInput, mas aceita um sinal negativo — usado só por "Seguidores líquidos". */
function SignedIntegerTextInput({ value, onChange, placeholder }: { value: string; onChange: (digits: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={formatIntegerInputBR(value)}
      onChange={(e) => onChange(stripSignedThousandsSep(e.target.value))}
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

/** Aviso não bloqueante: soma dos percentuais preenchidos num grupo (gênero/faixa etária/países/cidades). */
function SumWarning({ sum, active }: { sum: number; active: boolean }) {
  if (!active || Math.abs(sum - 100) < 0.05) return null
  return <p className="state-message state-warning">⚠️ Os percentuais somam {formatPercentBR(sum)}.</p>
}

interface LocationDraft {
  city: string
  state: string
  percent: string
}

interface CountryDraft {
  country_code: string
  percent: string
}

/** Converte um `percent` numérico (vindo da API, decimal com ponto) para o formato de rascunho BR (vírgula) exibido no input. */
function percentToDraft(value: number): string {
  return String(value).replace('.', ',')
}

type ContentDrafts = Record<ContentMetricType, Record<ContentAudienceType, Record<ContentType, string>>>

function emptyContentDrafts(): ContentDrafts {
  const out = {} as ContentDrafts
  for (const metricType of CONTENT_METRIC_TYPES) {
    out[metricType] = {} as Record<ContentAudienceType, Record<ContentType, string>>
    for (const audienceType of CONTENT_AUDIENCE_TYPES) {
      out[metricType][audienceType] = {} as Record<ContentType, string>
      for (const contentType of CONTENT_TYPES) {
        out[metricType][audienceType][contentType] = ''
      }
    }
  }
  return out
}

function metricToContentDrafts(m?: DailyMetric): ContentDrafts {
  const out = emptyContentDrafts()
  if (m) {
    for (const row of m.content_type_metrics) {
      out[row.metric_type][row.audience_type][row.content_type] = String(row.value)
    }
  }
  return out
}

type GenderDrafts = Record<FormGender, string>

function emptyGenderDrafts(): GenderDrafts {
  return { female: '', male: '' }
}

function metricToGenderDrafts(m?: DailyMetric): GenderDrafts {
  const out = emptyGenderDrafts()
  if (m) {
    for (const row of m.audience.genders) {
      if (row.gender === 'female' || row.gender === 'male') out[row.gender] = percentToDraft(row.percent)
    }
  }
  return out
}

type AgeDrafts = Record<string, GenderDrafts>

function emptyAgeDrafts(): AgeDrafts {
  const out: AgeDrafts = {}
  for (const range of AGE_RANGES) out[range] = emptyGenderDrafts()
  return out
}

function metricToAgeDrafts(m?: DailyMetric): AgeDrafts {
  const out = emptyAgeDrafts()
  if (m) {
    for (const row of m.audience.age_ranges) {
      if (out[row.age_range] && (row.gender === 'female' || row.gender === 'male')) {
        out[row.age_range][row.gender] = percentToDraft(row.percent)
      }
    }
  }
  return out
}

/**
 * Ao editar um registro existente, parte das localizações já salvas nele (com os
 * percentuais). Ao criar um registro novo, parte das cidades do registro mais recente
 * (`template`) que já tiver localizações — mantendo cidade/UF, mas com o percentual em
 * branco para o usuário preencher com o valor do novo dia. Sem histórico algum, usa os
 * defaults atuais.
 */
function metricToLocationDrafts(m?: DailyMetric, template?: AudienceLocation[]): LocationDraft[] {
  if (m && m.audience.locations.length > 0) {
    return [...m.audience.locations]
      .sort((a, b) => b.percent - a.percent)
      .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', percent: percentToDraft(l.percent) }))
  }
  if (!m && template && template.length > 0) {
    return [...template]
      .sort((a, b) => b.percent - a.percent)
      .map((l) => ({ city: bareCityName(l.city, l.state), state: l.state ?? '', percent: '' }))
  }
  return [
    { city: 'São Paulo', state: 'SP', percent: '' },
    { city: 'Rio de Janeiro', state: 'RJ', percent: '' },
    { city: 'Belo Horizonte', state: 'MG', percent: '' },
  ]
}

/** Países não herdam de um registro anterior (só cidades, por pedido explícito) — em criação, começa vazio. */
function metricToCountryDrafts(m?: DailyMetric): CountryDraft[] {
  if (m) {
    return [...m.audience.countries]
      .sort((a, b) => b.percent - a.percent)
      .map((c) => ({ country_code: c.country_code, percent: percentToDraft(c.percent) }))
  }
  return []
}

type FormValues = {
  date: string
  followers: string
  posts_published: string
  net_follows: string
  note: string
} & Record<ScalarOptionalField, string>

function emptyFormValues(): FormValues {
  const base = { date: '', followers: '', posts_published: '', net_follows: '', note: '' } as FormValues
  for (const field of SCALAR_OPTIONAL_FIELDS) base[field] = ''
  return base
}

function metricToFormValues(m: DailyMetric): FormValues {
  const base = {
    date: m.date.slice(0, 10),
    followers: String(m.followers),
    posts_published: m.posts_published === null ? '' : String(m.posts_published),
    net_follows: m.net_follows === null ? '' : String(m.net_follows),
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
  const [genderDrafts, setGenderDrafts] = useState<GenderDrafts>(() => metricToGenderDrafts(initial))
  const [ageDrafts, setAgeDrafts] = useState<AgeDrafts>(() => metricToAgeDrafts(initial))
  const [locationDrafts, setLocationDrafts] = useState<LocationDraft[]>(() => metricToLocationDrafts(initial, templateLocations))
  const [countryDrafts, setCountryDrafts] = useState<CountryDraft[]>(() => metricToCountryDrafts(initial))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingRemoveLocation, setConfirmingRemoveLocation] = useState<number | null>(null)
  const [confirmingRemoveCountry, setConfirmingRemoveCountry] = useState<number | null>(null)

  function setField(field: ScalarOptionalField, raw: string) {
    setValues((v) => ({ ...v, [field]: raw }))
  }

  function setContentDraft(metricType: ContentMetricType, audienceType: ContentAudienceType, contentType: ContentType, raw: string) {
    setContentDrafts((d) => ({
      ...d,
      [metricType]: { ...d[metricType], [audienceType]: { ...d[metricType][audienceType], [contentType]: raw } },
    }))
  }

  function addLocationRow() {
    setLocationDrafts((rows) => [...rows, { city: '', state: '', percent: '' }])
  }
  function removeLocationRow(index: number) {
    setLocationDrafts((rows) => rows.filter((_, i) => i !== index))
    setConfirmingRemoveLocation(null)
  }
  function updateLocationRow(index: number, patch: Partial<LocationDraft>) {
    setLocationDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addCountryRow() {
    setCountryDrafts((rows) => [...rows, { country_code: '', percent: '' }])
  }
  function removeCountryRow(index: number) {
    setCountryDrafts((rows) => rows.filter((_, i) => i !== index))
    setConfirmingRemoveCountry(null)
  }
  function updateCountryRow(index: number, patch: Partial<CountryDraft>) {
    setCountryDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
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

  const genderSum = sumPercent(FORM_GENDERS.map((g) => genderDrafts[g]))
  const ageSum = sumPercent(AGE_RANGES.flatMap((range) => FORM_GENDERS.map((g) => ageDrafts[range][g])))
  const countrySum = sumPercent(countryDrafts.map((c) => c.percent))
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
    const netFollows = parseOptionalSignedInt(values.net_follows)
    if (netFollows === 'invalid') {
      setFieldError('Seguidores líquidos deve ser um número inteiro (pode ser negativo).')
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
      for (const audienceType of CONTENT_AUDIENCE_TYPES) {
        for (const contentType of CONTENT_TYPES) {
          const raw = contentDrafts[group.metricType][audienceType][contentType]
          const parsed = parseOptionalInt(raw)
          if (parsed === 'invalid') {
            const audienceLabel = audienceType === 'followers' ? 'seguidores' : 'não seguidores'
            setFieldError(`${group.title} (${audienceLabel} / ${CONTENT_TYPE_LABELS[contentType]}) deve ser um número inteiro maior ou igual a 0.`)
            return
          }
          if (parsed !== null) {
            contentTypeMetrics.push({ metric_type: group.metricType, audience_type: audienceType, content_type: contentType, value: parsed })
          }
        }
      }
    }

    const genders: { gender: string; percent: number }[] = []
    for (const gender of FORM_GENDERS) {
      const parsed = parseOptionalPercentBR(genderDrafts[gender])
      if (parsed === 'invalid') {
        setFieldError(`Percentual inválido em "${FORM_GENDER_LABELS[gender]}" (gênero). Use vírgula decimal, entre 0 e 100.`)
        return
      }
      if (parsed !== null) genders.push({ gender, percent: parsed })
    }

    const ageRanges: { age_range: string; gender: string; percent: number }[] = []
    for (const range of AGE_RANGES) {
      for (const gender of FORM_GENDERS) {
        const parsed = parseOptionalPercentBR(ageDrafts[range][gender])
        if (parsed === 'invalid') {
          setFieldError(`Percentual inválido na faixa etária ${range} (${FORM_GENDER_LABELS[gender]}). Use vírgula decimal, entre 0 e 100.`)
          return
        }
        if (parsed !== null) ageRanges.push({ age_range: range, gender, percent: parsed })
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

    const countries: { country_code: string; country_name: string; percent: number }[] = []
    for (const row of countryDrafts) {
      const codeBlank = row.country_code.trim() === ''
      const percentBlank = row.percent.trim() === ''
      if (codeBlank && percentBlank) continue
      if (codeBlank) {
        setFieldError('Selecione o país ou deixe a linha vazia.')
        return
      }
      const percent = parseOptionalPercentBR(row.percent)
      if (percent === 'invalid') {
        setFieldError(`Percentual inválido para o país ${COUNTRY_LABEL_BY_ALPHA2[row.country_code] ?? row.country_code}. Use vírgula decimal, entre 0 e 100.`)
        return
      }
      if (percent === null) continue
      countries.push({
        country_code: row.country_code,
        country_name: COUNTRY_LABEL_BY_ALPHA2[row.country_code] ?? row.country_code,
        percent,
      })
    }

    onSubmit({
      account_id: accountId,
      date: values.date,
      followers,
      net_follows: netFollows,
      posts_published: postsPublished,
      note: values.note.trim() === '' ? null : values.note.trim(),
      views_total: parsedScalars.views_total ?? null,
      viewers_total: parsedScalars.viewers_total ?? null,
      views_from_followers: parsedScalars.views_from_followers ?? null,
      views_from_non_followers: parsedScalars.views_from_non_followers ?? null,
      interactions: parsedScalars.interactions ?? null,
      interactions_from_followers: parsedScalars.interactions_from_followers ?? null,
      interactions_from_non_followers: parsedScalars.interactions_from_non_followers ?? null,
      profile_visits: parsedScalars.profile_visits ?? null,
      bio_link_taps: parsedScalars.bio_link_taps ?? null,
      content_type_metrics: contentTypeMetrics,
      audience: { locations, age_ranges: ageRanges, genders, countries },
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
        {group.showTudo && <div className="content-group-tudo">Tudo</div>}
        <div className="two-col-audience">
          <div className="audience-col">
            <span className="audience-col-title">Seguidores</span>
            {CONTENT_TYPES.map((ct) => (
              <label key={ct}>
                {CONTENT_TYPE_LABELS[ct]}
                <IntegerTextInput
                  placeholder="indisponível"
                  value={contentDrafts[group.metricType].followers[ct]}
                  onChange={(digits) => setContentDraft(group.metricType, 'followers', ct, digits)}
                />
              </label>
            ))}
          </div>
          <div className="audience-col">
            <span className="audience-col-title">Não seguidores</span>
            {CONTENT_TYPES.map((ct) => (
              <label key={ct}>
                {CONTENT_TYPE_LABELS[ct]}
                <IntegerTextInput
                  placeholder="indisponível"
                  value={contentDrafts[group.metricType].non_followers[ct]}
                  onChange={(digits) => setContentDraft(group.metricType, 'non_followers', ct, digits)}
                />
              </label>
            ))}
          </div>
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
          {scalarField('views_total')}
          <label>
            Seguidores líquidos
            <SignedIntegerTextInput placeholder="ex.: -1.250" value={values.net_follows} onChange={(digits) => setValues((v) => ({ ...v, net_follows: digits }))} />
          </label>
          {scalarField('interactions')}
          {scalarField('profile_visits')}
          {scalarField('bio_link_taps')}
        </div>
        <h4>Detalhamento agregado (opcional)</h4>
        <div className="field-grid">
          {scalarField('viewers_total')}
          {scalarField('views_from_followers')}
          {scalarField('views_from_non_followers')}
          {scalarField('interactions_from_followers')}
          {scalarField('interactions_from_non_followers')}
        </div>
      </fieldset>

      {CONTENT_GROUPS.map(contentGroup)}

      <fieldset>
        <legend>Gênero</legend>
        <div className="field-grid">
          {FORM_GENDERS.map((gender) => (
            <label key={gender}>
              {FORM_GENDER_LABELS[gender]}
              <PercentInput value={genderDrafts[gender]} onChange={(raw) => setGenderDrafts((d) => ({ ...d, [gender]: raw }))} />
            </label>
          ))}
        </div>
        <SumWarning sum={genderSum.sum} active={genderSum.active} />
      </fieldset>

      <fieldset>
        <legend>Faixa etária</legend>
        <div className="age-range-grid">
          {AGE_RANGES.map((range) => (
            <div className="age-range-row" key={range}>
              <span className="age-range-label">{range}</span>
              {FORM_GENDERS.map((gender) => (
                <label key={gender}>
                  {FORM_GENDER_LABELS[gender]}
                  <PercentInput
                    value={ageDrafts[range][gender]}
                    onChange={(raw) => setAgeDrafts((d) => ({ ...d, [range]: { ...d[range], [gender]: raw } }))}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <SumWarning sum={ageSum.sum} active={ageSum.active} />
      </fieldset>

      <fieldset>
        <legend>Países (%)</legend>
        <div className="audience-locations">
          {countryDrafts.map((row, i) => (
            <div className="country-row" key={i}>
              <select
                value={row.country_code}
                onChange={(e) => updateCountryRow(i, { country_code: e.target.value })}
                aria-label="País"
              >
                <option value="">País</option>
                {COMMON_COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <PercentInput value={row.percent} onChange={(raw) => updateCountryRow(i, { percent: raw })} />
              {confirmingRemoveCountry === i ? (
                <span className="confirm-delete">
                  Remover?
                  <button type="button" className="danger" onClick={() => removeCountryRow(i)}>
                    Sim
                  </button>
                  <button type="button" onClick={() => setConfirmingRemoveCountry(null)}>
                    Não
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmingRemoveCountry(i)} aria-label="Remover país">
                  Remover
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addCountryRow}>
            + Adicionar país
          </button>
        </div>
        <SumWarning sum={countrySum.sum} active={countrySum.active} />
      </fieldset>

      <fieldset>
        <legend>Cidades (%)</legend>
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
              <PercentInput value={row.percent} onChange={(raw) => updateLocationRow(i, { percent: raw })} />
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

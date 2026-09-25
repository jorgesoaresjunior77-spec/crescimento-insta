export interface Account {
  id: string
  name: string
  follower_goal: number | null
  created_at: string
}

export const CONTENT_METRIC_TYPES = ['views', 'interactions', 'likes', 'comments', 'reposts', 'shares', 'saves', 'replies'] as const
export type ContentMetricType = (typeof CONTENT_METRIC_TYPES)[number]

export const CONTENT_AUDIENCE_TYPES = ['followers', 'non_followers'] as const
export type ContentAudienceType = (typeof CONTENT_AUDIENCE_TYPES)[number]

export const CONTENT_TYPES = ['reels', 'posts', 'stories'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

/** Uma combinação (metric_type, audience_type, content_type) -> value de `content_type_metrics`. */
export interface ContentTypeMetric {
  metric_type: ContentMetricType
  audience_type: ContentAudienceType
  content_type: ContentType
  value: number
}

export interface AudienceLocation {
  city: string
  state: string | null
  city_id: string | null
  percent: number
}

export interface AudienceLocationInput {
  city: string
  state: string
  percent: number
}

export interface BrazilStateOption {
  value: string
  label: string
}

export const BRAZIL_STATES: BrazilStateOption[] = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
]

export interface AudienceAgeRange {
  age_range: string
  gender: string
  percent: number
}

export interface AudienceGender {
  gender: string
  percent: number
}

export interface AudienceCountry {
  country_code: string
  country_name: string
  percent: number
}

export interface Audience {
  locations: AudienceLocation[]
  age_ranges: AudienceAgeRange[]
  genders: AudienceGender[]
  countries: AudienceCountry[]
}

export interface AudienceInput {
  locations?: AudienceLocationInput[]
  age_ranges?: AudienceAgeRange[]
  genders?: AudienceGender[]
  countries?: AudienceCountry[]
}

export interface DailyMetric {
  id: string
  account_id: string
  date: string
  followers: number
  net_follows: number | null
  reach: number | null
  interactions: number | null
  profile_visits: number | null
  posts_published: number | null
  bio_link_taps: number | null
  note: string | null
  created_at: string
  views_total: number | null
  views_from_followers: number | null
  views_from_non_followers: number | null
  viewers_total: number | null
  interactions_from_followers: number | null
  interactions_from_non_followers: number | null
  content_type_metrics: ContentTypeMetric[]
  audience: Audience
}

export class ApiError extends Error {
  status: number
  existingId?: string

  constructor(message: string, status: number, existingId?: string) {
    super(message)
    this.status = status
    this.existingId = existingId
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body) {
      const { error, existing_id } = body as { error: unknown; existing_id?: unknown }
      if (typeof error === 'string') {
        return new ApiError(error, res.status, typeof existing_id === 'string' ? existing_id : undefined)
      }
    }
  } catch {
    // resposta não era JSON; usa a mensagem genérica abaixo
  }
  return new ApiError(`Falha na requisição (status ${res.status}).`, res.status)
}

export interface NewMetricInput {
  account_id: string
  date: string
  followers: number
  net_follows?: number | null
  reach?: number | null
  interactions?: number | null
  profile_visits?: number | null
  posts_published?: number | null
  bio_link_taps?: number | null
  note?: string | null
  views_total?: number | null
  views_from_followers?: number | null
  views_from_non_followers?: number | null
  viewers_total?: number | null
  interactions_from_followers?: number | null
  interactions_from_non_followers?: number | null
  content_type_metrics?: ContentTypeMetric[]
  audience?: AudienceInput
}

export type MetricPatchInput = Partial<
  Pick<
    NewMetricInput,
    | 'date'
    | 'followers'
    | 'net_follows'
    | 'reach'
    | 'interactions'
    | 'profile_visits'
    | 'posts_published'
    | 'bio_link_taps'
    | 'note'
    | 'views_total'
    | 'views_from_followers'
    | 'views_from_non_followers'
    | 'viewers_total'
    | 'interactions_from_followers'
    | 'interactions_from_non_followers'
    | 'content_type_metrics'
    | 'audience'
  >
>

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch('/api/accounts')
  if (!res.ok) {
    throw await parseError(res)
  }
  const body = (await res.json()) as { accounts: Account[] }
  return body.accounts
}

export async function updateAccountGoal(id: string, followerGoal: number | null): Promise<Account> {
  const res = await fetch('/api/accounts', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, follower_goal: followerGoal }),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  const body = (await res.json()) as { account: Account }
  return body.account
}

export async function fetchMetrics(accountId: string): Promise<DailyMetric[]> {
  const res = await fetch(`/api/metrics?account_id=${encodeURIComponent(accountId)}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  const body = (await res.json()) as { metrics: DailyMetric[] }
  return body.metrics
}

export async function createMetric(input: NewMetricInput): Promise<DailyMetric> {
  const res = await fetch('/api/metrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  const body = (await res.json()) as { metric: DailyMetric }
  return body.metric
}

export async function updateMetric(id: string, patch: MetricPatchInput): Promise<DailyMetric> {
  const res = await fetch('/api/metrics', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  const body = (await res.json()) as { metric: DailyMetric }
  return body.metric
}

export async function deleteMetric(id: string): Promise<void> {
  const res = await fetch(`/api/metrics?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    throw await parseError(res)
  }
}

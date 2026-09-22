export interface Account {
  id: string
  name: string
  follower_goal: number | null
  created_at: string
}

export interface AudienceLocation {
  city: string
  followers_count: number
}

export interface AudienceAgeRange {
  age_range: string
  followers_count: number
}

export interface AudienceGender {
  gender: string
  followers_count: number
}

export interface Audience {
  locations: AudienceLocation[]
  age_ranges: AudienceAgeRange[]
  genders: AudienceGender[]
}

export interface AudienceInput {
  locations?: AudienceLocation[]
  age_ranges?: AudienceAgeRange[]
  genders?: AudienceGender[]
}

export interface DailyMetric {
  id: string
  account_id: string
  date: string
  followers: number
  reach: number | null
  interactions: number | null
  profile_visits: number | null
  posts_published: number | null
  note: string | null
  created_at: string
  views_total: number | null
  views_from_followers: number | null
  views_from_non_followers: number | null
  viewers_total: number | null
  views_stories: number | null
  views_posts: number | null
  views_reels: number | null
  interactions_from_followers: number | null
  interactions_from_non_followers: number | null
  replies: number | null
  shares: number | null
  likes: number | null
  comments: number | null
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
  reach: number | null
  interactions: number | null
  profile_visits: number | null
  posts_published: number | null
  note: string | null
  views_total?: number | null
  views_from_followers?: number | null
  views_from_non_followers?: number | null
  viewers_total?: number | null
  views_stories?: number | null
  views_posts?: number | null
  views_reels?: number | null
  interactions_from_followers?: number | null
  interactions_from_non_followers?: number | null
  replies?: number | null
  shares?: number | null
  likes?: number | null
  comments?: number | null
  audience?: AudienceInput
}

export type MetricPatchInput = Partial<
  Pick<
    NewMetricInput,
    | 'date'
    | 'followers'
    | 'reach'
    | 'interactions'
    | 'profile_visits'
    | 'posts_published'
    | 'note'
    | 'views_total'
    | 'views_from_followers'
    | 'views_from_non_followers'
    | 'viewers_total'
    | 'views_stories'
    | 'views_posts'
    | 'views_reels'
    | 'interactions_from_followers'
    | 'interactions_from_non_followers'
    | 'replies'
    | 'shares'
    | 'likes'
    | 'comments'
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

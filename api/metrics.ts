import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AGE_RANGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
const GENDERS = ["female", "male", "other"] as const;
const AGE_RANGE_GENDERS = ["female", "male"] as const;

const METRIC_TYPES = ["views", "interactions", "likes", "comments", "reposts", "shares", "saves", "replies"] as const;
const AUDIENCE_TYPES = ["followers", "non_followers"] as const;
const CONTENT_TYPES = ["reels", "posts", "stories"] as const;

const BRAZIL_UF_CODES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/**
 * Campos escalares de `daily_metrics` (nível "dia", sem quebra por tipo de conteúdo).
 * As métricas por tipo de conteúdo (views/interactions/likes/comments/reposts/shares/
 * saves/replies × reels/posts/stories × followers/non_followers) vivem em
 * `content_type_metrics` — ver validateContentTypeMetrics/handlePost/handlePatch.
 */
const OPTIONAL_METRIC_INT_FIELDS = [
  "reach",
  "interactions",
  "profile_visits",
  "posts_published",
  "views_total",
  "views_from_followers",
  "views_from_non_followers",
  "viewers_total",
  "interactions_from_followers",
  "interactions_from_non_followers",
  "bio_link_taps",
] as const;
type OptionalMetricIntField = (typeof OPTIONAL_METRIC_INT_FIELDS)[number];

const METRIC_COLUMNS = `
  id, account_id, date::text as date, followers, net_follows, reach, interactions, profile_visits,
  posts_published, note, created_at,
  views_total, views_from_followers, views_from_non_followers, viewers_total,
  interactions_from_followers, interactions_from_non_followers, bio_link_taps
`;

interface DailyMetricRow {
  id: string;
  account_id: string;
  date: string;
  followers: number;
  net_follows: number | null;
  reach: number | null;
  interactions: number | null;
  profile_visits: number | null;
  posts_published: number | null;
  note: string | null;
  created_at: string;
  views_total: number | null;
  views_from_followers: number | null;
  views_from_non_followers: number | null;
  viewers_total: number | null;
  interactions_from_followers: number | null;
  interactions_from_non_followers: number | null;
  bio_link_taps: number | null;
}

interface ContentTypeMetricRow {
  metric_type: string;
  audience_type: string;
  content_type: string;
  value: number;
}

interface AudienceLocationInput {
  city: string;
  state: string;
  percent: number;
}
interface AudienceLocationRow {
  city: string;
  state: string | null;
  city_id: string | null;
  percent: number;
}
interface AudienceAgeRangeRow {
  age_range: string;
  gender: string;
  percent: number;
}
interface AudienceGenderRow {
  gender: string;
  percent: number;
}
interface AudienceCountryRow {
  country_code: string;
  country_name: string;
  percent: number;
}
interface Audience {
  locations: AudienceLocationRow[];
  age_ranges: AudienceAgeRangeRow[];
  genders: AudienceGenderRow[];
  countries: AudienceCountryRow[];
}
interface AudienceInput {
  locations: AudienceLocationInput[];
  age_ranges: AudienceAgeRangeRow[];
  genders: AudienceGenderRow[];
  countries: AudienceCountryRow[];
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

function isValidCalendarDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const isLeap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d >= 1 && d <= daysInMonth[m - 1];
}

type IntFieldResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

function validateNonNegInt(value: unknown, label: string, required: boolean): IntFieldResult {
  if (value === undefined || value === null) {
    if (required) {
      return { ok: false, error: `${label} é obrigatório e deve ser um número inteiro maior ou igual a 0.` };
    }
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: `${label} deve ser um número inteiro maior ou igual a 0.` };
  }
  return { ok: true, value };
}

/** Igual a validateNonNegInt, mas aceita negativos — usado só por `net_follows`. */
function validateSignedInt(value: unknown, label: string, required: boolean): IntFieldResult {
  if (value === undefined || value === null) {
    if (required) {
      return { ok: false, error: `${label} é obrigatório e deve ser um número inteiro.` };
    }
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, error: `${label} deve ser um número inteiro.` };
  }
  return { ok: true, value };
}

type TextFieldResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function validateOptionalText(value: unknown, label: string): TextFieldResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} deve ser texto.` };
  const trimmed = value.trim();
  return { ok: true, value: trimmed === "" ? null : trimmed };
}

type PercentFieldResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/** Percentual nativo: número (não string, sem '%'), 0 a 100 inclusive. Banco arredonda para numeric(5,2). */
function validatePercent(value: unknown, label: string): PercentFieldResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${label} deve ser um número entre 0 e 100.` };
  }
  if (value < 0 || value > 100) {
    return { ok: false, error: `${label} deve estar entre 0 e 100.` };
  }
  return { ok: true, value };
}

function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? (err as { code?: unknown }).code as string | undefined
    : undefined;
}

async function parseJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: errorResponse("Corpo da requisição precisa ser JSON válido.", 400) };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, response: errorResponse("Corpo da requisição precisa ser um objeto JSON.", 400) };
  }
  return { ok: true, body: raw as Record<string, unknown> };
}

type ContentTypeMetricsResult =
  | { ok: true; value: ContentTypeMetricRow[] }
  | { ok: false; error: string };

/**
 * `content_type_metrics`: cada item é uma combinação (metric_type, audience_type,
 * content_type) -> value. "TUDO" (agrupador visual do bloco Interações no formulário)
 * nunca vira uma linha aqui — audience_type só aceita 'followers'/'non_followers'.
 */
function validateContentTypeMetrics(raw: unknown): ContentTypeMetricsResult {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "content_type_metrics deve ser uma lista." };
  const seen = new Set<string>();
  const out: ContentTypeMetricRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada item de content_type_metrics deve ser um objeto." };
    }
    const record = item as Record<string, unknown>;
    const metricType = record.metric_type;
    if (typeof metricType !== "string" || !(METRIC_TYPES as readonly string[]).includes(metricType)) {
      return { ok: false, error: `content_type_metrics: 'metric_type' deve ser um de: ${METRIC_TYPES.join(", ")}.` };
    }
    const audienceType = record.audience_type;
    if (typeof audienceType !== "string" || !(AUDIENCE_TYPES as readonly string[]).includes(audienceType)) {
      return { ok: false, error: `content_type_metrics: 'audience_type' deve ser um de: ${AUDIENCE_TYPES.join(", ")}.` };
    }
    const contentType = record.content_type;
    if (typeof contentType !== "string" || !(CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return { ok: false, error: `content_type_metrics: 'content_type' deve ser um de: ${CONTENT_TYPES.join(", ")}.` };
    }
    const key = `${metricType}|${audienceType}|${contentType}`;
    const value = validateNonNegInt(record.value, `content_type_metrics (${key}) value`, true);
    if (!value.ok) return { ok: false, error: value.error };
    if (seen.has(key)) {
      return { ok: false, error: `Combinação duplicada em content_type_metrics: ${key}.` };
    }
    seen.add(key);
    out.push({ metric_type: metricType, audience_type: audienceType, content_type: contentType, value: value.value as number });
  }
  return { ok: true, value: out };
}

type AudienceResult =
  | { ok: true; value: AudienceInput }
  | { ok: false; error: string };

function validateAudienceLocations(raw: unknown): { ok: true; value: AudienceLocationInput[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience.locations deve ser uma lista." };
  const seen = new Set<string>();
  const out: AudienceLocationInput[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada item de audience.locations deve ser um objeto." };
    }
    const record = item as Record<string, unknown>;
    const city = record.city;
    if (typeof city !== "string" || city.trim() === "") {
      return { ok: false, error: "audience.locations: 'city' é obrigatório." };
    }
    const trimmedCity = city.trim();

    const state = record.state;
    if (typeof state !== "string" || state.trim() === "") {
      return { ok: false, error: `audience.locations (${trimmedCity}): 'state' é obrigatório.` };
    }
    const normalizedState = state.trim().toUpperCase();
    if (normalizedState.length !== 2) {
      return { ok: false, error: `audience.locations (${trimmedCity}): 'state' deve ter exatamente 2 letras.` };
    }
    if (!(BRAZIL_UF_CODES as readonly string[]).includes(normalizedState)) {
      return { ok: false, error: `audience.locations (${trimmedCity}): 'state' deve ser uma sigla de UF válida.` };
    }

    const percent = validatePercent(record.percent, `audience.locations (${trimmedCity}) percent`);
    if (!percent.ok) return { ok: false, error: percent.error };
    const key = `${trimmedCity.toLowerCase()}|${normalizedState}`;
    if (seen.has(key)) {
      return { ok: false, error: `Cidade duplicada em audience.locations: ${trimmedCity} (${normalizedState}).` };
    }
    seen.add(key);
    out.push({ city: trimmedCity, state: normalizedState, percent: percent.value });
  }
  return { ok: true, value: out };
}

function validateAudienceAgeRanges(raw: unknown): { ok: true; value: AudienceAgeRangeRow[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience.age_ranges deve ser uma lista." };
  const seen = new Set<string>();
  const out: AudienceAgeRangeRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada item de audience.age_ranges deve ser um objeto." };
    }
    const record = item as Record<string, unknown>;
    const ageRange = record.age_range;
    if (typeof ageRange !== "string" || !(AGE_RANGES as readonly string[]).includes(ageRange)) {
      return { ok: false, error: `audience.age_ranges: 'age_range' deve ser uma de: ${AGE_RANGES.join(", ")}.` };
    }
    const gender = record.gender;
    if (typeof gender !== "string" || !(AGE_RANGE_GENDERS as readonly string[]).includes(gender)) {
      return { ok: false, error: `audience.age_ranges (${ageRange}): 'gender' deve ser um de: ${AGE_RANGE_GENDERS.join(", ")}.` };
    }
    const percent = validatePercent(record.percent, `audience.age_ranges (${ageRange}/${gender}) percent`);
    if (!percent.ok) return { ok: false, error: percent.error };
    const key = `${ageRange}|${gender}`;
    if (seen.has(key)) {
      return { ok: false, error: `Combinação duplicada em audience.age_ranges: ${ageRange} / ${gender}.` };
    }
    seen.add(key);
    out.push({ age_range: ageRange, gender, percent: percent.value });
  }
  return { ok: true, value: out };
}

function validateAudienceGenders(raw: unknown): { ok: true; value: AudienceGenderRow[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience.genders deve ser uma lista." };
  const seen = new Set<string>();
  const out: AudienceGenderRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada item de audience.genders deve ser um objeto." };
    }
    const record = item as Record<string, unknown>;
    const gender = record.gender;
    if (typeof gender !== "string" || !(GENDERS as readonly string[]).includes(gender)) {
      return { ok: false, error: `audience.genders: 'gender' deve ser um de: ${GENDERS.join(", ")}.` };
    }
    const percent = validatePercent(record.percent, `audience.genders (${gender}) percent`);
    if (!percent.ok) return { ok: false, error: percent.error };
    if (seen.has(gender)) {
      return { ok: false, error: `Gênero duplicado em audience.genders: ${gender}.` };
    }
    seen.add(gender);
    out.push({ gender, percent: percent.value });
  }
  return { ok: true, value: out };
}

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

function validateAudienceCountries(raw: unknown): { ok: true; value: AudienceCountryRow[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience.countries deve ser uma lista." };
  const seen = new Set<string>();
  const out: AudienceCountryRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Cada item de audience.countries deve ser um objeto." };
    }
    const record = item as Record<string, unknown>;
    const rawCode = record.country_code;
    if (typeof rawCode !== "string" || rawCode.trim() === "") {
      return { ok: false, error: "audience.countries: 'country_code' é obrigatório." };
    }
    const countryCode = rawCode.trim().toUpperCase();
    if (!COUNTRY_CODE_RE.test(countryCode)) {
      return { ok: false, error: `audience.countries: 'country_code' (${rawCode}) deve ter exatamente 2 letras (ISO 3166-1 alpha-2).` };
    }
    const countryName = record.country_name;
    if (typeof countryName !== "string" || countryName.trim() === "") {
      return { ok: false, error: `audience.countries (${countryCode}): 'country_name' é obrigatório.` };
    }
    const percent = validatePercent(record.percent, `audience.countries (${countryCode}) percent`);
    if (!percent.ok) return { ok: false, error: percent.error };
    if (seen.has(countryCode)) {
      return { ok: false, error: `País duplicado em audience.countries: ${countryCode}.` };
    }
    seen.add(countryCode);
    out.push({ country_code: countryCode, country_name: countryName.trim(), percent: percent.value });
  }
  return { ok: true, value: out };
}

function validateAudience(raw: unknown): AudienceResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: { locations: [], age_ranges: [], genders: [], countries: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "audience deve ser um objeto com locations/age_ranges/genders/countries." };
  }
  const obj = raw as Record<string, unknown>;
  const locations = validateAudienceLocations(obj.locations);
  if (!locations.ok) return locations;
  const ageRanges = validateAudienceAgeRanges(obj.age_ranges);
  if (!ageRanges.ok) return ageRanges;
  const genders = validateAudienceGenders(obj.genders);
  if (!genders.ok) return genders;
  const countries = validateAudienceCountries(obj.countries);
  if (!countries.ok) return countries;
  return { ok: true, value: { locations: locations.value, age_ranges: ageRanges.value, genders: genders.value, countries: countries.value } };
}

function emptyAudience(): Audience {
  return { locations: [], age_ranges: [], genders: [], countries: [] };
}

function withSortedAudience(audience: Audience): Audience {
  return {
    ...audience,
    locations: [...audience.locations].sort((a, b) => b.percent - a.percent),
    countries: [...audience.countries].sort((a, b) => b.percent - a.percent),
  };
}

/**
 * Resolve o id de uma cidade em `cities` a partir de (name, state), criando-a se necessário.
 * O INSERT ... ON CONFLICT ... DO UPDATE garante que o RETURNING sempre devolva o id,
 * mesmo quando outra requisição concorrente já tiver criado a mesma cidade nesse meio-tempo.
 */
async function resolveCityId(sql: ReturnType<typeof neon>, name: string, state: string): Promise<string> {
  const existingRows = await sql`select id from cities where name = ${name} and state = ${state}`;
  if (existingRows.length > 0) {
    return (existingRows as { id: string }[])[0].id;
  }
  const insertedRows = await sql`
    insert into cities (name, state)
    values (${name}, ${state})
    on conflict (name, state) do update set name = excluded.name
    returning id
  `;
  return (insertedRows as { id: string }[])[0].id;
}

async function fetchAudienceForId(sql: ReturnType<typeof neon>, dailyMetricId: string): Promise<Audience> {
  const [locationRows, ageRangeRows, genderRows, countryRows] = await Promise.all([
    sql`
      select al.city, al.city_id, c.state, al.percent::float8 as percent
      from audience_locations al
      left join cities c on c.id = al.city_id
      where al.daily_metric_id = ${dailyMetricId}
      order by al.percent desc
    `,
    sql`select age_range, gender, percent::float8 as percent from audience_age_ranges where daily_metric_id = ${dailyMetricId}`,
    sql`select gender, percent::float8 as percent from audience_genders where daily_metric_id = ${dailyMetricId}`,
    sql`select country_code, country_name, percent::float8 as percent from audience_countries where daily_metric_id = ${dailyMetricId} order by percent desc`,
  ]);
  return {
    locations: locationRows as AudienceLocationRow[],
    age_ranges: ageRangeRows as AudienceAgeRangeRow[],
    genders: genderRows as AudienceGenderRow[],
    countries: countryRows as AudienceCountryRow[],
  };
}

async function fetchContentTypeMetricsForId(sql: ReturnType<typeof neon>, dailyMetricId: string): Promise<ContentTypeMetricRow[]> {
  const rows = await sql`
    select metric_type, audience_type, content_type, value
    from content_type_metrics
    where daily_metric_id = ${dailyMetricId}
  `;
  return rows as ContentTypeMetricRow[];
}

async function handleGet(request: Request, sql: ReturnType<typeof neon>): Promise<Response> {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!accountId) {
    return errorResponse("Parâmetro obrigatório ausente: account_id.", 400);
  }
  if (!UUID_RE.test(accountId)) {
    return errorResponse("account_id inválido: deve ser um UUID.", 400);
  }
  if (from && !DATE_RE.test(from)) {
    return errorResponse("Parâmetro 'from' inválido: use o formato YYYY-MM-DD.", 400);
  }
  if (to && !DATE_RE.test(to)) {
    return errorResponse("Parâmetro 'to' inválido: use o formato YYYY-MM-DD.", 400);
  }

  try {
    const metrics = (await sql`
      select ${sql.unsafe(METRIC_COLUMNS)}
      from daily_metrics
      where account_id = ${accountId}
        and (${from}::date is null or date >= ${from}::date)
        and (${to}::date is null or date <= ${to}::date)
      order by date asc
    `) as DailyMetricRow[];

    const [locationRows, ageRangeRows, genderRows, countryRows, contentTypeRows] = await Promise.all([
      sql`
        select al.daily_metric_id, al.city, al.city_id, c.state, al.percent::float8 as percent
        from audience_locations al
        join daily_metrics dm on dm.id = al.daily_metric_id
        left join cities c on c.id = al.city_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
        order by al.percent desc
      `,
      sql`
        select aar.daily_metric_id, aar.age_range, aar.gender, aar.percent::float8 as percent
        from audience_age_ranges aar
        join daily_metrics dm on dm.id = aar.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
      sql`
        select ag.daily_metric_id, ag.gender, ag.percent::float8 as percent
        from audience_genders ag
        join daily_metrics dm on dm.id = ag.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
      sql`
        select ac.daily_metric_id, ac.country_code, ac.country_name, ac.percent::float8 as percent
        from audience_countries ac
        join daily_metrics dm on dm.id = ac.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
        order by ac.percent desc
      `,
      sql`
        select ctm.daily_metric_id, ctm.metric_type, ctm.audience_type, ctm.content_type, ctm.value
        from content_type_metrics ctm
        join daily_metrics dm on dm.id = ctm.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
    ]);

    const withDetails = metrics.map((m) => ({ ...m, audience: emptyAudience(), content_type_metrics: [] as ContentTypeMetricRow[] }));
    const byId = new Map(withDetails.map((m) => [m.id, m]));
    for (const row of locationRows as Array<{ daily_metric_id: string; city: string; city_id: string | null; state: string | null; percent: number }>) {
      byId.get(row.daily_metric_id)?.audience.locations.push({
        city: row.city,
        state: row.state,
        city_id: row.city_id,
        percent: row.percent,
      });
    }
    for (const row of ageRangeRows as Array<{ daily_metric_id: string; age_range: string; gender: string; percent: number }>) {
      byId.get(row.daily_metric_id)?.audience.age_ranges.push({ age_range: row.age_range, gender: row.gender, percent: row.percent });
    }
    for (const row of genderRows as Array<{ daily_metric_id: string; gender: string; percent: number }>) {
      byId.get(row.daily_metric_id)?.audience.genders.push({ gender: row.gender, percent: row.percent });
    }
    for (const row of countryRows as Array<{ daily_metric_id: string; country_code: string; country_name: string; percent: number }>) {
      byId.get(row.daily_metric_id)?.audience.countries.push({ country_code: row.country_code, country_name: row.country_name, percent: row.percent });
    }
    for (const row of contentTypeRows as Array<{ daily_metric_id: string; metric_type: string; audience_type: string; content_type: string; value: number }>) {
      byId.get(row.daily_metric_id)?.content_type_metrics.push({
        metric_type: row.metric_type,
        audience_type: row.audience_type,
        content_type: row.content_type,
        value: row.value,
      });
    }

    return json({ metrics: withDetails }, 200);
  } catch (err) {
    console.error("Erro ao consultar daily_metrics:", err);
    return errorResponse("Erro ao consultar métricas.", 500);
  }
}

async function handlePost(request: Request, sql: ReturnType<typeof neon>): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const accountId = body.account_id;
  if (typeof accountId !== "string" || !UUID_RE.test(accountId)) {
    return errorResponse("account_id é obrigatório e deve ser um UUID.", 400);
  }

  const date = body.date;
  if (typeof date !== "string" || !isValidCalendarDate(date)) {
    return errorResponse("date é obrigatório e deve ser uma data real no formato YYYY-MM-DD.", 400);
  }

  const followers = validateNonNegInt(body.followers, "followers", true);
  if (!followers.ok) return errorResponse(followers.error, 400);

  const netFollows = validateSignedInt(body.net_follows, "net_follows", false);
  if (!netFollows.ok) return errorResponse(netFollows.error, 400);

  const optionalInts = {} as Record<OptionalMetricIntField, number | null>;
  for (const field of OPTIONAL_METRIC_INT_FIELDS) {
    const result = validateNonNegInt(body[field], field, false);
    if (!result.ok) return errorResponse(result.error, 400);
    optionalInts[field] = result.value;
  }

  const note = validateOptionalText(body.note, "note");
  if (!note.ok) return errorResponse(note.error, 400);

  const contentTypeMetrics = validateContentTypeMetrics(body.content_type_metrics);
  if (!contentTypeMetrics.ok) return errorResponse(contentTypeMetrics.error, 400);

  const audience = validateAudience(body.audience);
  if (!audience.ok) return errorResponse(audience.error, 400);

  try {
    const accountRows = await sql`select id from accounts where id = ${accountId}`;
    if (accountRows.length === 0) {
      return errorResponse("Conta não encontrada.", 404);
    }

    const existing = await sql`
      select id from daily_metrics where account_id = ${accountId} and date = ${date}
    `;
    if (existing.length > 0) {
      return errorResponse(
        "Já existe um registro de métricas para esta conta nesta data.",
        409,
        { existing_id: existing[0].id },
      );
    }

    const newId = randomUUID();
    const o = optionalInts;

    const resolvedLocations: AudienceLocationRow[] = [];
    for (const loc of audience.value.locations) {
      const cityId = await resolveCityId(sql, loc.city, loc.state);
      resolvedLocations.push({
        city: `${loc.city} ${loc.state}`,
        state: loc.state,
        city_id: cityId,
        percent: loc.percent,
      });
    }

    const queries = [
      sql`
        insert into daily_metrics
          (id, account_id, date, followers, net_follows, reach, interactions, profile_visits, posts_published, note,
           views_total, views_from_followers, views_from_non_followers, viewers_total,
           interactions_from_followers, interactions_from_non_followers, bio_link_taps)
        values
          (${newId}, ${accountId}, ${date}, ${followers.value}, ${netFollows.value}, ${o.reach}, ${o.interactions},
           ${o.profile_visits}, ${o.posts_published}, ${note.value},
           ${o.views_total}, ${o.views_from_followers}, ${o.views_from_non_followers}, ${o.viewers_total},
           ${o.interactions_from_followers}, ${o.interactions_from_non_followers}, ${o.bio_link_taps})
        returning ${sql.unsafe(METRIC_COLUMNS)}
      `,
      ...resolvedLocations.map(
        (loc) => sql`insert into audience_locations (daily_metric_id, city, city_id, percent) values (${newId}, ${loc.city}, ${loc.city_id}, ${loc.percent})`,
      ),
      ...audience.value.age_ranges.map(
        (a) => sql`insert into audience_age_ranges (daily_metric_id, age_range, gender, percent) values (${newId}, ${a.age_range}, ${a.gender}, ${a.percent})`,
      ),
      ...audience.value.genders.map(
        (g) => sql`insert into audience_genders (daily_metric_id, gender, percent) values (${newId}, ${g.gender}, ${g.percent})`,
      ),
      ...audience.value.countries.map(
        (c) => sql`insert into audience_countries (daily_metric_id, country_code, country_name, percent) values (${newId}, ${c.country_code}, ${c.country_name}, ${c.percent})`,
      ),
      ...contentTypeMetrics.value.map(
        (m) => sql`insert into content_type_metrics (daily_metric_id, metric_type, audience_type, content_type, value) values (${newId}, ${m.metric_type}, ${m.audience_type}, ${m.content_type}, ${m.value})`,
      ),
    ];

    const results = await sql.transaction(queries);
    const inserted = (results[0] as unknown as DailyMetricRow[])[0];
    const responseAudience: Audience = {
      locations: resolvedLocations,
      age_ranges: audience.value.age_ranges,
      genders: audience.value.genders,
      countries: audience.value.countries,
    };
    return json(
      {
        metric: {
          ...inserted,
          content_type_metrics: contentTypeMetrics.value,
          audience: withSortedAudience(responseAudience),
        },
      },
      201,
    );
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") {
      return errorResponse("Já existe um registro de métricas para esta conta nesta data.", 409);
    }
    if (code === "23503") {
      return errorResponse("Conta não encontrada.", 404);
    }
    if (code === "23514") {
      return errorResponse("Valores informados violam uma restrição do banco (verifique intervalos e sinais).", 400);
    }
    console.error("Erro ao criar registro em daily_metrics:", err);
    return errorResponse("Erro ao criar registro de métricas.", 500);
  }
}

async function handlePatch(request: Request, sql: ReturnType<typeof neon>): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const id = body.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return errorResponse("id é obrigatório e deve ser um UUID.", 400);
  }

  if ("account_id" in body) {
    return errorResponse("account_id não pode ser alterado em um registro existente.", 400);
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  let date: string | undefined;
  if (has("date")) {
    if (typeof body.date !== "string" || !isValidCalendarDate(body.date)) {
      return errorResponse("date deve ser uma data real no formato YYYY-MM-DD.", 400);
    }
    date = body.date;
  }

  let followers: number | undefined;
  if (has("followers")) {
    const result = validateNonNegInt(body.followers, "followers", true);
    if (!result.ok) return errorResponse(result.error, 400);
    followers = result.value as number;
  }

  let netFollowsUpdate: number | null | undefined;
  if (has("net_follows")) {
    const result = validateSignedInt(body.net_follows, "net_follows", false);
    if (!result.ok) return errorResponse(result.error, 400);
    netFollowsUpdate = result.value;
  }

  const optionalIntUpdates = {} as Partial<Record<OptionalMetricIntField, number | null>>;
  for (const field of OPTIONAL_METRIC_INT_FIELDS) {
    if (has(field)) {
      const result = validateNonNegInt(body[field], field, false);
      if (!result.ok) return errorResponse(result.error, 400);
      optionalIntUpdates[field] = result.value;
    }
  }

  let note: string | null | undefined;
  if (has("note")) {
    const result = validateOptionalText(body.note, "note");
    if (!result.ok) return errorResponse(result.error, 400);
    note = result.value;
  }

  let contentTypeMetricsUpdate: ContentTypeMetricRow[] | undefined;
  if (has("content_type_metrics")) {
    const result = validateContentTypeMetrics(body.content_type_metrics);
    if (!result.ok) return errorResponse(result.error, 400);
    contentTypeMetricsUpdate = result.value;
  }

  let audienceUpdate: AudienceInput | undefined;
  if (has("audience")) {
    const result = validateAudience(body.audience);
    if (!result.ok) return errorResponse(result.error, 400);
    audienceUpdate = result.value;
  }

  const hasAnyUpdate =
    date !== undefined ||
    followers !== undefined ||
    netFollowsUpdate !== undefined ||
    note !== undefined ||
    Object.keys(optionalIntUpdates).length > 0 ||
    contentTypeMetricsUpdate !== undefined ||
    audienceUpdate !== undefined;
  if (!hasAnyUpdate) {
    return errorResponse("Nenhum campo para atualizar foi informado.", 400);
  }

  try {
    const currentRows = (await sql`
      select ${sql.unsafe(METRIC_COLUMNS)} from daily_metrics where id = ${id}
    `) as DailyMetricRow[];
    if (currentRows.length === 0) {
      return errorResponse("Registro de métricas não encontrado.", 404);
    }
    const current = currentRows[0];

    const mergedOptionalInts = {} as Record<OptionalMetricIntField, number | null>;
    for (const field of OPTIONAL_METRIC_INT_FIELDS) {
      mergedOptionalInts[field] = has(field) ? (optionalIntUpdates[field] ?? null) : current[field];
    }

    const merged: DailyMetricRow = {
      ...current,
      date: date ?? current.date,
      followers: followers ?? current.followers,
      net_follows: has("net_follows") ? (netFollowsUpdate ?? null) : current.net_follows,
      note: note !== undefined ? note : current.note,
      ...mergedOptionalInts,
    };

    if (merged.date !== current.date) {
      const conflict = await sql`
        select id from daily_metrics
        where account_id = ${current.account_id} and date = ${merged.date} and id != ${id}
      `;
      if (conflict.length > 0) {
        return errorResponse(
          "Já existe outro registro de métricas para esta conta nesta data.",
          409,
          { existing_id: conflict[0].id },
        );
      }
    }

    let resolvedLocations: AudienceLocationRow[] | undefined;
    if (audienceUpdate) {
      resolvedLocations = [];
      for (const loc of audienceUpdate.locations) {
        const cityId = await resolveCityId(sql, loc.city, loc.state);
        resolvedLocations.push({
          city: `${loc.city} ${loc.state}`,
          state: loc.state,
          city_id: cityId,
          percent: loc.percent,
        });
      }
    }

    const m = merged;
    const queries = [
      sql`
        update daily_metrics set
          date = ${m.date},
          followers = ${m.followers},
          net_follows = ${m.net_follows},
          reach = ${m.reach},
          interactions = ${m.interactions},
          profile_visits = ${m.profile_visits},
          posts_published = ${m.posts_published},
          note = ${m.note},
          views_total = ${m.views_total},
          views_from_followers = ${m.views_from_followers},
          views_from_non_followers = ${m.views_from_non_followers},
          viewers_total = ${m.viewers_total},
          interactions_from_followers = ${m.interactions_from_followers},
          interactions_from_non_followers = ${m.interactions_from_non_followers},
          bio_link_taps = ${m.bio_link_taps}
        where id = ${id}
        returning ${sql.unsafe(METRIC_COLUMNS)}
      `,
    ];

    if (audienceUpdate && resolvedLocations) {
      queries.push(
        sql`delete from audience_locations where daily_metric_id = ${id}`,
        sql`delete from audience_age_ranges where daily_metric_id = ${id}`,
        sql`delete from audience_genders where daily_metric_id = ${id}`,
        sql`delete from audience_countries where daily_metric_id = ${id}`,
        ...resolvedLocations.map(
          (loc) => sql`insert into audience_locations (daily_metric_id, city, city_id, percent) values (${id}, ${loc.city}, ${loc.city_id}, ${loc.percent})`,
        ),
        ...audienceUpdate.age_ranges.map(
          (a) => sql`insert into audience_age_ranges (daily_metric_id, age_range, gender, percent) values (${id}, ${a.age_range}, ${a.gender}, ${a.percent})`,
        ),
        ...audienceUpdate.genders.map(
          (g) => sql`insert into audience_genders (daily_metric_id, gender, percent) values (${id}, ${g.gender}, ${g.percent})`,
        ),
        ...audienceUpdate.countries.map(
          (c) => sql`insert into audience_countries (daily_metric_id, country_code, country_name, percent) values (${id}, ${c.country_code}, ${c.country_name}, ${c.percent})`,
        ),
      );
    }

    if (contentTypeMetricsUpdate) {
      queries.push(
        sql`delete from content_type_metrics where daily_metric_id = ${id}`,
        ...contentTypeMetricsUpdate.map(
          (cm) => sql`insert into content_type_metrics (daily_metric_id, metric_type, audience_type, content_type, value) values (${id}, ${cm.metric_type}, ${cm.audience_type}, ${cm.content_type}, ${cm.value})`,
        ),
      );
    }

    const results = await sql.transaction(queries);
    const updated = (results[0] as unknown as DailyMetricRow[])[0];
    const audienceForResponse =
      audienceUpdate && resolvedLocations
        ? withSortedAudience({ locations: resolvedLocations, age_ranges: audienceUpdate.age_ranges, genders: audienceUpdate.genders, countries: audienceUpdate.countries })
        : withSortedAudience(await fetchAudienceForId(sql, id));
    const contentTypeMetricsForResponse = contentTypeMetricsUpdate ?? (await fetchContentTypeMetricsForId(sql, id));
    return json({ metric: { ...updated, content_type_metrics: contentTypeMetricsForResponse, audience: audienceForResponse } }, 200);
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") {
      return errorResponse("Já existe outro registro de métricas para esta conta nesta data.", 409);
    }
    if (code === "23514") {
      return errorResponse("Valores informados violam uma restrição do banco (verifique intervalos e sinais).", 400);
    }
    console.error("Erro ao atualizar daily_metrics:", err);
    return errorResponse("Erro ao atualizar registro de métricas.", 500);
  }
}

/**
 * DELETE não precisa apagar manualmente content_type_metrics/audience_* — todas as
 * tabelas filhas têm `daily_metric_id` com `ON DELETE CASCADE` para `daily_metrics(id)`.
 */
async function handleDelete(request: Request, sql: ReturnType<typeof neon>): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("Parâmetro obrigatório ausente ou inválido: id.", 400);
  }

  try {
    const deleted = await sql`delete from daily_metrics where id = ${id} returning id`;
    if (deleted.length === 0) {
      return errorResponse("Registro de métricas não encontrado.", 404);
    }
    return json({ deleted_id: id }, 200);
  } catch (err) {
    console.error("Erro ao excluir daily_metrics:", err);
    return errorResponse("Erro ao excluir registro de métricas.", 500);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return errorResponse("DATABASE_URL não configurada no servidor.", 500);
    }
    const sql = neon(databaseUrl);

    switch (request.method) {
      case "GET":
        return handleGet(request, sql);
      case "POST":
        return handlePost(request, sql);
      case "PATCH":
        return handlePatch(request, sql);
      case "DELETE":
        return handleDelete(request, sql);
      default:
        return new Response(JSON.stringify({ error: "Método não permitido." }), {
          status: 405,
          headers: { "content-type": "application/json", allow: "GET, POST, PATCH, DELETE" },
        });
    }
  },
};

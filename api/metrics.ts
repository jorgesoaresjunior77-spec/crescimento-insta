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

const OPTIONAL_METRIC_INT_FIELDS = [
  "reach",
  "interactions",
  "profile_visits",
  "posts_published",
  "views_total",
  "views_from_followers",
  "views_from_non_followers",
  "viewers_total",
  "views_stories",
  "views_posts",
  "views_reels",
  "interactions_from_followers",
  "interactions_from_non_followers",
  "replies",
  "shares",
  "likes",
  "comments",
] as const;
type OptionalMetricIntField = (typeof OPTIONAL_METRIC_INT_FIELDS)[number];

const METRIC_COLUMNS = `
  id, account_id, date::text as date, followers, reach, interactions, profile_visits, posts_published, note, created_at,
  views_total, views_from_followers, views_from_non_followers, viewers_total,
  views_stories, views_posts, views_reels,
  interactions_from_followers, interactions_from_non_followers,
  replies, shares, likes, comments
`;

interface DailyMetricRow {
  id: string;
  account_id: string;
  date: string;
  followers: number;
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
  views_stories: number | null;
  views_posts: number | null;
  views_reels: number | null;
  interactions_from_followers: number | null;
  interactions_from_non_followers: number | null;
  replies: number | null;
  shares: number | null;
  likes: number | null;
  comments: number | null;
}

interface AudienceLocationRow {
  city: string;
  followers_count: number;
}
interface AudienceAgeRangeRow {
  age_range: string;
  followers_count: number;
}
interface AudienceGenderRow {
  gender: string;
  followers_count: number;
}
interface Audience {
  locations: AudienceLocationRow[];
  age_ranges: AudienceAgeRangeRow[];
  genders: AudienceGenderRow[];
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

type TextFieldResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function validateOptionalText(value: unknown, label: string): TextFieldResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} deve ser texto.` };
  const trimmed = value.trim();
  return { ok: true, value: trimmed === "" ? null : trimmed };
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

type AudienceResult =
  | { ok: true; value: Audience }
  | { ok: false; error: string };

function validateAudienceLocations(raw: unknown): { ok: true; value: AudienceLocationRow[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience.locations deve ser uma lista." };
  const seen = new Set<string>();
  const out: AudienceLocationRow[] = [];
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
    const count = validateNonNegInt(record.followers_count, `audience.locations (${trimmedCity}) followers_count`, true);
    if (!count.ok) return { ok: false, error: count.error };
    const key = trimmedCity.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Cidade duplicada em audience.locations: ${trimmedCity}.` };
    }
    seen.add(key);
    out.push({ city: trimmedCity, followers_count: count.value as number });
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
    const count = validateNonNegInt(record.followers_count, `audience.age_ranges (${ageRange}) followers_count`, true);
    if (!count.ok) return { ok: false, error: count.error };
    if (seen.has(ageRange)) {
      return { ok: false, error: `Faixa etária duplicada em audience.age_ranges: ${ageRange}.` };
    }
    seen.add(ageRange);
    out.push({ age_range: ageRange, followers_count: count.value as number });
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
    const count = validateNonNegInt(record.followers_count, `audience.genders (${gender}) followers_count`, true);
    if (!count.ok) return { ok: false, error: count.error };
    if (seen.has(gender)) {
      return { ok: false, error: `Gênero duplicado em audience.genders: ${gender}.` };
    }
    seen.add(gender);
    out.push({ gender, followers_count: count.value as number });
  }
  return { ok: true, value: out };
}

function validateAudience(raw: unknown): AudienceResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: { locations: [], age_ranges: [], genders: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "audience deve ser um objeto com locations/age_ranges/genders." };
  }
  const obj = raw as Record<string, unknown>;
  const locations = validateAudienceLocations(obj.locations);
  if (!locations.ok) return locations;
  const ageRanges = validateAudienceAgeRanges(obj.age_ranges);
  if (!ageRanges.ok) return ageRanges;
  const genders = validateAudienceGenders(obj.genders);
  if (!genders.ok) return genders;
  return { ok: true, value: { locations: locations.value, age_ranges: ageRanges.value, genders: genders.value } };
}

function emptyAudience(): Audience {
  return { locations: [], age_ranges: [], genders: [] };
}

async function fetchAudienceForId(sql: ReturnType<typeof neon>, dailyMetricId: string): Promise<Audience> {
  const [locationRows, ageRangeRows, genderRows] = await Promise.all([
    sql`select city, followers_count from audience_locations where daily_metric_id = ${dailyMetricId}`,
    sql`select age_range, followers_count from audience_age_ranges where daily_metric_id = ${dailyMetricId}`,
    sql`select gender, followers_count from audience_genders where daily_metric_id = ${dailyMetricId}`,
  ]);
  return {
    locations: locationRows as AudienceLocationRow[],
    age_ranges: ageRangeRows as AudienceAgeRangeRow[],
    genders: genderRows as AudienceGenderRow[],
  };
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

    const [locationRows, ageRangeRows, genderRows] = await Promise.all([
      sql`
        select al.daily_metric_id, al.city, al.followers_count
        from audience_locations al
        join daily_metrics dm on dm.id = al.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
      sql`
        select aar.daily_metric_id, aar.age_range, aar.followers_count
        from audience_age_ranges aar
        join daily_metrics dm on dm.id = aar.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
      sql`
        select ag.daily_metric_id, ag.gender, ag.followers_count
        from audience_genders ag
        join daily_metrics dm on dm.id = ag.daily_metric_id
        where dm.account_id = ${accountId}
          and (${from}::date is null or dm.date >= ${from}::date)
          and (${to}::date is null or dm.date <= ${to}::date)
      `,
    ]);

    const withAudience = metrics.map((m) => ({ ...m, audience: emptyAudience() }));
    const byId = new Map(withAudience.map((m) => [m.id, m]));
    for (const row of locationRows as Array<{ daily_metric_id: string; city: string; followers_count: number }>) {
      byId.get(row.daily_metric_id)?.audience.locations.push({ city: row.city, followers_count: row.followers_count });
    }
    for (const row of ageRangeRows as Array<{ daily_metric_id: string; age_range: string; followers_count: number }>) {
      byId.get(row.daily_metric_id)?.audience.age_ranges.push({ age_range: row.age_range, followers_count: row.followers_count });
    }
    for (const row of genderRows as Array<{ daily_metric_id: string; gender: string; followers_count: number }>) {
      byId.get(row.daily_metric_id)?.audience.genders.push({ gender: row.gender, followers_count: row.followers_count });
    }

    return json({ metrics: withAudience }, 200);
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

  const optionalInts = {} as Record<OptionalMetricIntField, number | null>;
  for (const field of OPTIONAL_METRIC_INT_FIELDS) {
    const result = validateNonNegInt(body[field], field, false);
    if (!result.ok) return errorResponse(result.error, 400);
    optionalInts[field] = result.value;
  }

  const note = validateOptionalText(body.note, "note");
  if (!note.ok) return errorResponse(note.error, 400);

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

    const queries = [
      sql`
        insert into daily_metrics
          (id, account_id, date, followers, reach, interactions, profile_visits, posts_published, note,
           views_total, views_from_followers, views_from_non_followers, viewers_total,
           views_stories, views_posts, views_reels,
           interactions_from_followers, interactions_from_non_followers,
           replies, shares, likes, comments)
        values
          (${newId}, ${accountId}, ${date}, ${followers.value}, ${o.reach}, ${o.interactions},
           ${o.profile_visits}, ${o.posts_published}, ${note.value},
           ${o.views_total}, ${o.views_from_followers}, ${o.views_from_non_followers}, ${o.viewers_total},
           ${o.views_stories}, ${o.views_posts}, ${o.views_reels},
           ${o.interactions_from_followers}, ${o.interactions_from_non_followers},
           ${o.replies}, ${o.shares}, ${o.likes}, ${o.comments})
        returning ${sql.unsafe(METRIC_COLUMNS)}
      `,
      ...audience.value.locations.map(
        (loc) => sql`insert into audience_locations (daily_metric_id, city, followers_count) values (${newId}, ${loc.city}, ${loc.followers_count})`,
      ),
      ...audience.value.age_ranges.map(
        (a) => sql`insert into audience_age_ranges (daily_metric_id, age_range, followers_count) values (${newId}, ${a.age_range}, ${a.followers_count})`,
      ),
      ...audience.value.genders.map(
        (g) => sql`insert into audience_genders (daily_metric_id, gender, followers_count) values (${newId}, ${g.gender}, ${g.followers_count})`,
      ),
    ];

    const results = await sql.transaction(queries);
    const inserted = (results[0] as unknown as DailyMetricRow[])[0];
    return json({ metric: { ...inserted, audience: audience.value } }, 201);
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") {
      return errorResponse("Já existe um registro de métricas para esta conta nesta data.", 409);
    }
    if (code === "23503") {
      return errorResponse("Conta não encontrada.", 404);
    }
    if (code === "23514") {
      return errorResponse("Valores informados violam uma restrição do banco (verifique se não há números negativos).", 400);
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

  let audienceUpdate: Audience | undefined;
  if (has("audience")) {
    const result = validateAudience(body.audience);
    if (!result.ok) return errorResponse(result.error, 400);
    audienceUpdate = result.value;
  }

  const hasAnyUpdate =
    date !== undefined ||
    followers !== undefined ||
    note !== undefined ||
    Object.keys(optionalIntUpdates).length > 0 ||
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

    const m = merged;
    const queries = [
      sql`
        update daily_metrics set
          date = ${m.date},
          followers = ${m.followers},
          reach = ${m.reach},
          interactions = ${m.interactions},
          profile_visits = ${m.profile_visits},
          posts_published = ${m.posts_published},
          note = ${m.note},
          views_total = ${m.views_total},
          views_from_followers = ${m.views_from_followers},
          views_from_non_followers = ${m.views_from_non_followers},
          viewers_total = ${m.viewers_total},
          views_stories = ${m.views_stories},
          views_posts = ${m.views_posts},
          views_reels = ${m.views_reels},
          interactions_from_followers = ${m.interactions_from_followers},
          interactions_from_non_followers = ${m.interactions_from_non_followers},
          replies = ${m.replies},
          shares = ${m.shares},
          likes = ${m.likes},
          comments = ${m.comments}
        where id = ${id}
        returning ${sql.unsafe(METRIC_COLUMNS)}
      `,
    ];

    if (audienceUpdate) {
      queries.push(
        sql`delete from audience_locations where daily_metric_id = ${id}`,
        sql`delete from audience_age_ranges where daily_metric_id = ${id}`,
        sql`delete from audience_genders where daily_metric_id = ${id}`,
        ...audienceUpdate.locations.map(
          (loc) => sql`insert into audience_locations (daily_metric_id, city, followers_count) values (${id}, ${loc.city}, ${loc.followers_count})`,
        ),
        ...audienceUpdate.age_ranges.map(
          (a) => sql`insert into audience_age_ranges (daily_metric_id, age_range, followers_count) values (${id}, ${a.age_range}, ${a.followers_count})`,
        ),
        ...audienceUpdate.genders.map(
          (g) => sql`insert into audience_genders (daily_metric_id, gender, followers_count) values (${id}, ${g.gender}, ${g.followers_count})`,
        ),
      );
    }

    const results = await sql.transaction(queries);
    const updated = (results[0] as unknown as DailyMetricRow[])[0];
    const audienceForResponse = audienceUpdate ?? (await fetchAudienceForId(sql, id));
    return json({ metric: { ...updated, audience: audienceForResponse } }, 200);
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") {
      return errorResponse("Já existe outro registro de métricas para esta conta nesta data.", 409);
    }
    if (code === "23514") {
      return errorResponse("Valores informados violam uma restrição do banco (verifique se não há números negativos).", 400);
    }
    console.error("Erro ao atualizar daily_metrics:", err);
    return errorResponse("Erro ao atualizar registro de métricas.", 500);
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
      default:
        return new Response(JSON.stringify({ error: "Método não permitido." }), {
          status: 405,
          headers: { "content-type": "application/json", allow: "GET, POST, PATCH" },
        });
    }
  },
};

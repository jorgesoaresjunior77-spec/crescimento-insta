import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const METRIC_COLUMNS =
  "id, account_id, date::text as date, followers, reach, interactions, profile_visits, posts_published, note, created_at";

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
    const metrics = await sql`
      select ${sql.unsafe(METRIC_COLUMNS)}
      from daily_metrics
      where account_id = ${accountId}
        and (${from}::date is null or date >= ${from}::date)
        and (${to}::date is null or date <= ${to}::date)
      order by date asc
    `;
    return json({ metrics }, 200);
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

  const reach = validateNonNegInt(body.reach, "reach", false);
  if (!reach.ok) return errorResponse(reach.error, 400);

  const interactions = validateNonNegInt(body.interactions, "interactions", false);
  if (!interactions.ok) return errorResponse(interactions.error, 400);

  const profileVisits = validateNonNegInt(body.profile_visits, "profile_visits", false);
  if (!profileVisits.ok) return errorResponse(profileVisits.error, 400);

  const postsPublished = validateNonNegInt(body.posts_published, "posts_published", false);
  if (!postsPublished.ok) return errorResponse(postsPublished.error, 400);

  const note = validateOptionalText(body.note, "note");
  if (!note.ok) return errorResponse(note.error, 400);

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

    const inserted = await sql`
      insert into daily_metrics
        (account_id, date, followers, reach, interactions, profile_visits, posts_published, note)
      values
        (${accountId}, ${date}, ${followers.value}, ${reach.value}, ${interactions.value},
         ${profileVisits.value}, ${postsPublished.value}, ${note.value})
      returning ${sql.unsafe(METRIC_COLUMNS)}
    `;
    return json({ metric: (inserted as DailyMetricRow[])[0] }, 201);
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

  const optionalIntFields: Array<["reach" | "interactions" | "profile_visits" | "posts_published", string]> = [
    ["reach", "reach"],
    ["interactions", "interactions"],
    ["profile_visits", "profile_visits"],
    ["posts_published", "posts_published"],
  ];
  const optionalIntUpdates: Partial<Record<string, number | null>> = {};
  for (const [key, label] of optionalIntFields) {
    if (has(key)) {
      const result = validateNonNegInt(body[key], label, false);
      if (!result.ok) return errorResponse(result.error, 400);
      optionalIntUpdates[key] = result.value;
    }
  }

  let note: string | null | undefined;
  if (has("note")) {
    const result = validateOptionalText(body.note, "note");
    if (!result.ok) return errorResponse(result.error, 400);
    note = result.value;
  }

  const hasAnyUpdate =
    date !== undefined ||
    followers !== undefined ||
    note !== undefined ||
    Object.keys(optionalIntUpdates).length > 0;
  if (!hasAnyUpdate) {
    return errorResponse("Nenhum campo para atualizar foi informado.", 400);
  }

  try {
    const currentRows = await sql`
      select ${sql.unsafe(METRIC_COLUMNS)} from daily_metrics where id = ${id}
    `;
    if (currentRows.length === 0) {
      return errorResponse("Registro de métricas não encontrado.", 404);
    }
    const current = (currentRows as DailyMetricRow[])[0];

    const merged: DailyMetricRow = {
      ...current,
      date: date ?? current.date,
      followers: followers ?? current.followers,
      reach: has("reach") ? (optionalIntUpdates.reach ?? null) : current.reach,
      interactions: has("interactions") ? (optionalIntUpdates.interactions ?? null) : current.interactions,
      profile_visits: has("profile_visits") ? (optionalIntUpdates.profile_visits ?? null) : current.profile_visits,
      posts_published: has("posts_published") ? (optionalIntUpdates.posts_published ?? null) : current.posts_published,
      note: note !== undefined ? note : current.note,
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

    const updated = await sql`
      update daily_metrics set
        date = ${merged.date},
        followers = ${merged.followers},
        reach = ${merged.reach},
        interactions = ${merged.interactions},
        profile_visits = ${merged.profile_visits},
        posts_published = ${merged.posts_published},
        note = ${merged.note}
      where id = ${id}
      returning ${sql.unsafe(METRIC_COLUMNS)}
    `;
    return json({ metric: (updated as DailyMetricRow[])[0] }, 200);
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

export default async function handler(request: Request): Promise<Response> {
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
}

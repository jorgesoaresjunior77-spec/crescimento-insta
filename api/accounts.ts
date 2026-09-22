import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCOUNT_COLUMNS = "id, name, follower_goal, created_at";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function handleGet(sql: ReturnType<typeof neon>): Promise<Response> {
  try {
    const accounts = await sql`
      select ${sql.unsafe(ACCOUNT_COLUMNS)}
      from accounts
      order by created_at asc
    `;
    return json({ accounts }, 200);
  } catch (err) {
    console.error("Erro ao consultar accounts:", err);
    return errorResponse("Erro ao consultar contas.", 500);
  }
}

async function handlePatch(request: Request, sql: ReturnType<typeof neon>): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Corpo da requisição precisa ser JSON válido.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("Corpo da requisição precisa ser um objeto JSON.", 400);
  }
  const record = body as Record<string, unknown>;

  const id = record.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return errorResponse("id é obrigatório e deve ser um UUID.", 400);
  }

  if (!Object.prototype.hasOwnProperty.call(record, "follower_goal")) {
    return errorResponse("Nenhum campo para atualizar foi informado.", 400);
  }

  const rawGoal = record.follower_goal;
  let followerGoal: number | null;
  if (rawGoal === null) {
    followerGoal = null;
  } else if (typeof rawGoal === "number" && Number.isInteger(rawGoal) && rawGoal >= 0) {
    followerGoal = rawGoal;
  } else {
    return errorResponse("follower_goal deve ser um número inteiro maior ou igual a 0, ou null.", 400);
  }

  try {
    const updated = await sql`
      update accounts set follower_goal = ${followerGoal}
      where id = ${id}
      returning ${sql.unsafe(ACCOUNT_COLUMNS)}
    `;
    if (updated.length === 0) {
      return errorResponse("Conta não encontrada.", 404);
    }
    return json({ account: updated[0] }, 200);
  } catch (err) {
    console.error("Erro ao atualizar accounts:", err);
    return errorResponse("Erro ao atualizar conta.", 500);
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
        return handleGet(sql);
      case "PATCH":
        return handlePatch(request, sql);
      default:
        return new Response(JSON.stringify({ error: "Método não permitido." }), {
          status: 405,
          headers: { "content-type": "application/json", allow: "GET, PATCH" },
        });
    }
  },
};

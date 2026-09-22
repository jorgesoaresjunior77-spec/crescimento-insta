import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      {
        status: 405,
        headers: { "content-type": "application/json", allow: "GET" },
      }
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(
      JSON.stringify({ error: "DATABASE_URL não configurada no servidor." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const sql = neon(databaseUrl);
    const accounts = await sql`
      select id, name, follower_goal, created_at
      from accounts
      order by created_at asc
    `;
    return new Response(JSON.stringify({ accounts }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Erro ao consultar accounts:", err);
    return new Response(
      JSON.stringify({ error: "Erro ao consultar contas." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

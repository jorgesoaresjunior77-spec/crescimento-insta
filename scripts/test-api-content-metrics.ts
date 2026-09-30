/**
 * Smoke test da API nova (content_type_metrics com audience_type obrigatório só para
 * views/interactions + audiência percentual) contra a branch de TESTE do Neon, via
 * HTTP real (mesmo caminho de código de produção).
 *
 * Pré-requisito: scripts/dev-api-server.ts rodando com
 *   DEV_ENV_FILE=.env.test-branch.local npx tsx scripts/dev-api-server.ts
 *
 * Uso:
 *   npx tsx scripts/test-api-content-metrics.ts
 *
 * Cria 2 registros de daily_metrics de teste (datas 2099-01-01/02, fora de qualquer
 * uso real), exercita GET/POST/PATCH/DELETE, e no final apaga os dois — não deixa
 * nenhum dado residual na branch de teste.
 */

const BASE = "http://localhost:3001";

const AUDIENCE_SPLIT_METRIC_TYPES = ["views", "interactions"] as const;
const AUDIENCE_TYPES = ["followers", "non_followers"] as const;
const SIMPLE_METRIC_TYPES = ["likes", "comments", "reposts", "shares", "saves", "replies"] as const;
const CONTENT_TYPES = ["reels", "posts", "stories"] as const;

function allContentTypeMetrics(baseValue: number) {
  const out: { metric_type: string; audience_type: string | null; content_type: string; value: number }[] = [];
  let i = 0;
  for (const metric_type of AUDIENCE_SPLIT_METRIC_TYPES) {
    for (const audience_type of AUDIENCE_TYPES) {
      for (const content_type of CONTENT_TYPES) {
        out.push({ metric_type, audience_type, content_type, value: baseValue + i });
        i++;
      }
    }
  }
  for (const metric_type of SIMPLE_METRIC_TYPES) {
    for (const content_type of CONTENT_TYPES) {
      out.push({ metric_type, audience_type: null, content_type, value: baseValue + i });
      i++;
    }
  }
  return out; // (2 metric_types * 2 audience_types * 3 content_types) + (6 metric_types * 3 content_types) = 12 + 18 = 30
}

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FALHOU: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function main() {
  console.log("== 1) GET /api/accounts ==");
  const accountsRes = await fetch(`${BASE}/api/accounts`);
  const accountsBody = (await accountsRes.json()) as { accounts: { id: string; name: string }[] };
  assert(accountsRes.ok, "GET /api/accounts respondeu 200");
  assert(accountsBody.accounts.length > 0, "existe ao menos 1 conta na branch de teste");
  const accountId = accountsBody.accounts[0].id;
  console.log(`   conta usada: ${accountsBody.accounts[0].name} (${accountId})`);

  console.log("\n== 2) POST daily_metric #1 (net_follows positivo, 30 combinações de content_type_metrics) ==");
  const metric1Payload = {
    account_id: accountId,
    date: "2099-01-01",
    followers: 12500,
    net_follows: 1250,
    bio_link_taps: 340,
    interactions: 900,
    profile_visits: 500,
    views_total: 20000,
    viewers_total: 18000,
    content_type_metrics: allContentTypeMetrics(10),
    audience: {
      genders: [
        { gender: "female", percent: 62.5 },
        { gender: "male", percent: 35 }, // soma proposital != 100, API não deve bloquear
      ],
      age_ranges: [
        { age_range: "18-24", gender: "female", percent: 18.3 },
        { age_range: "18-24", gender: "male", percent: 12.5 },
        { age_range: "25-34", gender: "female", percent: 25.8 },
        { age_range: "25-34", gender: "male", percent: 21.4 },
      ],
      locations: [
        { city: "Lajeado", state: "RS", percent: 74.9 },
        { city: "Arroio do Meio", state: "RS", percent: 10.2 },
      ],
      countries: [
        { country_code: "br", country_name: "Brasil", percent: 92.5 }, // minúsculo de propósito: testa normalização p/ uppercase
        { country_code: "AR", country_name: "Argentina", percent: 3.2 },
      ],
    },
  };
  const post1Res = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metric1Payload),
  });
  const post1Body = (await post1Res.json()) as { metric?: Record<string, unknown>; error?: string };
  assert(post1Res.status === 201, `POST metric #1 -> 201 (recebido ${post1Res.status}: ${post1Body.error ?? ""})`);
  const metric1 = post1Body.metric as Record<string, unknown>;
  const metric1Id = metric1?.id as string;
  assert(typeof metric1Id === "string", "metric #1 tem id");
  assert(metric1?.net_follows === 1250, `net_follows positivo preservado (${metric1?.net_follows})`);
  assert(metric1?.bio_link_taps === 340, `bio_link_taps preservado (${metric1?.bio_link_taps})`);
  assert(metric1?.viewers_total === 18000, `viewers_total preservado (${metric1?.viewers_total})`);
  assert(metric1?.views_total === 20000, `views_total preservado (${metric1?.views_total})`);
  assert(metric1?.interactions === 900, `interactions preservado (${metric1?.interactions})`);
  assert(metric1?.profile_visits === 500, `profile_visits preservado (${metric1?.profile_visits})`);
  const ctm1 = metric1?.content_type_metrics as Array<{ metric_type: string; audience_type: string | null; content_type: string; value: number }>;
  assert(Array.isArray(ctm1) && ctm1.length === 30, `content_type_metrics retornou 30 combinações (recebeu ${ctm1?.length})`);
  const ctm1ViewsRows = (ctm1 ?? []).filter((r) => r.metric_type === "views");
  assert(ctm1ViewsRows.length === 6 && ctm1ViewsRows.every((r) => r.audience_type === "followers" || r.audience_type === "non_followers"), "views: 6 linhas, todas com audience_type preenchido");
  const ctm1LikesRows = (ctm1 ?? []).filter((r) => r.metric_type === "likes");
  assert(ctm1LikesRows.length === 3 && ctm1LikesRows.every((r) => r.audience_type === null), "likes: 3 linhas, todas com audience_type null");
  const metric1Countries = (metric1?.audience as Record<string, unknown> | undefined)?.countries as { country_code: string }[] | undefined;
  const countryCodes = (metric1Countries ?? []).map((c) => c.country_code);
  assert(countryCodes.includes("BR") && !countryCodes.includes("br"), `country_code normalizado para uppercase (${countryCodes.join(",")})`);

  console.log("\n== 3) POST daily_metric #2 (net_follows negativo) ==");
  const metric2Payload = {
    account_id: accountId,
    date: "2099-01-02",
    followers: 12300,
    net_follows: -1250,
    bio_link_taps: 12,
    content_type_metrics: [
      { metric_type: "likes", content_type: "reels", value: 500 },
      { metric_type: "replies", content_type: "stories", value: 7 },
      { metric_type: "views", audience_type: "followers", content_type: "reels", value: 100 },
    ],
  };
  const post2Res = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metric2Payload),
  });
  const post2Body = (await post2Res.json()) as { metric?: Record<string, unknown>; error?: string };
  assert(post2Res.status === 201, `POST metric #2 -> 201 (recebido ${post2Res.status}: ${post2Body.error ?? ""})`);
  const metric2 = post2Body.metric as Record<string, unknown>;
  const metric2Id = metric2?.id as string;
  assert(metric2?.net_follows === -1250, `net_follows negativo preservado (${metric2?.net_follows})`);

  console.log("\n== 3b) Validações que devem falhar (400) ==");
  const badPercentRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: accountId, date: "2099-01-03", followers: 1, audience: { genders: [{ gender: "female", percent: 150 }] } }),
  });
  assert(badPercentRes.status === 400, `percent > 100 é rejeitado (${badPercentRes.status})`);

  const badCountryRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: accountId, date: "2099-01-04", followers: 1, audience: { countries: [{ country_code: "BRA", country_name: "Brasil", percent: 10 }] } }),
  });
  assert(badCountryRes.status === 400, `country_code de 3 letras é rejeitado (${badCountryRes.status})`);

  const dupCtmRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-05",
      followers: 1,
      content_type_metrics: [
        { metric_type: "views", audience_type: "followers", content_type: "reels", value: 1 },
        { metric_type: "views", audience_type: "followers", content_type: "reels", value: 2 },
      ],
    }),
  });
  assert(dupCtmRes.status === 400, `combinação duplicada em content_type_metrics é rejeitada (${dupCtmRes.status})`);

  const likesWithAudienceRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-06",
      followers: 1,
      content_type_metrics: [{ metric_type: "likes", audience_type: "followers", content_type: "reels", value: 1 }],
    }),
  });
  assert(likesWithAudienceRes.status === 400, `likes + followers é rejeitado (${likesWithAudienceRes.status})`);

  const commentsWithAudienceRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-07",
      followers: 1,
      content_type_metrics: [{ metric_type: "comments", audience_type: "non_followers", content_type: "posts", value: 1 }],
    }),
  });
  assert(commentsWithAudienceRes.status === 400, `comments + non_followers é rejeitado (${commentsWithAudienceRes.status})`);

  const savesWithAudienceRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-08",
      followers: 1,
      content_type_metrics: [{ metric_type: "saves", audience_type: "followers", content_type: "stories", value: 1 }],
    }),
  });
  assert(savesWithAudienceRes.status === 400, `saves + followers é rejeitado (${savesWithAudienceRes.status})`);

  const viewsNoAudienceRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-09",
      followers: 1,
      content_type_metrics: [{ metric_type: "views", content_type: "reels", value: 1 }],
    }),
  });
  assert(viewsNoAudienceRes.status === 400, `views sem audience_type é rejeitado (${viewsNoAudienceRes.status})`);

  const interactionsNoAudienceRes = await fetch(`${BASE}/api/metrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      date: "2099-01-10",
      followers: 1,
      content_type_metrics: [{ metric_type: "interactions", content_type: "posts", value: 1 }],
    }),
  });
  assert(interactionsNoAudienceRes.status === 400, `interactions sem audience_type é rejeitado (${interactionsNoAudienceRes.status})`);

  console.log("\n== 4) GET /api/metrics e conferir os dois registros ==");
  const getRes = await fetch(`${BASE}/api/metrics?account_id=${accountId}&from=2099-01-01&to=2099-01-02`);
  const getBody = (await getRes.json()) as { metrics: Record<string, unknown>[] };
  assert(getRes.ok, "GET /api/metrics respondeu 200");
  assert(getBody.metrics.length === 2, `GET retornou os 2 registros de teste (recebeu ${getBody.metrics.length})`);
  const fetched1 = getBody.metrics.find((m) => m.id === metric1Id);
  assert(Array.isArray(fetched1?.content_type_metrics) && (fetched1!.content_type_metrics as unknown[]).length === 30, "GET: metric #1 preserva as 30 combinações");
  assert(fetched1?.viewers_total === 18000, "GET: metric #1 preserva viewers_total");
  const fetchedAudience1 = fetched1?.audience as Record<string, unknown>;
  assert((fetchedAudience1?.age_ranges as unknown[])?.length === 4, "GET: metric #1 preserva as 4 linhas de faixa etária (2 faixas x 2 gêneros)");
  assert((fetchedAudience1?.locations as { percent: number }[])?.[0]?.percent === 74.9, "GET: cidade top (Lajeado) com percent 74.9 preservado");

  console.log("\n== 5) PATCH metric #1 (novo net_follows, novo content_type_metrics, nova audiência) ==");
  const patchRes = await fetch(`${BASE}/api/metrics`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: metric1Id,
      net_follows: -42,
      content_type_metrics: [
        { metric_type: "saves", content_type: "posts", value: 999 },
        { metric_type: "interactions", audience_type: "non_followers", content_type: "stories", value: 55 },
      ],
      audience: {
        genders: [{ gender: "female", percent: 70 }],
      },
    }),
  });
  const patchBody = (await patchRes.json()) as { metric?: Record<string, unknown>; error?: string };
  assert(patchRes.status === 200, `PATCH metric #1 -> 200 (recebido ${patchRes.status}: ${patchBody.error ?? ""})`);
  const patched = patchBody.metric as Record<string, unknown>;
  assert(patched?.net_follows === -42, `PATCH: net_follows atualizado para -42 (${patched?.net_follows})`);
  const patchedCtm = patched?.content_type_metrics as unknown[];
  assert(patchedCtm?.length === 2, `PATCH: content_type_metrics substituído (agora ${patchedCtm?.length} linhas)`);
  const patchedAudience = patched?.audience as Record<string, unknown>;
  assert((patchedAudience?.genders as unknown[])?.length === 1, "PATCH: audience.genders substituído (agora 1 linha)");
  assert((patchedAudience?.locations as unknown[])?.length === 0, "PATCH: audience.locations não reenviado -> esvaziado (replace-all, igual ao comportamento já existente)");

  console.log("\n== 6) Confere via novo GET ==");
  const getAfterPatchRes = await fetch(`${BASE}/api/metrics?account_id=${accountId}&from=2099-01-01&to=2099-01-01`);
  const getAfterPatchBody = (await getAfterPatchRes.json()) as { metrics: Record<string, unknown>[] };
  const afterPatch = getAfterPatchBody.metrics[0];
  assert(afterPatch?.net_follows === -42, "GET pós-PATCH confirma net_follows = -42");

  console.log("\n== 7) DELETE dos dois registros de teste ==");
  const del1 = await fetch(`${BASE}/api/metrics?id=${metric1Id}`, { method: "DELETE" });
  assert(del1.status === 200, `DELETE metric #1 -> 200 (${del1.status})`);
  const del2 = await fetch(`${BASE}/api/metrics?id=${metric2Id}`, { method: "DELETE" });
  assert(del2.status === 200, `DELETE metric #2 -> 200 (${del2.status})`);

  console.log("\n== 8) GET final: confirma que sumiram ==");
  const getFinalRes = await fetch(`${BASE}/api/metrics?account_id=${accountId}&from=2099-01-01&to=2099-01-02`);
  const getFinalBody = (await getFinalRes.json()) as { metrics: unknown[] };
  assert(getFinalBody.metrics.length === 0, `GET final não retorna mais os registros de teste (recebeu ${getFinalBody.metrics.length})`);

  console.log(`\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`}`);
  console.log(JSON.stringify({ metric1Id, metric2Id }));
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Erro inesperado no script de teste:", err);
  process.exitCode = 1;
});

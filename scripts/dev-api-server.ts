/**
 * Servidor local para desenvolvimento: executa os handlers reais de api/*.ts
 * (os mesmos arquivos usados em produção pela Vercel) contra o Neon real,
 * sem depender do `vercel dev` (que exige login).
 *
 * Uso:
 *   npx tsx scripts/dev-api-server.ts                          (usa .env.local -> production)
 *   DEV_ENV_FILE=.env.test-branch.local npx tsx scripts/dev-api-server.ts   (usa outro arquivo, sem fallback)
 *
 * O vite.config.ts encaminha requisições /api/* para este servidor durante
 * `npm run dev`.
 */
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.DEV_API_PORT ?? 3001);
const envFile = process.env.DEV_ENV_FILE ?? ".env.local";

async function main() {
  process.loadEnvFile(path.join(projectRoot, envFile));

  const { default: accountsHandler } = await import(
    pathToFileURL(path.join(projectRoot, "api/accounts.ts")).href
  );
  const { default: metricsHandler } = await import(
    pathToFileURL(path.join(projectRoot, "api/metrics.ts")).href
  );

  const routes: Record<string, { fetch: (req: Request) => Promise<Response> }> = {
    "/api/accounts": accountsHandler,
    "/api/metrics": metricsHandler,
  };

  const server = http.createServer((nodeReq, nodeRes) => {
    void (async () => {
      const url = new URL(nodeReq.url ?? "/", `http://localhost:${port}`);
      const handler = routes[url.pathname];
      if (!handler) {
        nodeRes.writeHead(404, { "content-type": "application/json" });
        nodeRes.end(JSON.stringify({ error: "Rota não encontrada." }));
        return;
      }
      const hasBody = nodeReq.method !== "GET" && nodeReq.method !== "HEAD";
      const chunks: Buffer[] = [];
      if (hasBody) {
        for await (const chunk of nodeReq) {
          chunks.push(chunk as Buffer);
        }
      }
      const webReq = new Request(url, {
        method: nodeReq.method,
        headers: hasBody ? { "content-type": nodeReq.headers["content-type"] ?? "application/json" } : undefined,
        body: hasBody && chunks.length > 0 ? Buffer.concat(chunks) : undefined,
      });
      const webRes = await handler.fetch(webReq);
      const body = await webRes.text();
      const headers: Record<string, string> = {};
      webRes.headers.forEach((value, key) => {
        headers[key] = value;
      });
      nodeRes.writeHead(webRes.status, headers);
      nodeRes.end(body);
    })();
  });

  server.listen(port, () => {
    console.log(`[dev-api-server] http://localhost:${port} (env: ${envFile})`);
  });
}

main().catch((err: unknown) => {
  console.error("[dev-api-server] falha ao iniciar:", err);
  process.exitCode = 1;
});

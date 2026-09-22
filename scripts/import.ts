/**
 * Importa o backup do app antigo (Crescimento Insta) para o Neon.
 *
 * Uso:
 *   npx tsx scripts/import.ts <caminho-do-backup.json>            (dry-run, não grava nada)
 *   npx tsx scripts/import.ts <caminho-do-backup.json> --commit   (grava no banco)
 *
 * Segurança:
 *   - Reaproveita os IDs originais do backup e usa ON CONFLICT (id) DO NOTHING:
 *     nunca sobrescreve um registro já existente, nunca duplica.
 *   - Sem --commit, apenas mostra o que seria inserido.
 *   - O arquivo de backup é somente lido, nunca modificado.
 *   - Requer que as tabelas `accounts` e `daily_metrics` já existam no Neon.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

type Conta = {
  id: string;
  criado_em: string;
  nome: string;
  meta_seguidores: number | null;
};

type Registro = {
  id: string;
  criado_em: string;
  conta_id: string;
  data: string;
  seguidores: number;
  alcance: number | null;
  interacoes: number | null;
  visitas_perfil: number | null;
  posts: number | null;
  nota: string | null;
};

type Backup = { contas: Conta[]; registros: Registro[] };

function validarBackup(obj: unknown): asserts obj is Backup {
  if (
    !obj ||
    typeof obj !== "object" ||
    !Array.isArray((obj as Backup).contas) ||
    !Array.isArray((obj as Backup).registros)
  ) {
    throw new Error("Formato de backup inválido: esperado { contas: [], registros: [] }");
  }
}

async function main() {
  const [, , caminhoArquivo, flag] = process.argv;
  const commit = flag === "--commit";

  if (!caminhoArquivo) {
    console.error("Uso: npx tsx scripts/import.ts <backup.json> [--commit]");
    process.exit(1);
  }

  const bruto = readFileSync(caminhoArquivo, "utf-8");
  const backup: unknown = JSON.parse(bruto);
  validarBackup(backup);

  console.log(`Backup lido: ${backup.contas.length} conta(s), ${backup.registros.length} registro(s).`);
  console.log(commit ? "MODO: gravação real (--commit)" : "MODO: dry-run (nada será gravado)");
  console.log("");

  for (const c of backup.contas) {
    console.log(`  [accounts] ${c.nome} (id=${c.id}, meta=${c.meta_seguidores ?? "—"})`);
  }
  for (const r of backup.registros) {
    console.log(
      `  [daily_metrics] ${r.data} — ${r.seguidores} seguidores (conta_id=${r.conta_id}, id=${r.id})`
    );
  }

  if (!commit) {
    console.log("\nDry-run concluído. Nenhum dado foi gravado. Rode com --commit para gravar de verdade.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida (verifique .env.local).");
  }
  const sql = neon(databaseUrl);

  let inseridos = { accounts: 0, daily_metrics: 0 };

  for (const c of backup.contas) {
    const rows = await sql`
      insert into accounts (id, name, follower_goal, created_at)
      values (${c.id}, ${c.nome}, ${c.meta_seguidores}, ${c.criado_em})
      on conflict (id) do nothing
      returning id
    `;
    if (rows.length > 0) inseridos.accounts++;
  }

  for (const r of backup.registros) {
    const rows = await sql`
      insert into daily_metrics
        (id, account_id, date, followers, reach, interactions, profile_visits, posts_published, note, created_at)
      values
        (${r.id}, ${r.conta_id}, ${r.data}, ${r.seguidores}, ${r.alcance}, ${r.interacoes}, ${r.visitas_perfil}, ${r.posts}, ${r.nota}, ${r.criado_em})
      on conflict (id) do nothing
      returning id
    `;
    if (rows.length > 0) inseridos.daily_metrics++;
  }

  console.log(
    `\nConcluído: ${inseridos.accounts} conta(s) nova(s), ${inseridos.daily_metrics} registro(s) novo(s). ` +
      `Registros já existentes (mesmo id) foram ignorados, não sobrescritos.`
  );
}

main().catch((err) => {
  console.error("Erro na importação:", err);
  process.exit(1);
});

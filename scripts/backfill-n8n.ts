/**
 * Backfill de l'historique depuis le workflow n8n "Memberpress Courses > Slack".
 * Chaque exécution = un email de notification MemberPress dont le snippet contient :
 *   "Student {Nom} has started the course {Cours}"
 *   "Student {Nom} has completed the lesson {Leçon}"
 *   "Student {Nom} has completed the course {Cours}"
 *
 * Lancer : source <scratchpad>/n8n.env && pnpm exec tsx scripts/backfill-n8n.ts
 * Env requis : N8N_URL, N8N_KEY, DATABASE_URL (+ N8N_WORKFLOW_ID optionnel).
 * Idempotent via source_key = "gmail:<message id>".
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const N8N_URL = process.env.N8N_URL!;
const N8N_KEY = process.env.N8N_KEY!;
const WORKFLOW = process.env.N8N_WORKFLOW_ID || "nGhbN1jG5aKDH4gO";
const COURSE_TITLE = "Claude Code pour les équipes Produit";

if (!N8N_URL || !N8N_KEY || !process.env.DATABASE_URL) {
  console.error("Manque N8N_URL / N8N_KEY / DATABASE_URL dans l'environnement.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL!);

const SNIPPET = /Student (.+?) has (started|completed) the (course|lesson) (.+?)\.\s/i;

/** epoch ms -> "YYYY-MM-DD HH:MM:SS" en UTC (cohérent avec le webhook MemberPress,
 *  qui envoie ses timestamps en UTC). L'affichage convertit ensuite en Europe/Paris. */
function utcWallClock(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

interface Row {
  event_type: string;
  member_name: string;
  course_title: string;
  lesson_title: string | null;
  occurred_at: string;
  source_key: string;
  raw: unknown;
}

async function fetchAll(): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(N8N_URL + "/api/v1/executions");
    u.searchParams.set("workflowId", WORKFLOW);
    u.searchParams.set("includeData", "true");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { "X-N8N-API-KEY": N8N_KEY } });
    if (!res.ok) throw new Error(`n8n ${res.status} ${await res.text()}`);
    const d = (await res.json()) as { data?: unknown[]; nextCursor?: string };
    for (const e of d.data ?? []) out.push(e);
    cursor = d.nextCursor;
  } while (cursor);
  return out;
}

function toRow(e: any): Row | null {
  let g: any;
  try {
    g = e.data.resultData.runData["Gmail Trigger"][0].data.main[0][0].json;
  } catch {
    return null;
  }
  const subject: string = (g.Subject ?? "").trim();
  const snippet: string = g.snippet ?? "";
  const ms = Number(g.internalDate || 0);
  if (!ms) return null;

  // Le nom du membre est toujours dans le snippet ("Student X has ...").
  const sn = snippet.match(/Student (.+?) has (?:started|completed) the (?:course|lesson)/i);
  const nameFromSnippet = sn ? sn[1].trim() : null;

  const mk = (
    event_type: string,
    member_name: string,
    course_title: string,
    lesson_title: string | null,
  ): Row => ({
    event_type,
    member_name,
    course_title,
    lesson_title,
    occurred_at: utcWallClock(ms),
    source_key: "gmail:" + g.id,
    raw: { source: "n8n-backfill", subject, snippet, internalDate: g.internalDate, gmailId: g.id },
  });

  // On lit le titre depuis le SUJET (complet, non tronqué contrairement au snippet).
  let m = subject.match(/^(.+?) Started Course:\s*(.+)$/i);
  if (m) return mk("course_started", m[1].trim(), m[2].trim(), null);

  m = subject.match(/^(.+?)\s*-\s*A User Has Completed a Lesson$/i);
  if (m) return mk("lesson_completed", nameFromSnippet ?? "?", COURSE_TITLE, m[1].trim());

  m = subject.match(/^(.+?)\s*-\s*A User Has Completed a Course$/i);
  if (m) return mk("course_completed", nameFromSnippet ?? "?", m[1].trim(), null);

  // Repli : ancien parsing via snippet (titres potentiellement tronqués).
  const m2 = snippet.match(SNIPPET);
  if (m2) {
    const name = m2[1].trim(), verb = m2[2].toLowerCase(), kind = m2[3].toLowerCase(), title = m2[4].trim();
    if (verb === "started" && kind === "course") return mk("course_started", name, title, null);
    if (verb === "completed" && kind === "lesson") return mk("lesson_completed", name, COURSE_TITLE, title);
    if (verb === "completed" && kind === "course") return mk("course_completed", name, title, null);
  }
  return null;
}

async function main() {
  const execs = await fetchAll();
  const rows = execs.map(toRow).filter((r): r is Row => r !== null);
  console.log(`executions: ${execs.length} | events parsables: ${rows.length}`);

  let inserted = 0;
  for (const r of rows) {
    const res = (await sql`
      INSERT INTO events
        (event_type, member_id, member_email, member_name, course_id, course_title,
         lesson_id, lesson_title, occurred_at, raw, source_key)
      VALUES
        (${r.event_type}, NULL, NULL, ${r.member_name}, NULL, ${r.course_title},
         NULL, ${r.lesson_title}, ${r.occurred_at}, ${JSON.stringify(r.raw)}::jsonb, ${r.source_key})
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
      RETURNING id
    `) as unknown[];
    if (res.length) inserted++;
  }
  console.log(`insérés: ${inserted} | déjà présents (ignorés): ${rows.length - inserted}`);

  const sum = (await sql`
    SELECT event_type, count(*) AS n FROM events GROUP BY event_type ORDER BY event_type
  `) as Record<string, unknown>[];
  console.log("base par type:", JSON.stringify(sum));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

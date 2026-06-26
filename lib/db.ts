import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { ParsedEvent, episodeNumber } from "./events";

// Client Neon initialisé paresseusement : évite de lire DATABASE_URL au moment
// de l'import (les imports ESM sont hoistés avant dotenv dans les scripts).
let _sql: NeonQueryFunction<false, false> | null = null;
function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql(strings, ...values);
}

export type Granularity = "day" | "month";

export interface SeriesPoint {
  bucket: string; // 'YYYY-MM-DD' (jour) ou 'YYYY-MM-01' (mois)
  started: number;
  completed: number;
}

export interface FunnelStep {
  lessonId: number | null;
  title: string;
  episode: number | null;
  members: number;
}

export interface Kpis {
  started: number;
  completed: number;
  completionRate: number; // 0..1
  lessonsTracked: number;
}

/** Insertion idempotente d'un évènement (dédup via index unique côté DB). */
export async function insertEvent(e: ParsedEvent, raw: unknown): Promise<void> {
  await sql`
    INSERT INTO events
      (event_type, member_id, member_email, member_name,
       course_id, course_title, lesson_id, lesson_title, occurred_at, raw)
    VALUES
      (${e.eventType}, ${e.memberId}, ${e.memberEmail}, ${e.memberName},
       ${e.courseId}, ${e.courseTitle}, ${e.lessonId}, ${e.lessonTitle},
       ${e.occurredAt}, ${JSON.stringify(raw)}::jsonb)
    ON CONFLICT DO NOTHING
  `;
}

export async function getKpis(): Promise<Kpis> {
  // Identité unifiée : email (webhook) sinon nom (backfill email) sinon id.
  const rows = (await sql`
    SELECT
      count(DISTINCT COALESCE(member_email, member_name, member_id::text))
        FILTER (WHERE event_type = 'course_started')   AS started,
      count(DISTINCT COALESCE(member_email, member_name, member_id::text))
        FILTER (WHERE event_type = 'course_completed') AS completed,
      count(DISTINCT COALESCE(lesson_id::text, lesson_title))
        FILTER (WHERE event_type = 'lesson_completed') AS lessons
    FROM events
  `) as Record<string, unknown>[];

  const started = Number(rows[0]?.started ?? 0);
  const completed = Number(rows[0]?.completed ?? 0);
  return {
    started,
    completed,
    completionRate: started ? completed / started : 0,
    lessonsTracked: Number(rows[0]?.lessons ?? 0),
  };
}

export async function getTimeSeries(granularity: Granularity): Promise<SeriesPoint[]> {
  const rows = (await sql`
    SELECT
      to_char(
        date_trunc(${granularity}, (occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris'),
        'YYYY-MM-DD'
      ) AS bucket,
      count(DISTINCT COALESCE(member_email, member_name, member_id::text))
        FILTER (WHERE event_type = 'course_started')   AS started,
      count(DISTINCT COALESCE(member_email, member_name, member_id::text))
        FILTER (WHERE event_type = 'course_completed') AS completed
    FROM events
    WHERE event_type IN ('course_started', 'course_completed')
    GROUP BY 1
    ORDER BY 1
  `) as Record<string, unknown>[];

  const points: SeriesPoint[] = rows.map((r) => ({
    bucket: String(r.bucket),
    started: Number(r.started),
    completed: Number(r.completed),
  }));

  return fillGaps(points, granularity);
}

export async function getLessonFunnel(): Promise<FunnelStep[]> {
  // On agrège en JS pour unifier webhook (lesson_id) et backfill (lesson_title)
  // sur une clé stable commune : le numéro d'épisode (sinon le titre).
  const rows = (await sql`
    SELECT
      lesson_id,
      lesson_title,
      COALESCE(member_email, member_name, member_id::text) AS who
    FROM events
    WHERE event_type = 'lesson_completed'
  `) as Record<string, unknown>[];

  const groups = new Map<
    string,
    { lessonId: number | null; title: string; episode: number | null; members: Set<string> }
  >();

  for (const r of rows) {
    const title = (r.lesson_title as string) ?? "Leçon";
    const ep = episodeNumber(title);
    const key = ep != null ? `ep:${ep}` : `t:${title}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        lessonId: r.lesson_id == null ? null : Number(r.lesson_id),
        title,
        episode: ep,
        members: new Set<string>(),
      };
      groups.set(key, g);
    }
    if (g.lessonId == null && r.lesson_id != null) g.lessonId = Number(r.lesson_id);
    if (r.who != null) g.members.add(String(r.who));
  }

  const steps: FunnelStep[] = [...groups.values()].map((g) => ({
    lessonId: g.lessonId,
    title: g.title,
    episode: g.episode,
    members: g.members.size,
  }));

  steps.sort((a, b) => {
    if (a.episode != null && b.episode != null) return a.episode - b.episode;
    if (a.episode != null) return -1;
    if (b.episode != null) return 1;
    return a.title.localeCompare(b.title);
  });

  return steps;
}

/** Comble les buckets manquants entre le premier et le dernier point (séries continues). */
function fillGaps(points: SeriesPoint[], g: Granularity): SeriesPoint[] {
  if (points.length === 0) return [];
  const map = new Map(points.map((p) => [p.bucket, p]));
  const result: SeriesPoint[] = [];

  const cur = new Date(`${points[0].bucket}T00:00:00Z`);
  const end = new Date(`${points[points.length - 1].bucket}T00:00:00Z`);

  // Garde-fou : éviter une boucle géante si les données sont aberrantes.
  let guard = 0;
  while (cur <= end && guard < 5000) {
    const key = cur.toISOString().slice(0, 10);
    result.push(map.get(key) ?? { bucket: key, started: 0, completed: 0 });
    if (g === "day") cur.setUTCDate(cur.getUTCDate() + 1);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
    guard++;
  }
  return result;
}

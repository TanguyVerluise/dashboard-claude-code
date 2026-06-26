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
  const rows = (await sql`
    SELECT
      count(DISTINCT member_id) FILTER (WHERE event_type = 'course_started')   AS started,
      count(DISTINCT member_id) FILTER (WHERE event_type = 'course_completed') AS completed,
      count(DISTINCT lesson_id) FILTER (WHERE event_type = 'lesson_completed') AS lessons
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
      to_char(date_trunc(${granularity}, occurred_at), 'YYYY-MM-DD') AS bucket,
      count(DISTINCT member_id) FILTER (WHERE event_type = 'course_started')   AS started,
      count(DISTINCT member_id) FILTER (WHERE event_type = 'course_completed') AS completed
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
  // Regroupé par lesson_id (clé stable) ; le titre peut varier légèrement d'un
  // évènement à l'autre, on retient donc le plus fréquent via mode().
  const rows = (await sql`
    SELECT
      lesson_id,
      mode() WITHIN GROUP (ORDER BY lesson_title) AS lesson_title,
      count(DISTINCT member_id) AS members
    FROM events
    WHERE event_type = 'lesson_completed'
    GROUP BY lesson_id
  `) as Record<string, unknown>[];

  const steps: FunnelStep[] = rows.map((r) => ({
    lessonId: r.lesson_id == null ? null : Number(r.lesson_id),
    title: (r.lesson_title as string) ?? "Leçon",
    episode: episodeNumber((r.lesson_title as string) ?? null),
    members: Number(r.members),
  }));

  steps.sort((a, b) => {
    if (a.episode != null && b.episode != null) return a.episode - b.episode;
    if (a.episode != null) return -1;
    if (b.episode != null) return 1;
    return (a.lessonId ?? 0) - (b.lessonId ?? 0);
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

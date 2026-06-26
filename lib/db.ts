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

// Liste canonique des leçons, dans l'ordre du funnel. Les épisodes sont matchés
// par numéro (robuste aux variations de titre), les autres par motif de titre.
const CANONICAL_LESSONS: {
  label: string;
  episode: number | null;
  test: (title: string, ep: number | null) => boolean;
}[] = [
  {
    label: "Ce que tu vas apprendre dans cette formation",
    episode: null,
    test: (t) => /ce que tu vas apprendre/i.test(t),
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    label: `Épisode ${i + 1}`,
    episode: i + 1,
    test: (_t: string, ep: number | null) => ep === i + 1,
  })),
  {
    label: "Ton avis sur cette formation Claude Code",
    episode: null,
    test: (t) => /ton avis/i.test(t),
  },
  {
    label: "Formation Claude Code - niveau avancé",
    episode: null,
    test: (t) => /niveau avanc/i.test(t),
  },
];

// Index d'« Épisode 10 » dans le funnel : l'atteindre => formation terminée.
const EP10_INDEX = CANONICAL_LESSONS.findIndex((c) => c.episode === 10);

/** Position d'une leçon (par titre) dans la liste canonique, -1 si inconnue. */
function lessonIndex(title: string): number {
  const ep = episodeNumber(title);
  return CANONICAL_LESSONS.findIndex((c) => c.test(title, ep));
}

interface UserState {
  hasStart: boolean;
  startedAt: string | null;   // 1er course_started (UTC "YYYY-MM-DD HH:MM:SS")
  maxLessonIdx: number;       // plus haute leçon canonique atteinte (-1 si aucune)
  completed: boolean;         // formation terminée (réel OU Épisode 10 atteint)
  completedAt: string | null; // date de complétion (UTC)
}

function earlier(a: string | null, b: string): string {
  return a == null || b < a ? b : a;
}

/**
 * État dérivé par utilisateur, avec les règles d'inférence :
 *  - Règle 1 : atteindre Épisode 10 (ou une leçon au-delà) => formation "completed".
 *  - Règle 2 : compléter une leçon implique toutes les leçons qui la précèdent
 *    dans le funnel (on ne retient que maxLessonIdx ; le funnel compte ensuite
 *    les users ayant "au moins atteint" chaque position).
 */
async function loadUserStates(): Promise<Map<string, UserState>> {
  const rows = (await sql`
    SELECT event_type, occurred_at::text AS occurred_at, lesson_title,
           COALESCE(member_email, member_name, member_id::text) AS who
    FROM events
  `) as Record<string, unknown>[];

  type Acc = {
    hasStart: boolean;
    startedAt: string | null;
    maxLessonIdx: number;
    realCompletedAt: string | null;
    reachedEndAt: string | null; // 1re complétion d'une leçon d'index >= EP10_INDEX
  };
  const acc = new Map<string, Acc>();
  const get = (who: string): Acc => {
    let a = acc.get(who);
    if (!a) {
      a = { hasStart: false, startedAt: null, maxLessonIdx: -1, realCompletedAt: null, reachedEndAt: null };
      acc.set(who, a);
    }
    return a;
  };

  for (const r of rows) {
    if (r.who == null) continue;
    const who = String(r.who);
    const at = String(r.occurred_at);
    const a = get(who);
    if (r.event_type === "course_started") {
      a.hasStart = true;
      a.startedAt = earlier(a.startedAt, at);
    } else if (r.event_type === "course_completed") {
      a.realCompletedAt = earlier(a.realCompletedAt, at);
    } else if (r.event_type === "lesson_completed") {
      const idx = lessonIndex((r.lesson_title as string) ?? "");
      if (idx >= 0) {
        if (idx > a.maxLessonIdx) a.maxLessonIdx = idx;
        if (EP10_INDEX >= 0 && idx >= EP10_INDEX) a.reachedEndAt = earlier(a.reachedEndAt, at);
      }
    }
  }

  const out = new Map<string, UserState>();
  for (const [who, a] of acc) {
    const completed = a.realCompletedAt != null || a.reachedEndAt != null;
    const completedAt = completed
      ? [a.realCompletedAt, a.reachedEndAt].filter((x): x is string => x != null).sort()[0]
      : null;
    out.set(who, {
      hasStart: a.hasStart,
      startedAt: a.startedAt,
      maxLessonIdx: a.maxLessonIdx,
      completed,
      completedAt,
    });
  }
  return out;
}

/** "YYYY-MM-DD HH:MM:SS" (UTC) -> bucket en Europe/Paris ('YYYY-MM-DD' jour ou 1er du mois). */
function parisBucket(utc: string, g: Granularity): string {
  const d = new Date(utc.replace(" ", "T") + "Z");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  return g === "day" ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}-01`;
}

export async function getKpis(): Promise<Kpis> {
  const states = [...(await loadUserStates()).values()];
  const started = states.filter((s) => s.hasStart).length;
  const completed = states.filter((s) => s.completed).length;
  // Règle 2 : toute leçon d'index <= maxReached a au moins une complétion.
  const maxReached = states.reduce((m, s) => Math.max(m, s.maxLessonIdx), -1);
  return {
    started,
    completed,
    completionRate: started ? completed / started : 0,
    lessonsTracked: maxReached + 1,
  };
}

export async function getTimeSeries(granularity: Granularity): Promise<SeriesPoint[]> {
  const states = [...(await loadUserStates()).values()];
  const map = new Map<string, SeriesPoint>();
  const bump = (bucket: string, key: "started" | "completed") => {
    let p = map.get(bucket);
    if (!p) {
      p = { bucket, started: 0, completed: 0 };
      map.set(bucket, p);
    }
    p[key]++;
  };
  for (const s of states) {
    if (s.hasStart && s.startedAt) bump(parisBucket(s.startedAt, granularity), "started");
    if (s.completed && s.completedAt) bump(parisBucket(s.completedAt, granularity), "completed");
  }
  const points = [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  return fillGaps(points, granularity);
}

export async function getLessonFunnel(): Promise<FunnelStep[]> {
  const states = [...(await loadUserStates()).values()];
  // Règle 2 : un user ayant atteint l'index i compte pour toutes les leçons <= i.
  return CANONICAL_LESSONS.map((c, i) => ({
    lessonId: null,
    title: c.label,
    episode: c.episode,
    members: states.filter((s) => s.maxLessonIdx >= i).length,
  }));
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
